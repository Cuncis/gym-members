import type { OutgoingMessage, SendResult, Sender } from './types'

// For local development without provider accounts: print the message instead of sending it.
export function consoleSender(channel: 'email' | 'sms'): Sender {
    return {
        name: `console-${channel}`,
        async send(message: OutgoingMessage): Promise<SendResult> {
            console.log(`\n--- ${channel.toUpperCase()} to ${message.to} ---`)
            if (message.subject) console.log(`Subject: ${message.subject}`)
            console.log(message.text)
            console.log('--- end ---\n')
            return { ok: true, providerMessageId: `console_${message.idempotencyKey}` }
        },
    }
}