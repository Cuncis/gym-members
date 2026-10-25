import { describe, expect, it } from 'vitest'
import {
    DAY_MS,
    MAX_CHARGE_ATTEMPTS,
    endsAtIfUnpaid,
    isReminderDue,
    nextRetryAt,
    retryDecision,
} from './dunning'

const due = new Date('2027-03-10T00:00:00Z')
const at = (days: number, hours = 0) => new Date(due.getTime() + days * DAY_MS + hours * 3_600_000)

describe('retry schedule', () => {
    it('waits until day 1 after the first failed charge', () => {
        expect(retryDecision({ attempts: 1, dueAt: due, now: at(0, 5) })).toEqual({ action: 'wait', at: at(1) })
        expect(retryDecision({ attempts: 1, dueAt: due, now: at(1) })).toEqual({ action: 'retry', attempt: 2 })
    })

    it('retries on day 3 after the second attempt, and day 7 after the third', () => {
        expect(retryDecision({ attempts: 2, dueAt: due, now: at(2, 23) })).toEqual({ action: 'wait', at: at(3) })
        expect(retryDecision({ attempts: 2, dueAt: due, now: at(3) })).toEqual({ action: 'retry', attempt: 3 })
        expect(retryDecision({ attempts: 3, dueAt: due, now: at(6, 23) })).toEqual({ action: 'wait', at: at(7) })
        expect(retryDecision({ attempts: 3, dueAt: due, now: at(7) })).toEqual({ action: 'retry', attempt: 4 })
    })

    it('gives the member one more day after the last attempt, then gives up', () => {
        expect(retryDecision({ attempts: MAX_CHARGE_ATTEMPTS, dueAt: due, now: at(7, 1) })).toEqual({
            action: 'wait',
            at: at(8),
        })
        expect(retryDecision({ attempts: MAX_CHARGE_ATTEMPTS, dueAt: due, now: at(8) })).toEqual({ action: 'give_up' })
    })

    it('catches up a late run with one retry at a time, never several at once', () => {
        // The system was down for ten days. It makes the next attempt only (attempt 2), not attempts 2, 3 and 4.
        expect(retryDecision({ attempts: 1, dueAt: due, now: at(10) })).toEqual({ action: 'retry', attempt: 2 })
    })

    it('treats a missing or zero attempt count as the first attempt', () => {
        expect(retryDecision({ attempts: 0, dueAt: due, now: at(0, 1) }).action).toBe('wait')
    })

    it('reports when the next retry is and when there are none left', () => {
        expect(nextRetryAt(due, 1)).toEqual(at(1))
        expect(nextRetryAt(due, 2)).toEqual(at(3))
        expect(nextRetryAt(due, 3)).toEqual(at(7))
        expect(nextRetryAt(due, 4)).toBeNull()
        expect(endsAtIfUnpaid(due)).toEqual(at(8))
    })
})

describe('reminders', () => {
    const start = new Date('2027-03-01T00:00:00Z')
    const end = new Date('2027-03-31T00:00:00Z')

    it('fires inside the last three days of a long period only', () => {
        expect(isReminderDue({ periodStart: start, periodEnd: end, now: new Date('2027-03-27T23:59:00Z') })).toBe(false)
        expect(isReminderDue({ periodStart: start, periodEnd: end, now: new Date('2027-03-28T00:00:00Z') })).toBe(true)
        expect(isReminderDue({ periodStart: start, periodEnd: end, now: new Date('2027-03-30T23:00:00Z') })).toBe(true)
    })

    it('does not fire once the period has ended', () => {
        expect(isReminderDue({ periodStart: start, periodEnd: end, now: end })).toBe(false)
    })

    it('does not fire for short passes, which would be reminded the moment they were bought', () => {
        const dayStart = new Date('2027-03-30T10:00:00Z')
        const dayEnd = new Date('2027-03-31T10:00:00Z')
        expect(isReminderDue({ periodStart: dayStart, periodEnd: dayEnd, now: new Date('2027-03-30T12:00:00Z') })).toBe(false)
    })
})