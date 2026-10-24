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

export class FakeGateway implements PaymentGateway {
    readonly name = 'fake'
    readonly checkouts: CheckoutInput[] = []
    readonly charges: { providerPaymentId: string; amountCents: number; key: string }[] = []
    readonly refunds: { providerRefundId: string; providerPaymentId: string; amountCents: number }[] = []

    private chargeResults = new Map<string, ChargeResult>()
    private refundResults = new Map<string, RefundResult>()
    private queuedChargeFailure: { code: string; definite: boolean } | null = null
    private queuedRefundFailure = false
    private counter = 0

    // The next charge fails. definite: false pretends the outcome is unknown (a timeout).
    failNextCharge(code = 'card_declined', definite = true): void {
        this.queuedChargeFailure = { code, definite }
    }

    failNextRefund(): void {
        this.queuedRefundFailure = true
    }

    async createCustomer(input: { userId: string; email: string; name: string }): Promise<string> {
        return `fake_cus_${input.userId}`
    }

    async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
        this.checkouts.push(input)
        return { sessionId: `fake_cs_${input.billingEventId}`, url: input.successUrl }
    }

    async charge(input: ChargeInput): Promise<ChargeResult> {
        // Same key, same answer, no second charge: this is what a real gateway promises too.
        const previous = this.chargeResults.get(input.idempotencyKey)
        if (previous) return previous

        let result: ChargeResult
        if (this.queuedChargeFailure) {
            const { code, definite } = this.queuedChargeFailure
            this.queuedChargeFailure = null
            result = { ok: false, definite, code, message: `Fake gateway: ${code}` }
        } else {
            const providerPaymentId = `fake_pi_${++this.counter}_${input.idempotencyKey}`
            this.charges.push({ providerPaymentId, amountCents: input.amountCents, key: input.idempotencyKey })
            result = { ok: true, providerPaymentId }
        }
        // Remember successes and clear declines. An unknown outcome is not remembered,
        // so asking again with the same key really tries again, like a real gateway would.
        if (result.ok || result.definite) this.chargeResults.set(input.idempotencyKey, result)
        return result
    }

    async refund(input: RefundInput): Promise<RefundResult> {
        const previous = this.refundResults.get(input.idempotencyKey)
        if (previous) return previous

        let result: RefundResult
        if (this.queuedRefundFailure) {
            this.queuedRefundFailure = false
            return { ok: false, message: 'Fake gateway: the refund failed' }
        } else {
            const providerRefundId = `fake_re_${input.idempotencyKey}`
            this.refunds.push({ providerRefundId, providerPaymentId: input.providerPaymentId, amountCents: input.amountCents })
            result = { ok: true, providerRefundId }
        }
        this.refundResults.set(input.idempotencyKey, result)
        return result
    }

    async getStatus(providerPaymentId: string): Promise<ProviderPaymentStatus> {
        return this.charges.some((c) => c.providerPaymentId === providerPaymentId) ? 'succeeded' : 'pending'
    }

    parseWebhook(rawBody: string): PaymentEvent {
        // No signature to check, so this must never run in production.
        if (process.env.NODE_ENV === 'production') {
            throw new Error('The fake gateway cannot receive webhooks in production')
        }
        return JSON.parse(rawBody) as PaymentEvent
    }
}