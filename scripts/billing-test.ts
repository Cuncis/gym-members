import { db } from '../src/lib/db'
import { withProofGym } from '../src/lib/script-gym'
import {
    BillingError,
    changeMembership,
    processPaymentEvent,
    refundPayment,
    renewDue,
    startCheckout,
} from '../src/lib/billing'
import { FakeGateway } from '../src/lib/payment-gateways/fake'
import type { PaymentEvent } from '../src/lib/payment-gateways/types'

const DAY = 86_400_000

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const runId = Date.now()
    const startedAt = new Date()
    const gateway = new FakeGateway()

    const failures: string[] = []
    const check = (ok: boolean, label: string) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
        if (!ok) failures.push(label)
    }

    const created = { users: [] as string[], plans: [] as string[], discounts: [] as string[] }

    let counter = 0
    const succeeded = (
        billId: string,
        amountCents: number,
        paymentId: string,
        id = `evt-${runId}-${++counter}`,
    ): PaymentEvent => ({
        id,
        provider: 'fake',
        type: 'payment.succeeded',
        billingEventId: billId,
        providerPaymentId: paymentId,
        paymentMethodId: `pm_${runId}`,
        amountCents,
    })
    const failed = (billId: string, id = `evt-${runId}-${++counter}`): PaymentEvent => ({
        id,
        provider: 'fake',
        type: 'payment.failed',
        billingEventId: billId,
        failureMessage: 'Your card was declined',
    })

    try {
        const makeUser = async (name: string) => {
            const user = await db.user.create({
                data: { name, email: `billing-${runId}-${name.toLowerCase()}@example.com` },
                select: { id: true },
            })
            created.users.push(user.id)
            return user
        }
        const alice = await makeUser('Alice') // promo code, renewal, decline, refunds
        const bob = await makeUser('Bob') // one-time pass
        const carol = await makeUser('Carol') // cancel at period end
        const dave = await makeUser('Dave') // unknown charge outcome
        const erin = await makeUser('Erin') // pause and resume
        // Only these people are ever billed by this script, never real data in your database.
        const scope = { userIds: [...created.users] }

        const monthly = await db.membershipPlan.create({
            data: { name: `Test monthly ${runId}`, priceCents: 4900, kind: 'RECURRING', interval: 'MONTH' },
        })
        // A pass that lasts 45 days, so it does not run out during the earlier checks.
        const dayPass = await db.membershipPlan.create({
            data: { name: `Test pass ${runId}`, priceCents: 1500, kind: 'ONE_TIME', durationDays: 45 },
        })
        created.plans.push(monthly.id, dayPass.id)
        const promo = await db.discount.create({ data: { code: `T${runId}`, type: 'PERCENT', value: 10 } })
        created.discounts.push(promo.id)

        const buy = async (userId: string, planId: string, code?: string) => {
            const { membershipId } = await startCheckout(gateway, { userId, planId, code })
            const bill = await db.billingEvent.findFirstOrThrow({ where: { membershipId } })
            return { membershipId, bill }
        }
        const membership = (id: string) => db.membership.findUniqueOrThrow({ where: { id } })
        const paymentCount = (membershipId: string) => db.payment.count({ where: { membershipId } })
        let paymentNo = 0
        const pay = async (billId: string, amountCents: number) => {
            await processPaymentEvent(succeeded(billId, amountCents, `pi_${runId}_${++paymentNo}`))
        }
        const catchError = async (fn: () => Promise<unknown>) => {
            try {
                await fn()
                return null
            } catch (e) {
                return e
            }
        }

        // ---- 1. Checkout and promo codes
        const a = await buy(alice.id, monthly.id, promo.code.toLowerCase())
        check(
            a.bill.amountCents === 4410 && a.bill.discountCents === 490,
            'checkout applies a 10% code (typed in lower case): 49.00 becomes 44.10',
        )
        check((await membership(a.membershipId)).status === 'PENDING', 'a new membership waits as PENDING until it is paid')
        check(
            gateway.checkouts.length === 1 && gateway.checkouts[0].amountCents === 4410,
            'the gateway is asked to collect the discounted amount',
        )

        // ---- 2. The same event, again and again
        const first = succeeded(a.bill.id, 4410, `pi_${runId}_alice1`, `evt-${runId}-first`)
        const r1 = await processPaymentEvent(first)
        const r2 = await processPaymentEvent(first)
        check(r1 === 'processed' && r2 === 'duplicate', 'the same event twice: processed once, then recognised as a duplicate')
        check((await paymentCount(a.membershipId)) === 1, 'one payment row, not two')
        const alice1 = await membership(a.membershipId)
        check(
            alice1.status === 'ACTIVE' && alice1.currentPeriodEnd !== null && alice1.paymentMethodId !== null,
            'paid: the membership is ACTIVE with a period and a saved card',
        )
        check(
            (await db.discount.findUniqueOrThrow({ where: { id: promo.id } })).redeemedCount === 1,
            'the promo code is counted as used once',
        )

        await processPaymentEvent(succeeded(a.bill.id, 4410, `pi_${runId}_alice1`)) // new event id, same bill
        check(
            (await paymentCount(a.membershipId)) === 1 &&
                (await db.discount.findUniqueOrThrow({ where: { id: promo.id } })).redeemedCount === 1,
            'a second event for an already-paid bill changes nothing',
        )

        await processPaymentEvent(failed(a.bill.id))
        const billAfterLateFailure = await db.billingEvent.findUniqueOrThrow({ where: { id: a.bill.id } })
        check(
            billAfterLateFailure.status === 'PAID' && (await membership(a.membershipId)).status === 'ACTIVE',
            'a late "failed" event cannot undo a payment',
        )

        // ---- 3. Failed, then paid, with eight copies arriving at once
        const b = await buy(bob.id, dayPass.id)
        await processPaymentEvent(failed(b.bill.id))
        check(
            (await db.billingEvent.findUniqueOrThrow({ where: { id: b.bill.id } })).status === 'FAILED' &&
                (await membership(b.membershipId)).status === 'PENDING',
            'a failed attempt marks the bill FAILED and leaves the membership PENDING',
        )

        const race = succeeded(b.bill.id, 1500, `pi_${runId}_bob`, `evt-${runId}-race`)
        const results = await Promise.all(Array.from({ length: 8 }, () => processPaymentEvent(race)))
        check(
            results.filter((r) => r === 'processed').length === 1 && results.filter((r) => r === 'duplicate').length === 7,
            'eight copies of one event at the same moment: one processed, seven duplicates',
        )
        check((await paymentCount(b.membershipId)) === 1, 'and exactly one payment row')
        const bob1 = await membership(b.membershipId)
        check(
            bob1.status === 'ACTIVE' && bob1.paymentMethodId === null,
            'a failed bill can still be paid later (another card); a one-time pass keeps no card',
        )

        // ---- 4. Events that are not ours
        const stranger = await processPaymentEvent({
            id: `evt-${runId}-stranger`,
            provider: 'fake',
            type: 'payment.succeeded',
            providerPaymentId: `pi_${runId}_stranger`,
            amountCents: 100,
        })
        const ignored = await processPaymentEvent({ id: `evt-${runId}-ignored`, provider: 'fake', type: 'ignored' })
        check(
            stranger === 'processed' &&
                ignored === 'processed' &&
                (await db.payment.count({ where: { providerPaymentId: `pi_${runId}_stranger` } })) === 0,
            'events for payments this app did not start are acknowledged and change nothing',
        )

        // ---- 5. Renewals
        const end1 = alice1.currentPeriodEnd as Date
        const early = await renewDue(gateway, new Date(end1.getTime() - DAY), scope)
        check(early.examined === 0 && gateway.charges.length === 0, 'nothing is charged before the period ends')

        const at1 = new Date(end1.getTime() + 1000)
        const run1 = await renewDue(gateway, at1, scope)
        check(
            run1.charged === 1 && gateway.charges.length === 1 && gateway.charges[0].amountCents === 4900,
            'at the end of the period the full price is charged (a promo code covers the first payment only)',
        )
        const alice2 = await membership(a.membershipId)
        check(
            alice2.status === 'ACTIVE' && (alice2.currentPeriodEnd as Date) > end1,
            'the period moves forward after a renewal',
        )
        const renewal = await db.billingEvent.findFirstOrThrow({ where: { membershipId: a.membershipId, kind: 'RENEWAL' } })
        check(
            renewal.status === 'PAID' && renewal.periodStart.getTime() === end1.getTime(),
            'the renewal bill is PAID and starts exactly where the last period ended',
        )
        const again = await renewDue(gateway, at1, scope)
        check(again.examined === 0 && gateway.charges.length === 1, 'running the billing engine again charges nobody twice')
        await processPaymentEvent(succeeded(renewal.id, 4900, gateway.charges[0].providerPaymentId))
        check((await paymentCount(a.membershipId)) === 2, "the provider's own webhook for the same renewal is ignored: two payments in total")

        // ---- 6. A declined renewal
        const end2 = alice2.currentPeriodEnd as Date
        const at2 = new Date(end2.getTime() + 1000)
        gateway.failNextCharge('card_declined')
        const run3 = await renewDue(gateway, at2, scope)
        const alice3 = await membership(a.membershipId)
        check(run3.declined === 1 && alice3.status === 'PAST_DUE', 'a declined renewal makes the membership PAST_DUE')
        const failedBill = await db.billingEvent.findFirstOrThrow({
            where: { membershipId: a.membershipId, periodStart: end2 },
        })
        check(failedBill.status === 'FAILED' && !!failedBill.failureMessage, 'the bill is FAILED and keeps the reason')
        check(gateway.charges.length === 1 && (await paymentCount(a.membershipId)) === 2, 'no money moved')
        const run4 = await renewDue(gateway, at2, scope)
        check(run4.examined === 0, 'a PAST_DUE membership is left alone by this run (retries are Project 7)')

        const blocked = await catchError(() => startCheckout(gateway, { userId: alice.id, planId: monthly.id }))
        check(
            blocked instanceof BillingError && blocked.code === 'ALREADY_SUBSCRIBED',
            'a member with a PAST_DUE membership cannot buy the same plan again',
        )
        const cannotPause = await catchError(() => changeMembership(a.membershipId, 'pause', at2))
        check(
            cannotPause instanceof BillingError && cannotPause.code === 'ILLEGAL_ACTION',
            'a PAST_DUE membership cannot be paused',
        )

        // ---- 7. An unknown outcome is not a decline
        const d = await buy(dave.id, monthly.id)
        await pay(d.bill.id, 4900)
        const daveEnd = (await membership(d.membershipId)).currentPeriodEnd as Date
        const atDave = new Date(daveEnd.getTime() + 1000)
        gateway.failNextCharge('network_error', false)
        const unknown = await renewDue(gateway, atDave, scope)
        const daveBill = await db.billingEvent.findFirstOrThrow({ where: { membershipId: d.membershipId, kind: 'RENEWAL' } })
        check(
            unknown.errors === 1 && daveBill.status === 'PENDING' && (await membership(d.membershipId)).status === 'ACTIVE',
            'a timeout leaves the bill PENDING and the membership ACTIVE: not knowing is not a decline',
        )
        const retry = await renewDue(gateway, atDave, scope)
        check(
            retry.charged === 1 &&
                (await db.billingEvent.findUniqueOrThrow({ where: { id: daveBill.id } })).status === 'PAID',
            'the next run asks again with the same key and the bill is paid',
        )

        // ---- 8. Cancelling at the end of the period
        const c = await buy(carol.id, monthly.id)
        await pay(c.bill.id, 4900)
        await changeMembership(c.membershipId, 'cancel_at_period_end')
        await changeMembership(c.membershipId, 'undo_cancel')
        check(!(await membership(c.membershipId)).cancelAtPeriodEnd, 'cancelling at period end can be undone')
        await changeMembership(c.membershipId, 'cancel_at_period_end')
        const carolEnd = (await membership(c.membershipId)).currentPeriodEnd as Date
        const chargesBefore = gateway.charges.length
        const run5 = await renewDue(gateway, new Date(carolEnd.getTime() + 1000), scope)
        const carol1 = await membership(c.membershipId)
        check(
            run5.cancelled >= 1 &&
                carol1.status === 'CANCELLED' &&
                carol1.endDate?.getTime() === carolEnd.getTime() &&
                gateway.charges.length === chargesBefore,
            'a membership set to end is CANCELLED at the end of its period and never charged again',
        )
        const cancelTwice = await catchError(() => changeMembership(c.membershipId, 'cancel_at_period_end'))
        check(cancelTwice instanceof BillingError, 'a cancelled membership cannot be changed any more')

        // ---- 9. A one-time pass runs out
        const bobEnd = bob1.currentPeriodEnd as Date
        await renewDue(gateway, new Date(bobEnd.getTime() + 1000), scope)
        check((await membership(b.membershipId)).status === 'EXPIRED', 'a one-time pass becomes EXPIRED when its time is up')

        // ---- 10. Pause and resume
        const e = await buy(erin.id, monthly.id)
        await pay(e.bill.id, 4900)
        const erinBefore = await membership(e.membershipId)
        const t0 = new Date()
        await changeMembership(e.membershipId, 'pause', t0)
        check((await membership(e.membershipId)).status === 'PAUSED', 'an active membership can be paused')
        const whilePaused = await renewDue(gateway, new Date(t0.getTime() + 60 * DAY), { userIds: [erin.id] })
        check(
            whilePaused.charged === 0 && (await membership(e.membershipId)).status === 'PAUSED',
            'a paused membership is not billed, however long it stays paused',
        )
        const pausedTwice = await catchError(() => changeMembership(e.membershipId, 'pause', t0))
        check(pausedTwice instanceof BillingError, 'pausing twice is refused')
        await changeMembership(e.membershipId, 'resume', new Date(t0.getTime() + 10 * DAY))
        const erinAfter = await membership(e.membershipId)
        check(
            erinAfter.status === 'ACTIVE' &&
                erinAfter.pausedAt === null &&
                (erinAfter.currentPeriodEnd as Date).getTime() - (erinBefore.currentPeriodEnd as Date).getTime() === 10 * DAY,
            'resuming moves the period forward by exactly the time spent paused',
        )

        // ---- 11. Refunds
        const firstPayment = await db.payment.findFirstOrThrow({
            where: { membershipId: a.membershipId },
            orderBy: { createdAt: 'asc' },
        })
        await refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 1000, actorId: alice.id, reason: 'test' })
        check(
            (await db.payment.findUniqueOrThrow({ where: { id: firstPayment.id } })).refundedCents === 1000,
            'a partial refund is recorded',
        )

        const tooLarge = await catchError(() =>
            refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 4410, actorId: alice.id }),
        )
        check(tooLarge instanceof BillingError && tooLarge.code === 'REFUND_TOO_LARGE', 'refunding more than was paid is refused')

        const both = await Promise.allSettled([
            refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 2000, actorId: alice.id }),
            refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 2000, actorId: alice.id }),
        ])
        const accepted = both.filter((r) => r.status === 'fulfilled').length
        const refused = both.filter(
            (r) => r.status === 'rejected' && r.reason instanceof BillingError && r.reason.code === 'REFUND_TOO_LARGE',
        ).length
        check(accepted === 1 && refused === 1, 'two refunds at the same moment that together exceed the payment: one is accepted, one refused')

        const paymentNow = await db.payment.findUniqueOrThrow({ where: { id: firstPayment.id } })
        check(
            paymentNow.refundedCents === 3000 &&
                (await db.refund.count({ where: { paymentId: firstPayment.id } })) === 2 &&
                gateway.refunds.length === 2,
            'refunded total 30.00 in two refund rows, and the gateway saw exactly two refunds',
        )

        gateway.failNextRefund()
        const refundFailed = await catchError(() =>
            refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 100, actorId: alice.id }),
        )
        check(
            refundFailed instanceof BillingError &&
                refundFailed.code === 'REFUND_FAILED' &&
                (await db.payment.findUniqueOrThrow({ where: { id: firstPayment.id } })).refundedCents === 3000 &&
                (await db.refund.count({ where: { paymentId: firstPayment.id } })) === 2,
            'a refund the gateway rejects leaves no trace in our records',
        )
        const zero = await catchError(() =>
            refundPayment(gateway, { paymentId: firstPayment.id, amountCents: 0, actorId: alice.id }),
        )
        check(zero instanceof BillingError && zero.code === 'INVALID_AMOUNT', 'a refund of zero is refused')

        console.log('\nThis whole run used the fake gateway: no Stripe code ran.')
    } finally {
        await db.user.deleteMany({ where: { id: { in: created.users } } }) // memberships, bills, payments and refunds go with them
        await db.membershipPlan.deleteMany({ where: { id: { in: created.plans } } })
        await db.discount.deleteMany({ where: { id: { in: created.discounts } } })
        await db.webhookEvent.deleteMany({ where: { id: { startsWith: 'fake:' }, processedAt: { gte: startedAt } } })
        await db.$disconnect()
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} check(s) failed`)
        process.exitCode = 1
    } else {
        console.log('\nAll checks passed')
    }
}

withProofGym('billing', main).catch((e) => {
    console.error(e)
    process.exit(1)
})
