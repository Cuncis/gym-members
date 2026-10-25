import { db } from '../src/lib/db'
import { processPaymentEvent, startCheckout } from '../src/lib/billing'
import { DAY_MS } from '../src/lib/dunning'
import { queueBillingNotices, queueReminders, renewAll, retryFailedBills } from '../src/lib/jobs'
import { FakeSender } from '../src/lib/messaging/fake'
import { deliverPending } from '../src/lib/notifications'
import { FakeGateway } from '../src/lib/payment-gateways/fake'

// Pretend dates. Day 0 is the day Alice, Bob and Dave's renewals are due.
const DUE = new Date('2030-03-10T12:00:00Z')
const at = (days: number, hours = 0) => new Date(DUE.getTime() + days * DAY_MS + hours * 3_600_000)
const REMIND = new Date('2030-06-01T09:00:00Z')

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const runId = Date.now()
    const gateway = new FakeGateway()
    const emails = new FakeSender('email')
    const texts = new FakeSender('sms')
    const senders = { email: emails, sms: texts }

    const failures: string[] = []
    const check = (ok: boolean, label: string) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
        if (!ok) failures.push(label)
    }

    const created = { users: [] as string[], plans: [] as string[] }

    try {
        const makeUser = async (name: string, phone: string | null, sms: boolean) => {
            const user = await db.user.create({
                data: {
                    name,
                    email: `jobs-${runId}-${name.toLowerCase()}@example.com`,
                    phone,
                    smsOptIn: sms,
                    smsConsentAt: sms ? new Date() : null,
                },
                select: { id: true, email: true },
            })
            created.users.push(user.id)
            return user
        }
        const alice = await makeUser('Alice', '(555) 234-5678', true) // declines, then the retry works
        const bob = await makeUser('Bob', '555-234-0000', false) // never pays, has a phone but did not opt in to texts
        const carol = await makeUser('Carol', '+15552340001', true) // renewal reminder
        const dave = await makeUser('Dave', null, false) // the provider times out during a retry
        const erin = await makeUser('Erin', null, false) // a pass that is about to end
        const scope = { userIds: [alice.id, bob.id, carol.id, dave.id, erin.id] }

        const monthly = await db.membershipPlan.create({
            data: { name: `Jobs monthly ${runId}`, priceCents: 4900, kind: 'RECURRING', interval: 'MONTH' },
        })
        const pass = await db.membershipPlan.create({
            data: { name: `Jobs pass ${runId}`, priceCents: 1500, kind: 'ONE_TIME', durationDays: 45 },
        })
        created.plans.push(monthly.id, pass.id)

        let counter = 0
        const subscribe = async (userId: string, planId: string) => {
            const { membershipId } = await startCheckout(gateway, { userId, planId })
            const bill = await db.billingEvent.findFirstOrThrow({ where: { membershipId } })
            counter++
            await processPaymentEvent({
                id: `jobs-evt-${runId}-${counter}`,
                provider: 'fake',
                type: 'payment.succeeded',
                billingEventId: bill.id,
                providerPaymentId: `pi_jobs_${runId}_${counter}`,
                paymentMethodId: `pm_${runId}`,
                amountCents: bill.amountCents,
            })
            return membershipId
        }
        const setPeriod = (id: string, start: Date, end: Date) =>
            db.membership.update({ where: { id }, data: { currentPeriodStart: start, currentPeriodEnd: end } })
        const membership = (id: string) => db.membership.findUniqueOrThrow({ where: { id } })
        const billOf = (membershipId: string) => db.billingEvent.findFirstOrThrow({ where: { membershipId, kind: 'RENEWAL' } })
        const notifications = (userId: string, template?: string) =>
            db.notification.findMany({ where: { userId, ...(template ? { template } : {}) }, orderBy: { channel: 'asc' } })

        const mAlice = await subscribe(alice.id, monthly.id)
        const mBob = await subscribe(bob.id, monthly.id)
        const mDave = await subscribe(dave.id, monthly.id)
        for (const id of [mAlice, mBob, mDave]) await setPeriod(id, at(-30), at(0))
        const mCarol = await subscribe(carol.id, monthly.id)
        await setPeriod(mCarol, new Date(REMIND.getTime() - 28 * DAY_MS), new Date(REMIND.getTime() + 2 * DAY_MS))
        const mErin = await subscribe(erin.id, pass.id)
        await setPeriod(mErin, new Date(REMIND.getTime() - 43.5 * DAY_MS), new Date(REMIND.getTime() + 1.5 * DAY_MS))

        // ---------- day 0: the renewal is due ----------
        console.log('\n-- Day 0: renewals are due --')
        const early = await renewAll(gateway, at(-1), scope)
        check(early.examined === 0, 'nothing is due the day before')

        for (const user of [alice, bob, dave]) {
            gateway.failNextCharge('card_declined')
            await renewAll(gateway, at(0, 1), { userIds: [user.id] })
        }
        check((await membership(mAlice)).status === 'PAST_DUE', 'a declined renewal makes the membership PAST_DUE')
        const aliceBill = await billOf(mAlice)
        check(aliceBill.status === 'FAILED' && aliceBill.attempts === 1, 'the bill is FAILED after attempt 1')

        const notices = await queueBillingNotices(at(0, 2), scope)
        check(notices.failures === 3, 'one "payment failed" notice is queued for each of the three members')
        check((await queueBillingNotices(at(0, 3), scope)).failures === 0, 'asking again queues nothing: the dedupe key holds')
        check((await notifications(alice.id)).length === 2, 'each notice has an email row and a text row')

        const sent0 = await deliverPending(senders, at(0, 3), scope)
        check(emails.sent.length === 3, 'three emails went out')
        check(texts.sent.length === 1 && texts.sent[0].to === '+15552345678', 'one text went out, to Alice, in international format')
        check(sent0.skipped === 2, 'Bob (no opt-in) and Dave (no phone) were skipped for text')
        const bobText = (await notifications(bob.id)).find((n) => n.channel === 'SMS')!
        check(bobText.status === 'SKIPPED' && /opted in/.test(bobText.error ?? ''), 'a skipped text records the reason')
        check(texts.sent[0].text.includes('try again on Mar 11, 2030'), 'the text names the retry date in the gym time zone')
        check(texts.sent[0].text.includes('Reply STOP'), 'the text carries the opt-out line')
        const aliceMail = emails.sent.find((m) => m.to === alice.email)!
        check(aliceMail.html?.includes('We could not take your payment') === true, 'the email says what happened')

        const chargesBefore = gateway.charges.length
        const tooSoon = await retryFailedBills(gateway, at(0, 5), scope)
        check(tooSoon.waiting === 3 && gateway.charges.length === chargesBefore, 'retrying the same day waits and charges nobody')

        // ---------- day 1: first retry ----------
        console.log('\n-- Day 1: first retry --')
        const r1 = await retryFailedBills(gateway, at(1, 1), { userIds: [alice.id] })
        check(r1.recovered === 1, "Alice's retry works")
        const alice1 = await membership(mAlice)
        const aliceBill1 = await billOf(mAlice)
        check(alice1.status === 'ACTIVE' && aliceBill1.status === 'PAID' && aliceBill1.attempts === 2, 'she is ACTIVE again and the bill is PAID')
        check(alice1.currentPeriodEnd?.getTime() === aliceBill1.periodEnd.getTime(), 'her period is the one the bill covers')
        check((await db.payment.count({ where: { membershipId: mAlice } })) === 2, 'two payments in total: the first month and this one')

        gateway.failNextCharge('card_declined')
        const r1b = await retryFailedBills(gateway, at(1, 1), { userIds: [bob.id] })
        const bob1 = await billOf(mBob)
        check(r1b.declined === 1 && bob1.attempts === 2 && (await membership(mBob)).status === 'PAST_DUE', "Bob's retry is declined and he stays PAST_DUE")

        gateway.failNextCharge('network_error', false)
        const r1c = await retryFailedBills(gateway, at(1, 1), { userIds: [dave.id] })
        const daveBillUnknown = await billOf(mDave)
        check(r1c.errors === 1 && daveBillUnknown.attempts === 1, 'a timeout is not counted as an attempt: attempts stays at 1')
        check((await membership(mDave)).status === 'PAST_DUE', 'and Dave is left as he was')
        const r1d = await retryFailedBills(gateway, at(1, 2), { userIds: [dave.id] })
        const daveKey = `renewal:${daveBillUnknown.id}:2`
        check(r1d.recovered === 1 && (await membership(mDave)).status === 'ACTIVE', 'the next run asks again and Dave is recovered')
        check(gateway.charges.filter((c) => c.key === daveKey).length === 1, 'the money moved exactly once for that key')

        const notices1 = await queueBillingNotices(at(1, 3), scope)
        check(notices1.failures === 1, "only Bob's second failure is news: he gets a new notice")
        await deliverPending(senders, at(1, 4), scope)
        check(
            emails.sent.some((m) => m.to === bob.email && m.text.includes('We will try again on Mar 13, 2030')),
            "Bob's email names the next retry (day 3)",
        )

        // ---------- day 3 and 7: Bob keeps failing ----------
        console.log('\n-- Day 3 and day 7: Bob keeps failing --')
        gateway.failNextCharge('card_declined')
        await retryFailedBills(gateway, at(3, 1), { userIds: [bob.id] })
        gateway.failNextCharge('card_declined')
        await retryFailedBills(gateway, at(7, 1), { userIds: [bob.id] })
        check((await billOf(mBob)).attempts === 4, 'Bob has now had four attempts')
        await queueBillingNotices(at(7, 2), scope)
        await deliverPending(senders, at(7, 3), scope)
        check(
            emails.sent.some((m) => m.to === bob.email && m.text.includes('last attempt')),
            'the fourth notice says it was the last attempt',
        )
        const waitBeforeEnd = await retryFailedBills(gateway, at(7, 4), { userIds: [bob.id] })
        check(waitBeforeEnd.waiting === 1 && (await membership(mBob)).status === 'PAST_DUE', 'he gets one more day before anything is cancelled')

        // ---------- day 8: give up ----------
        console.log('\n-- Day 8: the membership ends --')
        const chargesBeforeEnd = gateway.charges.length
        const end = await retryFailedBills(gateway, at(8, 1), { userIds: [bob.id] })
        check(end.gaveUp === 1 && (await membership(mBob)).status === 'CANCELLED', 'Bob is CANCELLED')
        check(gateway.charges.length === chargesBeforeEnd, 'no charge was made when giving up')
        check((await notifications(bob.id, 'membership_ended')).length === 2, 'an "ended" notice was queued (email and text rows)')
        const again = await retryFailedBills(gateway, at(9), { userIds: [bob.id] })
        check(again.examined === 0, 'a cancelled membership is never looked at again')
        check((await notifications(bob.id, 'membership_ended')).length === 2, 'so no second "ended" notice')
        await deliverPending(senders, at(8, 2), scope)
        check(emails.sent.some((m) => m.to === bob.email && m.subject === 'Your membership has ended'), 'the "ended" email went out')

        // ---------- reminders ----------
        console.log('\n-- Reminders --')
        const reminders = await queueReminders(REMIND, scope)
        check(reminders.renewals === 1 && reminders.endings === 1, 'Carol gets a renewal reminder and Erin an ending reminder')
        const again2 = await queueReminders(new Date(REMIND.getTime() + 3_600_000), scope)
        check(again2.renewals === 0 && again2.endings === 0, 'an hour later nothing is queued twice')

        const carolSms = (await notifications(carol.id, 'renewal_reminder')).find((n) => n.channel === 'SMS')!
        emails.failNext(true) // the provider is busy for the first email
        const rep1 = await deliverPending(senders, REMIND, scope)
        check(rep1.retrying === 1, 'a busy provider means the message is kept for later')
        const waiting = await db.notification.findMany({ where: { userId: { in: scope.userIds }, status: 'PENDING' } })
        check(waiting.length === 1 && waiting[0].attempts === 1 && waiting[0].nextAttemptAt > REMIND, 'it waits, with the attempt counted')
        const rep0 = await deliverPending(senders, new Date(REMIND.getTime() + 60_000), scope)
        check(rep0.examined === 0, 'it is not tried again before its time')
        const rep2 = await deliverPending(senders, new Date(REMIND.getTime() + 3_600_000), scope)
        check(rep2.sent === 1, 'later, it goes out')
        const ids = new Set(emails.sent.map((m) => m.idempotencyKey))
        check(ids.size === emails.sent.length, 'no email was sent twice')
        check((await db.notification.findUniqueOrThrow({ where: { id: carolSms.id } })).status === 'SENT', "Carol's text was sent")
        check(texts.sent.some((m) => m.to === '+15552340001' && m.text.includes('renews on')), 'it names the renewal date')

        // ---------- receipts ----------
        console.log('\n-- Receipts --')
        const realNow = new Date()
        const receipts = await queueBillingNotices(realNow, scope)
        check(receipts.receipts === 7, 'one receipt for each of the seven payments made in this run')
        check((await queueBillingNotices(realNow, scope)).receipts === 0, 'asking again queues none')
        const last = await deliverPending(senders, new Date(), scope)
        check(last.sent === 7 && last.failed === 0, 'all seven were sent')
        const stillPending = await db.notification.count({ where: { userId: { in: scope.userIds }, status: 'PENDING' } })
        check(stillPending === 0, 'nothing is left waiting')

        console.log('\nThis whole run used the fake gateway and fake senders: no money moved and no message left your computer.')
    } finally {
        await db.user.deleteMany({ where: { id: { in: created.users } } }) // memberships, bills, payments and notifications go with them
        await db.membershipPlan.deleteMany({ where: { id: { in: created.plans } } })
        await db.webhookEvent.deleteMany({ where: { id: { startsWith: 'fake:jobs-evt-' } } })
        await db.$disconnect()
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} check(s) failed`)
        process.exitCode = 1
    } else {
        console.log('\nAll checks passed')
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})