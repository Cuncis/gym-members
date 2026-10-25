import { render } from '@react-email/components'
import type { ReactElement } from 'react'
import { MembershipEnded, PassEnding, PaymentFailed, PaymentReceipt, RenewalReminder } from '../emails/templates'
import { formatMoney } from './format'
import { formatInZone } from './gym-clock'

// The messages the app can send. Adding a new kind means: add it here, then write its email.
export const TEMPLATES = [
    'payment_receipt',
    'payment_failed',
    'renewal_reminder',
    'pass_ending',
    'membership_ended',
] as const
export type TemplateId = (typeof TEMPLATES)[number]

type Who = { name: string; planName: string }

// What is stored in Notification.data. Only plain values (text, numbers, ISO date strings),
// because it is saved as JSON and read back later.
export type TemplateDataMap = {
    payment_receipt: Who & { amountCents: number; currency: string; paidAt: string; periodEnd: string | null }
    payment_failed: Who & {
        amountCents: number
        currency: string
        reason: string
        attempt: number
        nextRetryAt: string | null
        endsAt: string
    }
    renewal_reminder: Who & { amountCents: number; currency: string; renewsAt: string }
    pass_ending: Who & { endsAt: string }
    membership_ended: Who
}

// Which channels each message uses. Texts cost money and interrupt people, so only the urgent ones get one.
export const CHANNELS: Record<TemplateId, { email: boolean; sms: boolean }> = {
    payment_receipt: { email: true, sms: false },
    payment_failed: { email: true, sms: true },
    renewal_reminder: { email: true, sms: true },
    pass_ending: { email: true, sms: false },
    membership_ended: { email: true, sms: true },
}

export type RenderContext = { timeZone: string; gymName: string; appUrl: string }

type Entry<D> = {
    subject: (d: D, f: Formatter, ctx: RenderContext) => string
    email: (d: D, f: Formatter, ctx: RenderContext) => ReactElement
    sms: ((d: D, f: Formatter, ctx: RenderContext) => string) | null
}
type Registry = { [K in TemplateId]: Entry<TemplateDataMap[K]> }

type Formatter = { money: (cents: number, currency: string) => string; date: (iso: string) => string }

const formatter = (ctx: RenderContext): Formatter => ({
    money: formatMoney,
    date: (iso) => formatInZone(new Date(iso), ctx.timeZone),
})

const base = (d: Who, ctx: RenderContext) => ({
    name: d.name,
    planName: d.planName,
    gymName: ctx.gymName,
    billingUrl: `${ctx.appUrl.replace(/\/$/, '')}/billing`,
})

const STOP = ' Reply STOP to opt out.'

const registry: Registry = {
    payment_receipt: {
        subject: (d, f) => `Payment received: ${f.money(d.amountCents, d.currency)}`,
        email: (d, f, ctx) => (
            <PaymentReceipt
                {...base(d, ctx)}
                amount={f.money(d.amountCents, d.currency)}
                paidOn={f.date(d.paidAt)}
                nextDate={d.periodEnd ? f.date(d.periodEnd) : null}
            />
        ),
        sms: null,
    },
    payment_failed: {
        subject: (d, f) => `We could not charge ${f.money(d.amountCents, d.currency)} for your membership`,
        email: (d, f, ctx) => (
            <PaymentFailed
                {...base(d, ctx)}
                amount={f.money(d.amountCents, d.currency)}
                reason={d.reason}
                nextRetry={d.nextRetryAt ? f.date(d.nextRetryAt) : null}
                endsOn={f.date(d.endsAt)}
            />
        ),
        sms: (d, f, ctx) =>
            `${ctx.gymName}: we could not charge ${f.money(d.amountCents, d.currency)} for your ${d.planName}. ` +
            (d.nextRetryAt
                ? `We will try again on ${f.date(d.nextRetryAt)}.`
                : `This was the last try. Your membership ends on ${f.date(d.endsAt)} unless this is fixed.`) +
            ' Please contact the gym.' +
            STOP,
    },
    renewal_reminder: {
        subject: (d, f) => `Your membership renews on ${f.date(d.renewsAt)}`,
        email: (d, f, ctx) => (
            <RenewalReminder
                {...base(d, ctx)}
                amount={f.money(d.amountCents, d.currency)}
                renewsOn={f.date(d.renewsAt)}
            />
        ),
        sms: (d, f, ctx) =>
            `${ctx.gymName}: your ${d.planName} renews on ${f.date(d.renewsAt)} for ${f.money(d.amountCents, d.currency)}.` + STOP,
    },
    pass_ending: {
        subject: (d, f) => `Your membership ends on ${f.date(d.endsAt)}`,
        email: (d, f, ctx) => <PassEnding {...base(d, ctx)} endsOn={f.date(d.endsAt)} />,
        sms: null,
    },
    membership_ended: {
        subject: () => 'Your membership has ended',
        email: (d, _f, ctx) => <MembershipEnded {...base(d, ctx)} />,
        sms: (d, _f, ctx) => `${ctx.gymName}: your ${d.planName} membership has ended because payments failed.` + STOP,
    },
}

// One cast, in one place: TypeScript cannot follow "the template id decides the data type"
// through a lookup table, so we say it once here and the public functions below stay strictly typed.
const entry = <T extends TemplateId>(template: T) => registry[template] as unknown as Entry<TemplateDataMap[T]>

export async function renderEmail<T extends TemplateId>(
    template: T,
    data: TemplateDataMap[T],
    ctx: RenderContext,
): Promise<{ subject: string; html: string; text: string }> {
    const e = entry(template)
    const f = formatter(ctx)
    const element = e.email(data, f, ctx)
    return {
        subject: e.subject(data, f, ctx),
        html: await render(element),
        // Many people read the plain version, and spam filters like emails that have one.
        text: await render(element, { plainText: true }),
    }
}

// null means "this message has no text-message version".
export function renderSms<T extends TemplateId>(template: T, data: TemplateDataMap[T], ctx: RenderContext): string | null {
    const e = entry(template)
    return e.sms ? e.sms(data, formatter(ctx), ctx) : null
}