import type { OutgoingMessage, SendResult, Sender } from './types'

// A sender that keeps messages in memory. Tests use it so no email or text is ever really sent.
export class FakeSender implements Sender {
    readonly sent: OutgoingMessage[] = []
    private results = new Map<string, SendResult>()
    private queuedFailure: { retryable: boolean } | null = null
    private counter = 0

    constructor(readonly name = 'fake') { }

    // The next send fails. retryable: true pretends the provider was busy.
    failNext(retryable = true): void {
        this.queuedFailure = { retryable }
    }

    async send(message: OutgoingMessage): Promise<SendResult> {
        // Like a real provider with idempotency keys: the same key never sends a second message.
        const previous = this.results.get(message.idempotencyKey)
        if (previous) return previous

        if (this.queuedFailure) {
            const { retryable } = this.queuedFailure
            this.queuedFailure = null
            // Failures are not remembered, so a retry with the same key gets a fresh chance.
            return { ok: false, retryable, error: retryable ? 'Fake sender: temporarily unavailable' : 'Fake sender: rejected' }
        }

        this.sent.push(message)
        const result: SendResult = { ok: true, providerMessageId: `${this.name}_${++this.counter}` }
        this.results.set(message.idempotencyKey, result)
        return result
    }
}