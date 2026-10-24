import { Prisma, type Discount } from '@prisma/client'
import { db } from './db'
import { formatMoney } from './format'
import {
    applyDiscount,
    checkDiscount,
    firstPeriodEnd,
    nextPeriodEnd,
    nextStatus,
    settleBilling,
    type MembershipAction,
} from './billing-core'
import type { PaymentEvent, PaymentGateway } from './payment-gateways/types'

type Tx = Prisma.TransactionClient

export class BillingError extends Error {
    code: string
    status: number
    constructor(code: string, message: string, status = 409) {
        super(message)
        this.code = code
        this.status = status
    }
}

// Locks one row until the transaction ends. Anyone else who wants the same row waits their turn.
// `table` is one of three fixed names from our own code, never user input.
const lockRow = (tx: Tx, table: 'BillingEvent' | 'Membership' | 'Payment', id: string) =>
    tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(`\`${table}\``)} WHERE id = ${id} FOR UPDATE`)

const DISCOUNT_MESSAGES: Record<string, string> = {
    unknown: 'This code does not exist',
    inactive: 'This code is no longer active',
    not_started: 'This code is not valid yet',
    expired: 'This code has expired',
    used_up: 'This code has been used the maximum number of times',
}

// ---------- quote and checkout ----------

export async function quoteCheckout(planId: string, rawCode: string | undefined, now = new Date()) {
    const plan = await db.membershipPlan.findFirst({ where: { id: planId, active: true } })
    if (!plan) throw new BillingError('PLAN_NOT_FOUND', 'This plan is not available', 404)

    let discount: Discount | null = null
    const code = rawCode?.trim().toUpperCase()
    if (code) {
        const found = await db.discount.findUnique({ where: { code } })
        const check = found ? checkDiscount(found, now) : ({ ok: false, reason: 'unknown' } as const)
        if (!check.ok) throw new BillingError('DISCOUNT_INVALID', DISCOUNT_MESSAGES[check.reason], 400)
        discount = found
    }

    const { discountCents, totalCents } = applyDiscount(
        plan.priceCents,
        discount ? { type: discount.type, value: discount.value } : null,
    )
    return { plan, discount, listPriceCents: plan.priceCents, discountCents, totalCents }
}

export async function startCheckout(
    gateway: PaymentGateway,
    input: { userId: string; planId: string; code?: string },
) {
    const now = new Date()
    const quote = await quoteCheckout(input.planId, input.code, now)
    const { plan } = quote

    const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, name: true, paymentCustomerId: true },
    })
    if (!user) throw new BillingError('NOT_FOUND', 'Your account no longer exists', 401)

    if (plan.kind === 'RECURRING') {
        const existing = await db.membership.findFirst({
            where: { userId: user.id, planId: plan.id, status: { in: ['ACTIVE', 'PAST_DUE', 'PAUSED'] } },
            select: { id: true },
        })
        if (existing) throw new BillingError('ALREADY_SUBSCRIBED', 'You already have this membership', 409)
    }

    let customerId = user.paymentCustomerId
    if (!customerId) {
        customerId = await gateway.createCustomer({ userId: user.id, email: user.email, name: user.name })
        // Only the first writer wins; the gateway's idempotency key gives concurrent callers the same id anyway.
        await db.user.updateMany({ where: { id: user.id, paymentCustomerId: null }, data: { paymentCustomerId: customerId } })
    }

    // Record what we are about to sell BEFORE sending the person to pay.
    // The webhook finds its way back to these rows through the bill's id.
    const { membership, bill } = await db.$transaction(async (tx) => {
        const membership = await tx.membership.create({
            data: {
                userId: user.id,
                planId: plan.id,
                planName: plan.name,
                priceCents: plan.priceCents,
                currency: plan.currency,
                kind: plan.kind,
                interval: plan.interval,
                durationDays: plan.durationDays,
                status: 'PENDING',
                startDate: now,
            },
        })
        const bill = await tx.billingEvent.create({
            data: {
                membershipId: membership.id,
                kind: 'INITIAL',
                listPriceCents: quote.listPriceCents,
                discountCents: quote.discountCents,
                amountCents: quote.totalCents,
                currency: plan.currency,
                discountId: quote.discount?.id ?? null,
                // Placeholders: the real period starts when the payment arrives (see applyPaymentEvent).
                periodStart: now,
                periodEnd: firstPeriodEnd(plan, now),
            },
        })
        return { membership, bill }
    })

    const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    try {
        const checkout = await gateway.createCheckout({
            billingEventId: bill.id,
            membershipId: membership.id,
            customerId,
            amountCents: bill.amountCents,
            currency: plan.currency,
            description: quote.discount ? `${plan.name} (code ${quote.discount.code})` : plan.name,
            savePaymentMethod: plan.kind === 'RECURRING',
            successUrl: `${base}/checkout/success?m=${membership.id}`,
            cancelUrl: `${base}/plans`,
        })
        await db.billingEvent.update({ where: { id: bill.id }, data: { providerSessionId: checkout.sessionId } })
        return { url: checkout.url, membershipId: membership.id }
    } catch (error) {
        // Nothing was sold: remove the pending records so failed attempts do not pile up.
        await db.membership.delete({ where: { id: membership.id } }).catch(() => undefined)
        throw error
    }
}

// ---------- settling payment results ----------

// Every payment result ends up here: a webhook, or the result of our own charge call.
async function applyPaymentEvent(tx: Tx, event: PaymentEvent): Promise<void> {
    if (event.type === 'ignored' || !event.billingEventId) return

    // Lock the bill so a webhook and a billing run settling it at the same moment take turns.
    await lockRow(tx, 'BillingEvent', event.billingEventId)
    const bill = await tx.billingEvent.findUnique({
        where: { id: event.billingEventId },
        include: { membership: true },
    })
    if (!bill) return // a payment this app did not start

    const paid = event.type === 'payment.succeeded'
    if (!settleBilling(bill.status, paid ? 'PAID' : 'FAILED').apply) return // a repeat, or a late failure

    const m = bill.membership
    const now = new Date()

    if (!paid) {
        await tx.billingEvent.update({
            where: { id: bill.id },
            data: { status: 'FAILED', failureMessage: event.failureMessage ?? 'Payment failed' },
        })
        const next = nextStatus(m.status, 'PAYMENT_FAILED')
        if (next !== null && next !== m.status) {
            await tx.membership.update({ where: { id: m.id }, data: { status: next } })
        }
        return
    }

    if (!event.providerPaymentId) throw new Error('A successful payment event must carry providerPaymentId')
    const amountCents = event.amountCents ?? bill.amountCents
    if (amountCents !== bill.amountCents) {
        console.warn(`Bill ${bill.id} expected ${bill.amountCents} cents but the provider charged ${amountCents}`)
    }

    await tx.payment.create({
        data: {
            billingEventId: bill.id,
            membershipId: m.id,
            userId: m.userId,
            amountCents,
            currency: bill.currency,
            provider: event.provider,
            providerPaymentId: event.providerPaymentId,
        },
    })

    const initial = bill.kind === 'INITIAL'
    // The first period starts when the money arrives, not when Checkout was opened.
    const periodStart = initial ? now : bill.periodStart
    const periodEnd = initial ? firstPeriodEnd(m, now) : bill.periodEnd

    await tx.billingEvent.update({
        where: { id: bill.id },
        data: { status: 'PAID', failureMessage: null, periodStart, periodEnd },
    })

    const next = nextStatus(m.status, 'PAYMENT_SUCCEEDED')
    if (next === null) {
        // Money arrived for a membership that has already ended. The Payment row exists, so nothing is lost.
        console.warn(`Payment ${event.providerPaymentId} arrived for a ${m.status} membership (${m.id}): refund it`)
    } else {
        await tx.membership.update({
            where: { id: m.id },
            data: initial
                ? {
                    status: next,
                    startDate: now,
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    paymentMethodId: m.kind === 'RECURRING' ? (event.paymentMethodId ?? null) : null,
                    cancelAtPeriodEnd: false,
                }
                : { status: next, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
        })
    }

    if (initial && bill.discountId) {
        await tx.discount.update({ where: { id: bill.discountId }, data: { redeemedCount: { increment: 1 } } })
    }
}

// Idempotent: handling the same event twice, or ten times at once, has the effect of handling it once.
export async function processPaymentEvent(event: PaymentEvent): Promise<'processed' | 'duplicate'> {
    return db.$transaction(
        async (tx) => {
            // Claim the event id. If another request already claimed it, count is 0 and we stop.
            // While the first request is still running, a second one waits here until it finishes.
            const claim = await tx.webhookEvent.createMany({
                data: [{ id: `${event.provider}:${event.id}`, type: event.type }],
                skipDuplicates: true,
            })
            if (claim.count === 0) return 'duplicate' as const

            // If anything below throws, the claim is rolled back with everything else,
            // so the provider's next retry gets a clean second chance.
            await applyPaymentEvent(tx, event)
            return 'processed' as const
        },
        { maxWait: 10_000, timeout: 10_000 },
    )
}

// ---------- renewals ----------

export type RenewalReport = {
    examined: number
    charged: number
    declined: number
    expired: number
    cancelled: number
    skipped: number
    errors: number
}

type DueMembership = Prisma.MembershipGetPayload<{ include: { user: { select: { paymentCustomerId: true } } } }>

// Finds ACTIVE memberships whose period has ended and either ends them or charges the saved card.
// Run by hand now (scripts/billing-run.ts); Project 7 runs it on a schedule.
export async function renewDue(
    gateway: PaymentGateway,
    now = new Date(),
    // userIds limits a run to certain people. The proof script uses it so it never touches real data.
    options: { limit?: number; userIds?: string[] } = {},
): Promise<RenewalReport> {
    const report: RenewalReport = { examined: 0, charged: 0, declined: 0, expired: 0, cancelled: 0, skipped: 0, errors: 0 }

    const due = await db.membership.findMany({
        where: {
            status: 'ACTIVE',
            currentPeriodEnd: { lte: now },
            ...(options.userIds ? { userId: { in: options.userIds } } : {}),
        },
        orderBy: { currentPeriodEnd: 'asc' },
        take: options.limit ?? 100,
        include: { user: { select: { paymentCustomerId: true } } },
    })

    for (const membership of due) {
        report.examined++
        try {
            await settleDue(gateway, membership, report)
        } catch (error) {
            // One bad membership must not stop everyone behind it.
            report.errors++
            console.error(`Billing failed for membership ${membership.id}`, error)
        }
    }
    return report
}

async function settleDue(gateway: PaymentGateway, m: DueMembership, report: RenewalReport): Promise<void> {
    const periodEnd = m.currentPeriodEnd
    if (!periodEnd) return // cannot happen: the query only returns memberships with an end date

    // A pass has run its course, or the member asked to stop at the end of this period.
    if (m.kind === 'ONE_TIME' || m.cancelAtPeriodEnd) {
        const next = nextStatus(m.status, m.cancelAtPeriodEnd ? 'CANCEL_NOW' : 'PERIOD_ENDED')
        if (!next) return
        // Conditional on the status we read, so a change made in the meantime wins.
        const result = await db.membership.updateMany({
            where: { id: m.id, status: m.status },
            data: { status: next, endDate: periodEnd },
        })
        if (result.count === 1) {
            if (next === 'CANCELLED') report.cancelled++
            else report.expired++
        }
        return
    }

    if (!m.interval) throw new Error(`Recurring membership ${m.id} has no interval`)
    const periodStart = periodEnd
    const newEnd = nextPeriodEnd(m.interval, periodStart, m.startDate.getUTCDate())

    // One bill per period. The unique index (membership + period start) means a second run
    // cannot create a second bill, so a member can never be billed twice for the same month.
    let bill = await db.billingEvent.findUnique({
        where: { membershipId_periodStart: { membershipId: m.id, periodStart } },
    })
    if (!bill) {
        try {
            bill = await db.billingEvent.create({
                data: {
                    membershipId: m.id,
                    kind: 'RENEWAL',
                    listPriceCents: m.priceCents,
                    amountCents: m.priceCents, // promo codes apply to the first payment only
                    currency: m.currency,
                    periodStart,
                    periodEnd: newEnd,
                    attempts: 1,
                },
            })
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                report.skipped++ // another run created it a moment ago
                return
            }
            throw error
        }
    }
    if (bill.status !== 'PENDING') {
        report.skipped++ // already paid, or failed (retries are Project 7)
        return
    }

    if (!m.paymentMethodId || !m.user.paymentCustomerId) {
        await processPaymentEvent({
            id: `charge-failed:${bill.id}:${bill.attempts}`,
            provider: gateway.name,
            type: 'payment.failed',
            billingEventId: bill.id,
            failureMessage: 'No saved payment method',
        })
        report.declined++
        return
    }

    // The same bill and attempt always use the same key. If we crashed after charging but before
    // recording it, the next run repeats this call and the provider returns the original result.
    const result = await gateway.charge({
        customerId: m.user.paymentCustomerId,
        paymentMethodId: m.paymentMethodId,
        amountCents: bill.amountCents,
        currency: bill.currency,
        description: `${m.planName} renewal`,
        idempotencyKey: `renewal:${bill.id}:${bill.attempts}`,
        metadata: { billingEventId: bill.id, membershipId: m.id },
    })

    if (result.ok) {
        await processPaymentEvent({
            id: `charge:${result.providerPaymentId}`,
            provider: gateway.name,
            type: 'payment.succeeded',
            billingEventId: bill.id,
            providerPaymentId: result.providerPaymentId,
            paymentMethodId: m.paymentMethodId,
            amountCents: bill.amountCents,
        })
        report.charged++
    } else if (result.definite) {
        await processPaymentEvent({
            id: `charge-failed:${bill.id}:${bill.attempts}`,
            provider: gateway.name,
            type: 'payment.failed',
            billingEventId: bill.id,
            failureMessage: result.message,
        })
        report.declined++
    } else {
        // Unknown outcome: do nothing. The bill stays PENDING and the next run asks again with the same key.
        console.warn(`Unknown charge outcome for bill ${bill.id}: ${result.code}`)
        report.errors++
    }
}

// ---------- listing ----------

// Unpaid attempts older than two hours are abandoned checkouts, not worth showing.
const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000

export async function listMyMemberships(userId: string, now = new Date()) {
    return db.membership.findMany({
        where: {
            userId,
            planId: { not: null },
            OR: [{ status: { not: 'PENDING' } }, { createdAt: { gt: new Date(now.getTime() - ABANDONED_AFTER_MS) } }],
        },
        orderBy: { createdAt: 'desc' },
        include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } },
    })
}

// ---------- pause, resume and cancel ----------

export async function changeMembership(membershipId: string, action: MembershipAction, now = new Date()) {
    return db.$transaction(async (tx) => {
        await lockRow(tx, 'Membership', membershipId)
        const m = await tx.membership.findUnique({ where: { id: membershipId } })
        if (!m) throw new BillingError('NOT_FOUND', 'Membership not found', 404)

        const refuse = (message: string) => new BillingError('ILLEGAL_ACTION', message, 409)

        switch (action) {
            case 'pause': {
                if (nextStatus(m.status, 'PAUSE') === null) throw refuse('Only an active membership can be paused')
                if (!m.currentPeriodEnd || m.currentPeriodEnd <= now) {
                    throw refuse('This period has just ended, so the membership is about to renew or expire')
                }
                return tx.membership.update({ where: { id: m.id }, data: { status: 'PAUSED', pausedAt: now } })
            }

            case 'resume': {
                if (nextStatus(m.status, 'RESUME') === null || !m.pausedAt || !m.currentPeriodStart || !m.currentPeriodEnd) {
                    throw refuse('Only a paused membership can be resumed')
                }
                // The time spent paused is not used up: both ends of the period move forward by it.
                const shift = now.getTime() - m.pausedAt.getTime()
                return tx.membership.update({
                    where: { id: m.id },
                    data: {
                        status: 'ACTIVE',
                        pausedAt: null,
                        currentPeriodStart: new Date(m.currentPeriodStart.getTime() + shift),
                        currentPeriodEnd: new Date(m.currentPeriodEnd.getTime() + shift),
                    },
                })
            }

            case 'cancel_at_period_end': {
                if (m.status !== 'ACTIVE' || m.kind !== 'RECURRING') {
                    throw refuse('Only an active recurring membership can be set to end at the end of the period')
                }
                return tx.membership.update({ where: { id: m.id }, data: { cancelAtPeriodEnd: true } })
            }

            case 'undo_cancel': {
                if (m.status !== 'ACTIVE' || !m.cancelAtPeriodEnd) throw refuse('This membership is not set to end')
                return tx.membership.update({ where: { id: m.id }, data: { cancelAtPeriodEnd: false } })
            }

            case 'cancel_now': {
                if (nextStatus(m.status, 'CANCEL_NOW') === null) throw refuse('This membership has already ended')
                return tx.membership.update({
                    where: { id: m.id },
                    data: { status: 'CANCELLED', endDate: now, pausedAt: null, cancelAtPeriodEnd: false },
                })
            }
        }
    })
}

// ---------- refunds ----------

export async function refundPayment(
    gateway: PaymentGateway,
    input: { paymentId: string; amountCents: number; reason?: string; actorId: string },
) {
    return db.$transaction(
        async (tx) => {
            // Lock the payment: two staff members refunding at once cannot refund more than was paid.
            await lockRow(tx, 'Payment', input.paymentId)
            const payment = await tx.payment.findUnique({
                where: { id: input.paymentId },
                include: { _count: { select: { refunds: true } } },
            })
            if (!payment) throw new BillingError('NOT_FOUND', 'Payment not found', 404)
            if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
                throw new BillingError('INVALID_AMOUNT', 'Enter an amount above zero', 400)
            }

            const remaining = payment.amountCents - payment.refundedCents
            if (input.amountCents > remaining) {
                throw new BillingError(
                    'REFUND_TOO_LARGE',
                    `Only ${formatMoney(remaining, payment.currency)} can still be refunded`,
                    409,
                )
            }

            // The key depends on the payment, how many refunds exist and the amount. If we crash after the
            // provider refunds but before we save, repeating the same request gets the same refund back.
            const result = await gateway.refund({
                providerPaymentId: payment.providerPaymentId,
                amountCents: input.amountCents,
                idempotencyKey: `refund:${payment.id}:${payment._count.refunds}:${input.amountCents}`,
            })
            if (!result.ok) throw new BillingError('REFUND_FAILED', result.message, 502)

            await tx.refund.create({
                data: {
                    paymentId: payment.id,
                    amountCents: input.amountCents,
                    providerRefundId: result.providerRefundId,
                    reason: input.reason ?? null,
                    createdById: input.actorId,
                },
            })
            return tx.payment.update({
                where: { id: payment.id },
                data: { refundedCents: { increment: input.amountCents } },
            })
        },
        { maxWait: 10_000, timeout: 20_000 },
    )
}