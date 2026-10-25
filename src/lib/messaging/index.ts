import { Resend } from 'resend'
import { consoleSender } from './console'
import { FakeSender } from './fake'
import { resendSender } from './resend'
import { telnyxSender } from './telnyx'
import type { Sender, Senders } from './types'

let fakes: Senders | null = null

function missing(channel: 'email' | 'sms'): Sender {
    // In production a missing key must be a loud error, not a silent "nothing was sent".
    if (process.env.NODE_ENV === 'production') throw new Error(`The ${channel} provider is not configured`)
    return consoleSender(channel)
}

// The only place that chooses providers. Everything else receives a `Senders` object.
export function getSenders(): Senders {
    if (process.env.NOTIFY_PROVIDER === 'fake') {
        if (process.env.NODE_ENV === 'production') throw new Error('NOTIFY_PROVIDER=fake is not allowed in production')
        fakes ??= { email: new FakeSender('fake-email'), sms: new FakeSender('fake-sms') }
        return fakes
    }

    const { RESEND_API_KEY, EMAIL_FROM, TELNYX_API_KEY, TELNYX_FROM_NUMBER, TELNYX_MESSAGING_PROFILE_ID } = process.env
    return {
        email: RESEND_API_KEY && EMAIL_FROM ? resendSender(new Resend(RESEND_API_KEY), EMAIL_FROM) : missing('email'),
        sms:
            TELNYX_API_KEY && TELNYX_FROM_NUMBER
                ? telnyxSender({
                    apiKey: TELNYX_API_KEY,
                    from: TELNYX_FROM_NUMBER,
                    messagingProfileId: TELNYX_MESSAGING_PROFILE_ID || undefined,
                })
                : missing('sms'),
    }
}