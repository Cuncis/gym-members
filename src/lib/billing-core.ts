// Pure billing rules: no database, no network, no clock except the dates you pass in.
// Everything here uses whole numbers of cents. There is no floating-point math on money.

export const MIN_CHARGE_CENTS = 50 // the smallest card payment Stripe accepts in USD

const DAY_MS = 86_400_000

// Exact whole-number division: n and d are integers, so nothing is rounded by accident.
const divFloor = (n: number, d: number) => (n - (n % d)) / d

// ---------- money ----------

// "49.05" -> 4905. Returns null for anything that is not a plain amount.
export function parseMoneyToCents(input: string): number | null {
    const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim())
    if (!match) return null
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

// 4905 -> "49.05"
export function centsToDecimal(cents: number): string {
    return `${divFloor(cents, 100)}.${String(cents % 100).padStart(2, '0')}`
}

// ---------- discounts ----------

export type DiscountRule = { type: 'PERCENT' | 'FIXED'; value: number }

export function applyDiscount(priceCents: number, rule: DiscountRule | null) {
    if (!rule) return { discountCents: 0, totalCents: priceCents }

    // Percentages round half up: 5% of 1010 is 50.5, which becomes 51.
    const wanted = rule.type === 'PERCENT' ? divFloor(priceCents * rule.value + 50, 100) : rule.value

    // A promo can never push the payment under the card minimum.
    const maxDiscount = Math.max(priceCents - MIN_CHARGE_CENTS, 0)
    const discountCents = Math.max(Math.min(wanted, maxDiscount), 0)
    return { discountCents, totalCents: priceCents - discountCents }
}

export type DiscountState = {
    active: boolean
    startsAt: Date | null
    expiresAt: Date | null
    maxRedemptions: number | null
    redeemedCount: number
}

export type DiscountCheck =
    | { ok: true }
    | { ok: false; reason: 'inactive' | 'not_started' | 'expired' | 'used_up' }

export function checkDiscount(d: DiscountState, now: Date): DiscountCheck {
    if (!d.active) return { ok: false, reason: 'inactive' }
    if (d.startsAt && now < d.startsAt) return { ok: false, reason: 'not_started' }
    if (d.expiresAt && now >= d.expiresAt) return { ok: false, reason: 'expired' }
    if (d.maxRedemptions !== null && d.redeemedCount >= d.maxRedemptions) return { ok: false, reason: 'used_up' }
    return { ok: true }
}

// ---------- billing periods ----------

export type PlanTerms = {
    kind: 'RECURRING' | 'ONE_TIME'
    interval: 'MONTH' | 'YEAR' | null
    durationDays: number | null
}

const intervalMonths = (interval: 'MONTH' | 'YEAR') => (interval === 'MONTH' ? 1 : 12)

// Adds months in UTC. A 31st clamps to the last day of a shorter month, and `anchorDay`
// brings it back: Jan 31 -> Feb 28 -> Mar 31, not Jan 31 -> Feb 28 -> Mar 28.
export function addMonthsUtc(date: Date, months: number, anchorDay = date.getUTCDate()): Date {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + months
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return new Date(
        Date.UTC(
            year,
            month,
            Math.min(anchorDay, lastDay),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds(),
        ),
    )
}

export function firstPeriodEnd(terms: PlanTerms, start: Date): Date {
    if (terms.kind === 'RECURRING') {
        if (!terms.interval) throw new Error('A recurring plan needs an interval')
        return addMonthsUtc(start, intervalMonths(terms.interval))
    }
    if (!terms.durationDays || terms.durationDays < 1) throw new Error('A one-time plan needs durationDays')
    return new Date(start.getTime() + terms.durationDays * DAY_MS)
}

export function nextPeriodEnd(interval: 'MONTH' | 'YEAR', currentEnd: Date, anchorDay: number): Date {
    return addMonthsUtc(currentEnd, intervalMonths(interval), anchorDay)
}

// The part of a payment that covers the time still left in a period, rounded down.
export function proratedCents(amountCents: number, periodStart: Date, periodEnd: Date, at: Date): number {
    const total = periodEnd.getTime() - periodStart.getTime()
    if (total <= 0) return 0
    const remaining = Math.min(Math.max(periodEnd.getTime() - at.getTime(), 0), total)
    // BigInt: cents times milliseconds can pass 2^53 (about 9 quadrillion), where ordinary numbers lose digits.
    return Number((BigInt(amountCents) * BigInt(remaining)) / BigInt(total))
}

// ---------- membership status machine ----------

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'

export type MembershipEvent =
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_FAILED'
    | 'PAUSE'
    | 'RESUME'
    | 'CANCEL_NOW'
    | 'PERIOD_ENDED'

export type MembershipAction = 'pause' | 'resume' | 'cancel_at_period_end' | 'undo_cancel' | 'cancel_now'

const transitions: Record<MembershipStatus, Partial<Record<MembershipEvent, MembershipStatus>>> = {
    PENDING: { PAYMENT_SUCCEEDED: 'ACTIVE', PAYMENT_FAILED: 'PENDING', CANCEL_NOW: 'CANCELLED' },
    ACTIVE: {
        PAYMENT_SUCCEEDED: 'ACTIVE',
        PAYMENT_FAILED: 'PAST_DUE',
        PAUSE: 'PAUSED',
        CANCEL_NOW: 'CANCELLED',
        PERIOD_ENDED: 'EXPIRED',
    },
    PAST_DUE: { PAYMENT_SUCCEEDED: 'ACTIVE', PAYMENT_FAILED: 'PAST_DUE', CANCEL_NOW: 'CANCELLED' },
    PAUSED: { RESUME: 'ACTIVE', CANCEL_NOW: 'CANCELLED' },
    CANCELLED: {},
    EXPIRED: {},
}

// The new status, or null when the event is not allowed in this status.
export function nextStatus(status: MembershipStatus, event: MembershipEvent): MembershipStatus | null {
    return transitions[status][event] ?? null
}

// ---------- bill settlement ----------

export type BillingStatus = 'PENDING' | 'PAID' | 'FAILED'

// Provider events can repeat or arrive out of order. PAID is final: a late "failed"
// can never undo a payment. A second failure on an already-failed bill adds nothing.
export function settleBilling(
    current: BillingStatus,
    outcome: 'PAID' | 'FAILED',
): { status: BillingStatus; apply: boolean } {
    if (current === 'PAID') return { status: 'PAID', apply: false }
    if (current === 'FAILED' && outcome === 'FAILED') return { status: 'FAILED', apply: false }
    return { status: outcome, apply: true }
}