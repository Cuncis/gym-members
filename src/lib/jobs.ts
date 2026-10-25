import { Prisma } from '@prisma/client'
import { BillingError, changeMembership, processPaymentEvent, renewDue, type RenewalReport } from './billing'
import { db } from './db'
import { DAY_MS, endsAtIfUnpaid, isReminderDue, nextRetryAt, retryDecision } from './dunning'
import { queueNotification } from './notifications'
import type { PaymentGateway } from './payment-gateways/types'

// The work the scheduled jobs do. Each function is safe to run twice: billing is protected by
// idempotency keys (Project 6) and messages by their dedupe keys.
// `userIds` limits a run to certain people. The proof script uses it so it never touches real data.
type Scope = { userIds?: string[] }

const BATCH = 100
const MAX_ROUNDS = 20
const LOOKBACK_MS = 3 * DAY_MS

// ---------- renewals ----------

// renewDue handles up to 100 memberships per call. Keep going until nobody is left,
// but stop if a round makes no progress, so one stuck membership cannot loop forever.
export async function renewAll(gateway: PaymentGateway, now: Date, scope: Scope = {}): Promise<RenewalReport> {
    const total: RenewalReport = { examined: 0, charged: 0, declined: 0, expired: 0, cancelled: 0, skipped: 0, errors: 0 }
    for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await renewDue(gateway, now, { limit: BATCH, userIds: scope.userIds })
        for (const key of Object.keys(total) as (keyof RenewalReport)[]) total[key] += r[key]
        const progress = r.charged + r.declined + r.expired + r.cancelled
        if (r.examined < BATCH || progress === 0) break
    }
    return total
}

// ---------- retries ----------

export type RetryReport = { examined: number; waiting: number; recovered: number; declined: number; gaveUp: number; errors: number }

export async function retryFailedBills(gateway: PaymentGateway, now: Date, scope: Scope = {}): Promise<RetryReport> {
    const report: RetryReport = { examined: 0, waiting: 0, recovered: 0, declined: 0, gaveUp: 0, errors: 0 }

    const bills = await db.billingEvent.findMany({
        where: {
            status: 'FAILED',
            kind: 'RENEWAL',
            membership: { status: 'PAST_DUE', ...(scope.userIds ? { userId: { in: scope.userIds } } : {}) },
        },
        orderBy: { periodStart: 'asc' },
        take: 200,
        include: { membership: { include: { user: { select: { name: true, paymentCustomerId: true } } } } },
    })

    for (const bill of bills) {
        report.examined++
        try {
            // Day 0 is the day the renewal was due, which is when this bill's period starts.
            const decision = retryDecision({ attempts: bill.attempts, dueAt: bill.periodStart, now })
            if (decision.action === 'wait') {
                report.waiting++
            } else if (decision.action === 'give_up') {
                await giveUp(bill, now)
                report.gaveUp++
            } else {
                await retryCharge(gateway, bill, decision.attempt, report)
            }
        } catch (error) {
            report.errors++
            console.error(`Retry failed for bill ${bill.id}`, error)
        }
    }
    return report
}

type BillWithMember = Prisma.BillingEventGetPayload<{
    include: { membership: { include: { user: { select: { name: true; paymentCustomerId: true } } } } }
}>

async function retryCharge(gateway: PaymentGateway, bill: BillWithMember, attempt: number, report: RetryReport) {
    const m = bill.membership

    // Records one more finished attempt. Conditional on the count we read, so overlapping runs
    // cannot count the same attempt twice.
    const finishAttempt = (failureMessage?: string) =>
        db.billingEvent.updateMany({
            where: { id: bill.id, attempts: bill.attempts },
            data: { attempts: attempt, ...(failureMessage ? { failureMessage: failureMessage.slice(0, 180) } : {}) },
        })

    if (!m.paymentMethodId || !m.user.paymentCustomerId) {
        await finishAttempt('No saved payment method')
        report.declined++
        return
    }

    // The key names the bill and the attempt number. The attempt count only goes up AFTER we know the
    // result, so if we time out and do not know, the next run asks again with the SAME key and the
    // provider answers with the original result instead of charging a second time.
    const result = await gateway.charge({
        customerId: m.user.paymentCustomerId,
        paymentMethodId: m.paymentMethodId,
        amountCents: bill.amountCents,
        currency: bill.currency,
        description: `${m.planName} renewal (retry ${attempt - 1})`,
        idempotencyKey: `renewal:${bill.id}:${attempt}`,
        metadata: { billingEventId: bill.id, membershipId: m.id },
    })

    if (result.ok) {
        // A FAILED bill can still become PAID (Project 6): the member goes back to ACTIVE.
        await processPaymentEvent({
            id: `charge:${result.providerPaymentId}`,
            provider: gateway.name,
            type: 'payment.succeeded',
            billingEventId: bill.id,
            providerPaymentId: result.providerPaymentId,
            paymentMethodId: m.paymentMethodId,
            amountCents: bill.amountCents,
        })
        await finishAttempt()
        report.recovered++
    } else if (result.definite) {
        await finishAttempt(result.message)
        report.declined++
    } else {
        console.warn(`Unknown charge outcome for bill ${bill.id}: ${result.code}`)
        report.errors++
    }
}

async function giveUp(bill: BillWithMember, now: Date) {
    const m = bill.membership
    try {
        await changeMembership(m.id, 'cancel_now', now)
    } catch (error) {
        // Already ended in the meantime (the member or staff cancelled): nothing left to do.
        if (!(error instanceof BillingError && error.code === 'ILLEGAL_ACTION')) throw error
    }
    await queueNotification({
        userId: m.userId,
        template: 'membership_ended',
        key: `ended:${m.id}`,
        data: { name: m.user.name, planName: m.planName },
    })
}

// ---------- queueing messages ----------

// Receipts look back three days instead of "since the last run", so a missed run is caught up by the next one.
// Failed bills need no window: only bills of PAST_DUE members count, and the attempt number inside the dedupe
// key means each failed attempt is announced exactly once. In both cases the dedupe keys stop repeats.
export async function queueBillingNotices(now: Date, scope: Scope = {}): Promise<{ receipts: number; failures: number }> {
    const since = new Date(now.getTime() - LOOKBACK_MS)
    const userFilter = scope.userIds ? { userId: { in: scope.userIds } } : {}
    let receipts = 0
    let failures = 0

    const payments = await db.payment.findMany({
        where: { createdAt: { gte: since }, ...userFilter },
        include: {
            user: { select: { name: true } },
            membership: { select: { planName: true, currentPeriodEnd: true } },
        },
    })
    for (const p of payments) {
        const queuedReceipt = await queueNotification({
            userId: p.userId,
            template: 'payment_receipt',
            key: `receipt:${p.id}`,
            data: {
                name: p.user.name,
                planName: p.membership.planName,
                amountCents: p.amountCents,
                currency: p.currency,
                paidAt: p.createdAt.toISOString(),
                periodEnd: p.membership.currentPeriodEnd?.toISOString() ?? null,
            },
        })
        if (queuedReceipt) receipts++
    }

    const bills = await db.billingEvent.findMany({
        where: {
            status: 'FAILED',
            membership: { status: 'PAST_DUE', ...userFilter },
        },
        include: { membership: { include: { user: { select: { name: true } } } } },
    })
    for (const b of bills) {
        const retryAt = nextRetryAt(b.periodStart, b.attempts)
        const queuedFailure = await queueNotification({
            userId: b.membership.userId,
            template: 'payment_failed',
            // The attempt count is part of the key: every new failed attempt is news, a repeat of the same one is not.
            key: `failed:${b.id}:${b.attempts}`,
            data: {
                name: b.membership.user.name,
                planName: b.membership.planName,
                amountCents: b.amountCents,
                currency: b.currency,
                reason: b.failureMessage ?? 'The payment did not go through',
                attempt: b.attempts,
                nextRetryAt: retryAt?.toISOString() ?? null,
                endsAt: endsAtIfUnpaid(b.periodStart).toISOString(),
            },
        })
        if (queuedFailure) failures++
    }
    return { receipts, failures }
}

export async function queueReminders(now: Date, scope: Scope = {}): Promise<{ renewals: number; endings: number }> {
    const horizon = new Date(now.getTime() + 3 * DAY_MS)
    let renewals = 0
    let endings = 0

    const memberships = await db.membership.findMany({
        where: {
            status: 'ACTIVE',
            currentPeriodEnd: { gt: now, lte: horizon },
            ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
        },
        include: { user: { select: { name: true } } },
    })

    for (const m of memberships) {
        const { currentPeriodStart: start, currentPeriodEnd: end } = m
        if (!start || !end || !isReminderDue({ periodStart: start, periodEnd: end, now })) continue

        if (m.kind === 'RECURRING' && !m.cancelAtPeriodEnd && m.paymentMethodId) {
            const queued = await queueNotification({
                userId: m.userId,
                template: 'renewal_reminder',
                key: `reminder:${m.id}:${end.toISOString()}`, // one per period
                data: {
                    name: m.user.name,
                    planName: m.planName,
                    amountCents: m.priceCents,
                    currency: m.currency,
                    renewsAt: end.toISOString(),
                },
            })
            if (queued) renewals++
        } else if (m.kind === 'ONE_TIME' || m.cancelAtPeriodEnd) {
            const queued = await queueNotification({
                userId: m.userId,
                template: 'pass_ending',
                key: `ending:${m.id}:${end.toISOString()}`,
                data: { name: m.user.name, planName: m.planName, endsAt: end.toISOString() },
            })
            if (queued) endings++
        }
    }
    return { renewals, endings }
}