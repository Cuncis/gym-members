export type OutgoingMessage = {
    to: string // an email address, or a phone number in international format (+15551234567)
    subject?: string // email only
    html?: string // email only
    text: string
    // The same key always means the same message. Providers that support it will not send it twice.
    idempotencyKey: string
}

export type SendResult =
    | { ok: true; providerMessageId: string }
    // retryable: true means "trying again later may work" (a timeout, a busy provider).
    // retryable: false means "this will never work" (a bad address, a bad API key).
    | { ok: false; retryable: boolean; error: string }

export interface Sender {
    readonly name: string
    send(message: OutgoingMessage): Promise<SendResult>
}

export type Senders = { email: Sender; sms: Sender }