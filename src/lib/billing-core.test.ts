import { describe, expect, it } from 'vitest'
import {
    MIN_CHARGE_CENTS,
    addMonthsUtc,
    applyDiscount,
    centsToDecimal,
    checkDiscount,
    firstPeriodEnd,
    nextPeriodEnd,
    nextStatus,
    parseMoneyToCents,
    proratedCents,
    settleBilling,
    type DiscountState,
    type MembershipEvent,
    type MembershipStatus,
} from './billing-core'

const d = (iso: string) => new Date(iso)

describe('money', () => {
    it('reads whole and decimal amounts exactly', () => {
        expect(parseMoneyToCents('49')).toBe(4900)
        expect(parseMoneyToCents('49.5')).toBe(4950)
        expect(parseMoneyToCents('49.05')).toBe(4905)
        expect(parseMoneyToCents(' 0.10 ')).toBe(10)
    })

    it('rejects anything that is not a plain amount', () => {
        for (const bad of ['', '.5', '5.', '-1', '1e3', '1,50', '1.234', 'abc']) {
            expect(parseMoneyToCents(bad)).toBeNull()
        }
    })

    it('avoids the float errors that 19.99 * 100 and 0.29 * 100 produce', () => {
        expect(parseMoneyToCents('19.99')).toBe(1999)
        expect(parseMoneyToCents('0.29')).toBe(29)
    })

    it('turns cents back into a plain decimal', () => {
        expect(centsToDecimal(4900)).toBe('49.00')
        expect(centsToDecimal(1999)).toBe('19.99')
        expect(centsToDecimal(5)).toBe('0.05')
    })
})

describe('applyDiscount', () => {
    it('leaves the price alone with no rule', () => {
        expect(applyDiscount(4900, null)).toEqual({ discountCents: 0, totalCents: 4900 })
    })

    it('takes a percentage off', () => {
        expect(applyDiscount(4900, { type: 'PERCENT', value: 10 })).toEqual({ discountCents: 490, totalCents: 4410 })
    })

    it('rounds percentages half up', () => {
        expect(applyDiscount(1010, { type: 'PERCENT', value: 5 }).discountCents).toBe(51)
        expect(applyDiscount(4999, { type: 'PERCENT', value: 10 }).discountCents).toBe(500)
    })

    it('takes a fixed amount off', () => {
        expect(applyDiscount(4900, { type: 'FIXED', value: 500 })).toEqual({ discountCents: 500, totalCents: 4400 })
    })

    it('never goes below the card minimum, even at 100% or with a huge fixed amount', () => {
        expect(applyDiscount(4900, { type: 'PERCENT', value: 100 }).totalCents).toBe(MIN_CHARGE_CENTS)
        expect(applyDiscount(4900, { type: 'FIXED', value: 999_999 }).totalCents).toBe(MIN_CHARGE_CENTS)
    })

    it('gives no discount on a price that is already below the minimum', () => {
        expect(applyDiscount(40, { type: 'PERCENT', value: 10 })).toEqual({ discountCents: 0, totalCents: 40 })
    })
})

describe('checkDiscount', () => {
    const base: DiscountState = {
        active: true,
        startsAt: null,
        expiresAt: null,
        maxRedemptions: null,
        redeemedCount: 0,
    }
    const now = d('2026-10-17T00:00:00Z')

    it('accepts a normal code, with or without a limit', () => {
        expect(checkDiscount(base, now)).toEqual({ ok: true })
        expect(checkDiscount({ ...base, maxRedemptions: 5, redeemedCount: 4 }, now)).toEqual({ ok: true })
    })

    it('rejects inactive, not yet started, expired and used-up codes', () => {
        expect(checkDiscount({ ...base, active: false }, now)).toEqual({ ok: false, reason: 'inactive' })
        expect(checkDiscount({ ...base, startsAt: d('2026-10-18T00:00:00Z') }, now)).toEqual({ ok: false, reason: 'not_started' })
        expect(checkDiscount({ ...base, expiresAt: d('2026-10-16T00:00:00Z') }, now)).toEqual({ ok: false, reason: 'expired' })
        expect(checkDiscount({ ...base, maxRedemptions: 3, redeemedCount: 3 }, now)).toEqual({ ok: false, reason: 'used_up' })
    })

    it('treats the expiry moment itself as expired', () => {
        expect(checkDiscount({ ...base, expiresAt: now }, now)).toEqual({ ok: false, reason: 'expired' })
    })
})

describe('billing periods', () => {
    it('clamps the 31st to the end of a shorter month', () => {
        expect(addMonthsUtc(d('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z')
    })

    it('goes back to the anchor day afterwards', () => {
        expect(addMonthsUtc(d('2026-02-28T10:00:00Z'), 1, 31).toISOString()).toBe('2026-03-31T10:00:00.000Z')
    })

    it('crosses the end of the year', () => {
        expect(addMonthsUtc(d('2026-12-15T08:30:00Z'), 1).toISOString()).toBe('2027-01-15T08:30:00.000Z')
        expect(addMonthsUtc(d('2026-10-17T00:00:00Z'), 12).toISOString()).toBe('2027-10-17T00:00:00.000Z')
    })

    it('finds the end of the first period for each kind of plan', () => {
        const start = d('2026-10-17T00:00:00Z')
        expect(firstPeriodEnd({ kind: 'RECURRING', interval: 'MONTH', durationDays: null }, start).toISOString()).toBe(
            '2026-11-17T00:00:00.000Z',
        )
        expect(firstPeriodEnd({ kind: 'RECURRING', interval: 'YEAR', durationDays: null }, start).toISOString()).toBe(
            '2027-10-17T00:00:00.000Z',
        )
        expect(firstPeriodEnd({ kind: 'ONE_TIME', interval: null, durationDays: 10 }, start).toISOString()).toBe(
            '2026-10-27T00:00:00.000Z',
        )
    })

    it('refuses plans with missing terms', () => {
        const start = d('2026-10-17T00:00:00Z')
        expect(() => firstPeriodEnd({ kind: 'RECURRING', interval: null, durationDays: null }, start)).toThrow()
        expect(() => firstPeriodEnd({ kind: 'ONE_TIME', interval: null, durationDays: null }, start)).toThrow()
    })

    it('keeps a month-end membership on the 31st across renewals', () => {
        const first = firstPeriodEnd({ kind: 'RECURRING', interval: 'MONTH', durationDays: null }, d('2026-01-31T00:00:00Z'))
        expect(first.toISOString()).toBe('2026-02-28T00:00:00.000Z')
        expect(nextPeriodEnd('MONTH', first, 31).toISOString()).toBe('2026-03-31T00:00:00.000Z')
    })
})

describe('proratedCents', () => {
    const start = d('2026-11-01T00:00:00Z')
    const end = d('2026-12-01T00:00:00Z') // 30 days

    it('gives the matching share of the time left', () => {
        expect(proratedCents(4900, start, end, d('2026-11-16T00:00:00Z'))).toBe(2450)
    })

    it('gives everything at the start and nothing at or after the end', () => {
        expect(proratedCents(4900, start, end, start)).toBe(4900)
        expect(proratedCents(4900, start, end, end)).toBe(0)
        expect(proratedCents(4900, start, end, d('2027-01-01T00:00:00Z'))).toBe(0)
    })

    it('never gives more than was paid, even before the period starts', () => {
        expect(proratedCents(4900, start, end, d('2026-10-01T00:00:00Z'))).toBe(4900)
    })

    it('rounds down to a whole cent', () => {
        expect(proratedCents(100, start, end, d('2026-11-11T00:00:00Z'))).toBe(66) // 66.67 cents
    })

    it('returns 0 for a period with no length', () => {
        expect(proratedCents(4900, start, start, start)).toBe(0)
    })

    it('stays exact with large amounts', () => {
        const yearStart = d('2026-01-01T00:00:00Z')
        const yearEnd = d('2027-01-01T00:00:00Z')
        const half = new Date(yearStart.getTime() + (yearEnd.getTime() - yearStart.getTime()) / 2)
        expect(proratedCents(99_999_999, yearStart, yearEnd, half)).toBe(49_999_999)
    })
})

describe('membership status machine', () => {
    const allowed: [MembershipStatus, MembershipEvent, MembershipStatus][] = [
        ['PENDING', 'PAYMENT_SUCCEEDED', 'ACTIVE'],
        ['PENDING', 'PAYMENT_FAILED', 'PENDING'],
        ['PENDING', 'CANCEL_NOW', 'CANCELLED'],
        ['ACTIVE', 'PAYMENT_FAILED', 'PAST_DUE'],
        ['ACTIVE', 'PAUSE', 'PAUSED'],
        ['ACTIVE', 'PERIOD_ENDED', 'EXPIRED'],
        ['PAST_DUE', 'PAYMENT_SUCCEEDED', 'ACTIVE'],
        ['PAUSED', 'RESUME', 'ACTIVE'],
        ['PAUSED', 'CANCEL_NOW', 'CANCELLED'],
    ]

    it.each(allowed)('%s + %s -> %s', (from, event, to) => {
        expect(nextStatus(from, event)).toBe(to)
    })

    it('never leaves a final status', () => {
        const events: MembershipEvent[] = ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAUSE', 'RESUME', 'CANCEL_NOW', 'PERIOD_ENDED']
        for (const status of ['CANCELLED', 'EXPIRED'] as const) {
            for (const event of events) expect(nextStatus(status, event)).toBeNull()
        }
    })

    it('does not allow pausing a past-due or already paused membership', () => {
        expect(nextStatus('PAST_DUE', 'PAUSE')).toBeNull()
        expect(nextStatus('PAUSED', 'PAUSE')).toBeNull()
    })

    it('does not allow resuming something that is not paused', () => {
        expect(nextStatus('ACTIVE', 'RESUME')).toBeNull()
    })
})

describe('settleBilling', () => {
    it('lets a pending bill be paid or fail', () => {
        expect(settleBilling('PENDING', 'PAID')).toEqual({ status: 'PAID', apply: true })
        expect(settleBilling('PENDING', 'FAILED')).toEqual({ status: 'FAILED', apply: true })
    })

    it('lets a failed bill be paid on a later attempt', () => {
        expect(settleBilling('FAILED', 'PAID')).toEqual({ status: 'PAID', apply: true })
    })

    it('ignores a repeat of the same payment', () => {
        expect(settleBilling('PAID', 'PAID')).toEqual({ status: 'PAID', apply: false })
    })

    it('never lets a late failure undo a payment', () => {
        expect(settleBilling('PAID', 'FAILED')).toEqual({ status: 'PAID', apply: false })
    })

    it('does not count a second failure twice', () => {
        expect(settleBilling('FAILED', 'FAILED')).toEqual({ status: 'FAILED', apply: false })
    })
})