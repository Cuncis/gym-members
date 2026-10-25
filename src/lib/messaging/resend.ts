import type { Resend } from 'resend'
import type { OutgoingMessage, SendResult, Sender } from './types'

type ResendLike = Pick<Resend, 'emails'>

// Errors that mean "try again later". Everything else (bad address, bad key) will not fix itself.
const RETRYABLE = new Set([
    'rate_limit_exceeded',
    'daily_quota_exceeded',
    'monthly_quota_exceeded',
    'concurrent_idempotent_requests',
    'application_error',
    'internal_server_error',
])

export function resendSender(client: ResendLike, from: string): Sender {
    return {
        name: 'resend',
        async send(message: OutgoingMessage): Promise<SendResult> {
            try {
                const { data, error } = await client.emails.send(
                    { from, to: message.to, subject: message.subject ?? '', html: message.html, text: message.text },
                    // Resend remembers this key for 24 hours: the same key never sends the email twice.
                    { idempotencyKey: message.idempotencyKey },
                )
                if (error) {
                    const status = error.statusCode ?? 0
                    return { ok: false, retryable: RETRYABLE.has(error.name) || status >= 500, error: error.message }
                }
                if (!data) return { ok: false, retryable: true, error: 'Resend returned no data' }
                return { ok: true, providerMessageId: data.id }
            } catch (e) {
                // The request itself failed (network down, timeout). We do not know if it arrived: retry.
                return { ok: false, retryable: true, error: e instanceof Error ? e.message : 'Resend request failed' }
            }
        },
    }
}