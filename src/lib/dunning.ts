// The rules for failed payments ("dunning"), kept free of the database so they are easy to test.
//
// Day 0 is the day the renewal was due. The first charge happens then. If it fails:
//   retry on day 1, then day 3, then day 7, and end the membership on day 8 if the last retry failed too.

export const DAY_MS = 86_400_000
export const RETRY_AFTER_DAYS = [1, 3, 7] as const
export const MAX_CHARGE_ATTEMPTS = RETRY_AFTER_DAYS.length + 1 // the first charge plus three retries
export const GIVE_UP_AFTER_DAYS = 8

export type RetryDecision =
    | { action: 'wait'; at: Date } // nothing to do before this moment
    | { action: 'retry'; attempt: number } // charge again; this will be attempt number `attempt`
    | { action: 'give_up' } // all attempts used and the grace day has passed

// When the next thing should happen to a bill that has had `attempts` charge attempts.
export function nextActionAt(dueAt: Date, attempts: number): Date {
    const made = Math.max(1, attempts)
    const days = made >= MAX_CHARGE_ATTEMPTS ? GIVE_UP_AFTER_DAYS : RETRY_AFTER_DAYS[made - 1]
    return new Date(dueAt.getTime() + days * DAY_MS)
}

export function retryDecision(input: { attempts: number; dueAt: Date; now: Date }): RetryDecision {
    const attempts = Math.max(1, input.attempts)
    const at = nextActionAt(input.dueAt, attempts)
    if (input.now.getTime() < at.getTime()) return { action: 'wait', at }
    return attempts >= MAX_CHARGE_ATTEMPTS ? { action: 'give_up' } : { action: 'retry', attempt: attempts + 1 }
}

// The date of the next retry, or null when no retries are left. Used in "we will try again on..." messages.
export function nextRetryAt(dueAt: Date, attempts: number): Date | null {
    return attempts >= MAX_CHARGE_ATTEMPTS ? null : nextActionAt(dueAt, attempts)
}

// The date the membership ends if nothing is paid.
export function endsAtIfUnpaid(dueAt: Date): Date {
    return new Date(dueAt.getTime() + GIVE_UP_AFTER_DAYS * DAY_MS)
}

// Should a "your plan renews soon" (or "your pass ends soon") message go out now?
// Only for periods long enough that a reminder helps: a one-day pass does not need a reminder
// on the day it is bought.
export function isReminderDue(input: { periodStart: Date; periodEnd: Date; now: Date; leadDays?: number }): boolean {
    const lead = (input.leadDays ?? 3) * DAY_MS
    const left = input.periodEnd.getTime() - input.now.getTime()
    const length = input.periodEnd.getTime() - input.periodStart.getTime()
    return left > 0 && left <= lead && length > lead * 2
}