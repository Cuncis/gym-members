// What the rest of the app sees. Nothing in here is specific to Stripe.

// A provider's webhook, reduced to what the billing logic cares about.
export type PaymentEvent = {
    id: string // unique per provider, used to ignore repeats
    provider: string
    type: 'payment.succeeded' | 'payment.failed' | 'ignored'
    billingEventId?: string // our own id, carried through the provider as metadata
    providerPaymentId?: string
    paymentMethodId?: string | null
    amountCents?: number
    failureMessage?: string
}

export type CheckoutInput = {
    billingEventId: string
    membershipId: string
    customerId: string
    amountCents: number
    currency: string
    description: string
    savePaymentMethod: boolean // true for recurring plans: keep the card for later charges
    successUrl: string
    cancelUrl: string
}

export type CheckoutResult = { sessionId: string; url: string }

export type ChargeInput = {
    customerId: string
    paymentMethodId: string
    amountCents: number
    currency: string
    description: string
    idempotencyKey: string // the same key always gives the same result and never charges twice
    metadata: Record<string, string>
}

export type ChargeResult =
    | { ok: true; providerPaymentId: string }
    // definite: true means the provider clearly said no (a declined card).
    // definite: false means we do not know what happened (a timeout, a network error).
    | { ok: false; definite: boolean; code: string; message: string; providerPaymentId?: string }

export type RefundInput = {
    providerPaymentId: string
    amountCents: number
    idempotencyKey: string
}

export type RefundResult = { ok: true; providerRefundId: string } | { ok: false; message: string }

export type ProviderPaymentStatus = 'succeeded' | 'failed' | 'pending'

export interface PaymentGateway {
    readonly name: string
    createCustomer(input: { userId: string; email: string; name: string }): Promise<string>
    createCheckout(input: CheckoutInput): Promise<CheckoutResult>
    charge(input: ChargeInput): Promise<ChargeResult>
    refund(input: RefundInput): Promise<RefundResult>
    getStatus(providerPaymentId: string): Promise<ProviderPaymentStatus>
    // Verifies the request is genuine and turns it into a PaymentEvent. Throws if it is not genuine.
    parseWebhook(rawBody: string, headers: Headers): PaymentEvent
}