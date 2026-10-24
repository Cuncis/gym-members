import type Stripe from 'stripe'
import type { PaymentEvent } from './types'

function paymentMethodId(pm: Stripe.PaymentIntent['payment_method']): string | null {
    if (!pm) return null
    return typeof pm === 'string' ? pm : pm.id
}

export function normalizeStripeEvent(event: Stripe.Event): PaymentEvent {
    switch (event.type) {
        case 'payment_intent.succeeded': {
            const intent = event.data.object
            return {
                id: event.id,
                provider: 'stripe',
                type: 'payment.succeeded',
                billingEventId: intent.metadata?.billingEventId || undefined,
                providerPaymentId: intent.id,
                paymentMethodId: paymentMethodId(intent.payment_method),
                amountCents: intent.amount,
            }
        }
        case 'payment_intent.payment_failed': {
            const intent = event.data.object
            return {
                id: event.id,
                provider: 'stripe',
                type: 'payment.failed',
                billingEventId: intent.metadata?.billingEventId || undefined,
                providerPaymentId: intent.id,
                failureMessage: intent.last_payment_error?.message,
            }
        }
        default:
            // Stripe sends many event types. The ones we do not use are acknowledged and ignored.
            return { id: event.id, provider: 'stripe', type: 'ignored' }
    }
}