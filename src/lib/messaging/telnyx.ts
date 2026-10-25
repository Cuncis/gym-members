import type { OutgoingMessage, SendResult, Sender } from './types'

type TelnyxConfig = {
    apiKey: string
    from: string // your Telnyx number in international format, such as +15551234567
    messagingProfileId?: string
    fetchImpl?: typeof fetch // tests pass a pretend fetch
}

// Telnyx has a plain HTTP API, so no library is needed.
// Unlike email, this API documents no idempotency key: a text can in rare cases be sent twice
// (for example, if we time out after Telnyx accepted it). That is the price of "at least once".
export function telnyxSender(config: TelnyxConfig): Sender {
    const doFetch = config.fetchImpl ?? fetch
    return {
        name: 'telnyx',
        async send(message: OutgoingMessage): Promise<SendResult> {
            try {
                const response = await doFetch('https://api.telnyx.com/v2/messages', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: config.from,
                        to: message.to,
                        text: message.text,
                        ...(config.messagingProfileId ? { messaging_profile_id: config.messagingProfileId } : {}),
                    }),
                    signal: AbortSignal.timeout(15_000),
                })
                const body = (await response.json().catch(() => null)) as {
                    data?: { id?: string }
                    errors?: { title?: string; detail?: string }[]
                } | null

                if (response.ok && body?.data?.id) return { ok: true, providerMessageId: body.data.id }

                const first = body?.errors?.[0]
                const error = first ? `${first.title ?? 'Telnyx error'}${first.detail ? `: ${first.detail}` : ''}` : `HTTP ${response.status}`
                // Busy or broken on their side: try again later. A 4xx (bad number, bad key) will not fix itself.
                return { ok: false, retryable: response.status === 429 || response.status >= 500, error }
            } catch (e) {
                return { ok: false, retryable: true, error: e instanceof Error ? e.message : 'Telnyx request failed' }
            }
        },
    }
}