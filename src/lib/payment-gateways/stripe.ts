import Stripe from 'stripe'
import { normalizeStripeEvent } from './stripe-normalize'
import type {
    ChargeInput,
    ChargeResult,
    CheckoutInput,
    CheckoutResult,
    PaymentEvent,
    PaymentGateway,
    ProviderPaymentStatus,
    RefundInput,
    RefundResult,
} from './types'

let client: Stripe | null = null

function stripe(): Stripe {
    if (client) return client
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    // Practice projects use test keys only.
    if (key.startsWith('sk_live_') && process.env.NODE_ENV !== 'production') {
        throw new Error('Refusing to use a live Stripe key outside production')
    }
    client = new Stripe(key)
    return client
}

export const stripeGateway: PaymentGateway = {
    name: 'stripe',

    async createCustomer({ userId, email, name }) {
        // The idempotency key means two requests at once get the same customer, not two.
        const customer = await stripe().customers.create(
            { email, name, metadata: { userId } },
            { idempotencyKey: `customer:${userId}` },
        )
        return customer.id
    },

    async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
        const session = await stripe().checkout.sessions.create(
            {
                mode: 'payment',
                customer: input.customerId,
                client_reference_id: input.billingEventId,
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: input.currency,
                            unit_amount: input.amountCents,
                            product_data: { name: input.description },
                        },
                    },
                ],
                payment_intent_data: {
                    metadata: { billingEventId: input.billingEventId, membershipId: input.membershipId },
                    // Keep the card on the customer so the billing engine can charge it later.
                    ...(input.savePaymentMethod ? { setup_future_usage: 'off_session' as const } : {}),
                },
                metadata: { billingEventId: input.billingEventId, membershipId: input.membershipId },
                success_url: input.successUrl,
                cancel_url: input.cancelUrl,
                expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // the Checkout page lasts one hour
            },
            { idempotencyKey: `checkout:${input.billingEventId}` },
        )
        if (!session.url) throw new Error('Stripe returned no checkout URL')
        return { sessionId: session.id, url: session.url }
    },

    async charge(input: ChargeInput): Promise<ChargeResult> {
        try {
            const intent = await stripe().paymentIntents.create(
                {
                    amount: input.amountCents,
                    currency: input.currency,
                    customer: input.customerId,
                    payment_method: input.paymentMethodId,
                    off_session: true, // the customer is not here to approve it
                    confirm: true,
                    description: input.description,
                    metadata: input.metadata,
                },
                { idempotencyKey: input.idempotencyKey },
            )
            if (intent.status === 'succeeded') return { ok: true, providerPaymentId: intent.id }
            return {
                ok: false,
                definite: false,
                code: 'unexpected_status',
                message: `The payment is ${intent.status}`,
                providerPaymentId: intent.id,
            }
        } catch (error) {
            if (error instanceof Stripe.errors.StripeCardError) {
                // The card was refused: a clear "no".
                const intent = (error as { payment_intent?: { id?: string } }).payment_intent
                return {
                    ok: false,
                    definite: true,
                    code: error.code ?? 'card_error',
                    message: error.message,
                    providerPaymentId: intent?.id,
                }
            }
            // Anything else (network trouble, a timeout) is an unknown outcome, not a decline.
            return {
                ok: false,
                definite: false,
                code: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    },

    async refund(input: RefundInput): Promise<RefundResult> {
        try {
            const refund = await stripe().refunds.create(
                { payment_intent: input.providerPaymentId, amount: input.amountCents },
                { idempotencyKey: input.idempotencyKey },
            )
            return { ok: true, providerRefundId: refund.id }
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'The refund failed' }
        }
    },

    async getStatus(providerPaymentId: string): Promise<ProviderPaymentStatus> {
        const intent = await stripe().paymentIntents.retrieve(providerPaymentId)
        if (intent.status === 'succeeded') return 'succeeded'
        if (intent.status === 'canceled' || intent.status === 'requires_payment_method') return 'failed'
        return 'pending'
    },

    parseWebhook(rawBody: string, headers: Headers): PaymentEvent {
        const signature = headers.get('stripe-signature')
        const secret = process.env.STRIPE_WEBHOOK_SECRET
        if (!signature || !secret) throw new Error('Missing webhook signature or secret')
        // Throws if the signature does not match the body: a forged request stops here.
        return normalizeStripeEvent(stripe().webhooks.constructEvent(rawBody, signature, secret))
    },
}