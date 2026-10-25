import { describe, expect, it } from 'vitest'
import { CHANNELS, TEMPLATES, renderEmail, renderSms } from './messages'

const ctx = { timeZone: 'America/Los_Angeles', gymName: 'Iron Works', appUrl: 'https://gym.example.com/' }
const who = { name: 'Alice', planName: 'Monthly' }

describe('emails', () => {
    it('renders a receipt with the amount and the date in the gym time zone', async () => {
        // 03:00 UTC on Jan 1 is still Dec 31 in Los Angeles.
        const mail = await renderEmail(
            'payment_receipt',
            { ...who, amountCents: 4900, currency: 'usd', paidAt: '2027-01-01T03:00:00Z', periodEnd: '2027-02-01T03:00:00Z' },
            ctx,
        )
        expect(mail.subject).toBe('Payment received: $49.00')
        expect(mail.html).toContain('Dec 31, 2026')
        expect(mail.html).toContain('Iron Works')
        expect(mail.html).toContain('https://gym.example.com/billing') // no double slash
        expect(mail.text).toContain('$49.00')
        expect(mail.text).not.toContain('<')
    })

    it('escapes names, so a member cannot inject markup into an email', async () => {
        const mail = await renderEmail('membership_ended', { name: '<script>alert(1)</script>', planName: 'Monthly' }, ctx)
        expect(mail.html).not.toContain('<script>')
        expect(mail.html).toContain('&lt;script&gt;')
    })

    it('says when the next retry is, or that it was the last one', async () => {
        const data = {
            ...who,
            amountCents: 4900,
            currency: 'usd',
            reason: 'Your card was declined',
            attempt: 1,
            nextRetryAt: '2027-03-11T12:00:00Z',
            endsAt: '2027-03-18T12:00:00Z',
        }
        const again = await renderEmail('payment_failed', data, ctx)
        expect(again.text).toContain('We will try again on Mar 11, 2027')
        const last = await renderEmail('payment_failed', { ...data, attempt: 4, nextRetryAt: null }, ctx)
        expect(last.text).toContain('last attempt')
        expect(last.text).toContain('Mar 18, 2027')
    })

    it('renders every template', async () => {
        const sample = {
            payment_receipt: { ...who, amountCents: 100, currency: 'usd', paidAt: '2027-01-01T00:00:00Z', periodEnd: null },
            payment_failed: { ...who, amountCents: 100, currency: 'usd', reason: 'x', attempt: 1, nextRetryAt: null, endsAt: '2027-01-01T00:00:00Z' },
            renewal_reminder: { ...who, amountCents: 100, currency: 'usd', renewsAt: '2027-01-01T00:00:00Z' },
            pass_ending: { ...who, endsAt: '2027-01-01T00:00:00Z' },
            membership_ended: who,
        } as const
        for (const t of TEMPLATES) {
            const mail = await renderEmail(t, sample[t] as never, ctx)
            expect(mail.subject.length).toBeGreaterThan(5)
            expect(mail.html).toContain('Alice')
        }
    })
})

describe('text messages', () => {
    it('includes the opt-out line and stays short', () => {
        const text = renderSms(
            'renewal_reminder',
            { ...who, amountCents: 4900, currency: 'usd', renewsAt: '2027-03-31T12:00:00Z' },
            ctx,
        )!
        expect(text).toContain('Reply STOP to opt out.')
        expect(text).toContain('Mar 31, 2027')
        expect(text.length).toBeLessThan(160)
    })

    it('exists exactly for the templates marked as texting', () => {
        const sms = {
            payment_receipt: renderSms('payment_receipt', { ...who, amountCents: 1, currency: 'usd', paidAt: '2027-01-01T00:00:00Z', periodEnd: null }, ctx),
            pass_ending: renderSms('pass_ending', { ...who, endsAt: '2027-01-01T00:00:00Z' }, ctx),
            membership_ended: renderSms('membership_ended', who, ctx),
        }
        expect(sms.payment_receipt).toBeNull()
        expect(sms.pass_ending).toBeNull()
        expect(sms.membership_ended).not.toBeNull()
        expect(CHANNELS.payment_receipt.sms).toBe(false)
        expect(CHANNELS.membership_ended.sms).toBe(true)
    })
})