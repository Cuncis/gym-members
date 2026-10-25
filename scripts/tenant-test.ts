import fs from 'node:fs'
import path from 'node:path'
import { processPaymentEvent } from '../src/lib/billing'
import { bookSession, cancelBooking } from '../src/lib/bookings'
import { db } from '../src/lib/db'
import { rawDb } from '../src/lib/raw-db'
import { clearGymCache, findGymByHost } from '../src/lib/tenant'
import { NoGymError, runInGym } from '../src/lib/tenant-context'
import { CrossGymError, TENANT_MODELS } from '../src/lib/tenant-scope'

// Proves, against the real database, that one gym can never see or change another gym's data.
// It creates two gyms of its own (proof-iso-a and proof-iso-b) and removes them again.

const DAY = 86_400_000
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const failures: string[] = []
    const check = (ok: boolean, label: string) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
        if (!ok) failures.push(label)
    }
    const rejects = async (promise: Promise<unknown>, test: (e: unknown) => boolean = () => true) => {
        try {
            await promise
            return false
        } catch (error) {
            return test(error)
        }
    }

    const run = Date.now()
    const slugA = `proof-iso-a-${run}`.slice(0, 30)
    const slugB = `proof-iso-b-${run}`.slice(0, 30)
    const gymA = await rawDb.gym.create({ data: { slug: slugA, name: 'Alpha Gym', timeZone: 'Asia/Jakarta' } })
    const gymB = await rawDb.gym.create({ data: { slug: slugB, name: 'Beta Studio', timeZone: 'America/New_York', brandColor: '#15803d' } })
    const inA = <T>(fn: () => Promise<T>) => runInGym(gymA.id, fn)
    const inB = <T>(fn: () => Promise<T>) => runInGym(gymB.id, fn)

    try {
        // ---------- 1. the list of tenant models matches the schema ----------
        console.log('\n1. The list of gym-owned tables')
        const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
        const withGymId = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
            // GymDomain has a gymId too, but it is read across gyms on purpose (to turn an address into a gym), so it is not scoped.
            .filter((m) => /^\s+gymId\s/m.test(m[2]) && m[1] !== 'GymDomain')
            .map((m) => m[1])
            .sort()
        check(withGymId.length === 12, `the schema has 12 tables with a gymId (found ${withGymId.length})`)
        check(JSON.stringify(withGymId) === JSON.stringify([...TENANT_MODELS].sort()), 'TENANT_MODELS lists exactly those tables')

        // ---------- 2. fail closed ----------
        console.log('\n2. No gym means no data')
        let allClosed = true
        for (const model of TENANT_MODELS) {
            const delegate = (db as unknown as Record<string, { findMany: () => Promise<unknown> }>)[lower(model)]
            if (!(await rejects(delegate.findMany(), (e) => e instanceof NoGymError))) allClosed = false
        }
        check(allClosed, 'findMany on every gym-owned table refuses to run without a gym')
        check(
            await rejects(db.user.create({ data: { name: 'X', email: `nogym-${run}@example.com` } }), (e) => e instanceof NoGymError),
            'a write without a gym is refused too',
        )

        // ---------- 3. build the same world in both gyms ----------
        console.log('\n3. Create data in both gyms through the scoped client')
        type Ids = Record<string, string>
        const build = (tag: string) =>
            async () => {
                const user = await db.user.create({ data: { name: `User ${tag}`, email: `u-${tag}-${run}@example.com`, phone: '555', smsOptIn: true } })
                const other = await db.user.create({ data: { name: `Other ${tag}`, email: `o-${tag}-${run}@example.com`, role: 'TRAINER' } })
                const plan = await db.membershipPlan.create({ data: { name: `Plan ${tag}`, priceCents: 4900, kind: 'RECURRING', interval: 'MONTH' } })
                const discount = await db.discount.create({ data: { code: 'WELCOME10', type: 'PERCENT', value: 10 } })
                const membership = await db.membership.create({
                    data: {
                        userId: user.id, planId: plan.id, planName: plan.name, priceCents: 4900, startDate: new Date(Date.now() - 40 * DAY),
                        kind: 'RECURRING', interval: 'MONTH', status: 'ACTIVE',
                        currentPeriodStart: new Date(Date.now() - 31 * DAY), currentPeriodEnd: new Date(Date.now() - DAY), paymentMethodId: 'pm_x',
                    },
                })
                const bill = await db.billingEvent.create({
                    data: {
                        membershipId: membership.id, kind: 'INITIAL', status: 'PENDING', listPriceCents: 4900, amountCents: 4900, currency: 'usd',
                        periodStart: new Date(Date.now() - 31 * DAY), periodEnd: new Date(Date.now() - DAY),
                    },
                })
                const paidBill = await db.billingEvent.create({
                    data: {
                        membershipId: membership.id, kind: 'RENEWAL', status: 'PAID', listPriceCents: 4900, amountCents: 4900, currency: 'usd',
                        periodStart: new Date(Date.now() - 62 * DAY), periodEnd: new Date(Date.now() - 31 * DAY),
                    },
                })
                const payment = await db.payment.create({
                    data: { billingEventId: paidBill.id, membershipId: membership.id, userId: user.id, amountCents: 4900, currency: 'usd', provider: 'fake', providerPaymentId: `pay-${tag}-${run}` },
                })
                const refund = await db.refund.create({ data: { paymentId: payment.id, amountCents: 100, providerRefundId: `ref-${tag}-${run}` } })
                const notification = await db.notification.create({
                    data: { userId: user.id, channel: 'EMAIL', template: 'membership_ended', dedupeKey: `seed-${tag}-${run}`, data: {}, status: 'SENT' },
                })
                const reset = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: `hash-${tag}-${run}`, expiresAt: new Date(Date.now() + DAY) } })
                const gymClass = await db.gymClass.create({
                    data: { name: `Class ${tag}`, trainerId: other.id, dayOfWeek: 2, startTime: '10:00', durationMinutes: 60, capacity: 1 },
                })
                const instance = await db.gymClassInstance.create({
                    data: { classId: gymClass.id, startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3_600_000), capacity: 1 },
                })
                const booking = await db.gymClassBooking.create({ data: { instanceId: instance.id, userId: user.id } })
                const ids: Ids = {
                    User: user.id, MembershipPlan: plan.id, Discount: discount.id, Membership: membership.id, BillingEvent: bill.id,
                    Payment: payment.id, Refund: refund.id, Notification: notification.id, PasswordResetToken: reset.id,
                    GymClass: gymClass.id, GymClassInstance: instance.id, GymClassBooking: booking.id,
                }
                return { ids, userId: user.id, otherId: other.id, paidBillId: paidBill.id, instanceId: instance.id, bookingId: booking.id, membershipId: membership.id, billId: bill.id }
            }
        const A = await inA(build('a'))
        const B = await inB(build('b'))
        check(Object.keys(A.ids).length === 12, 'one row was created in each of the 12 tables, in each gym')

        let stamped = true
        for (const model of TENANT_MODELS) {
            const delegate = (rawDb as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ gymId: string } | null> }>)[lower(model)]
            const a = await delegate.findUnique({ where: { id: A.ids[model] } })
            const b = await delegate.findUnique({ where: { id: B.ids[model] } })
            if (a?.gymId !== gymA.id || b?.gymId !== gymB.id) stamped = false
        }
        check(stamped, 'every new row was stamped with the gym it was created in')

        check(A.ids.Discount !== B.ids.Discount, 'two gyms can both have the discount code WELCOME10')
        check(
            await inA(() => rejects(db.discount.create({ data: { code: 'WELCOME10', type: 'FIXED', value: 5 } }), (e) => (e as { code?: string }).code === 'P2002')),
            'but one gym cannot have the same code twice',
        )

        // ---------- 4. reads ----------
        console.log('\n4. Reads only see the current gym')
        let readsOk = true
        let byIdOk = true
        let countsOk = true
        for (const model of TENANT_MODELS) {
            const delegate = (db as unknown as Record<string, Record<string, (a?: unknown) => Promise<unknown>>>)[lower(model)]
            const rowsA = (await inA(() => delegate.findMany())) as { gymId: string; id: string }[]
            const rowsB = (await inB(() => delegate.findMany())) as { gymId: string; id: string }[]
            if (!rowsA.every((r) => r.gymId === gymA.id) || !rowsB.every((r) => r.gymId === gymB.id)) readsOk = false
            if (!rowsA.some((r) => r.id === A.ids[model]) || rowsA.some((r) => r.id === B.ids[model])) readsOk = false
            // guessing the id of the other gym's row
            const spy = await inB(() => delegate.findUnique({ where: { id: A.ids[model] } }))
            const spy2 = await inB(() => delegate.findFirst({ where: { id: A.ids[model] } }))
            if (spy !== null || spy2 !== null) byIdOk = false
            const n = (await inA(() => delegate.count())) as number
            if (n !== rowsA.length) countsOk = false
        }
        check(readsOk, 'findMany returns only the current gym, for all 12 tables')
        check(byIdOk, "asking for the other gym's row by its exact id finds nothing, for all 12 tables")
        check(countsOk, 'count agrees with findMany')

        const aggregate = await inB(() => db.payment.aggregate({ _sum: { amountCents: true }, _count: true }))
        check(aggregate._count === 1, 'aggregate only counts the current gym')
        const grouped = await inB(() => db.notification.groupBy({ by: ['status'], _count: { _all: true } }))
        check(grouped.length === 1 && grouped[0]._count._all === 1, 'groupBy only counts the current gym')
        const included = await inA(() => db.user.findUnique({ where: { id: A.userId }, include: { memberships: true, payments: true } }))
        check(included?.memberships.length === 1 && included.payments.length === 1, 'include (a join) still works inside one gym')

        // ---------- 5. writes ----------
        console.log("\n5. Writes cannot reach the other gym's rows")
        let updatesRefused = true
        let deletesRefused = true
        const before = new Map<string, string>()
        for (const model of TENANT_MODELS) {
            const raw = (rawDb as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[lower(model)]
            before.set(model, JSON.stringify(await raw.findUnique({ where: { id: A.ids[model] } })))
        }
        for (const model of TENANT_MODELS) {
            const delegate = (db as unknown as Record<string, Record<string, (a?: unknown) => Promise<{ count?: number }>>>)[lower(model)]
            // gym B tries to change gym A's row, by id
            const touched = await inB(() => delegate.updateMany({ where: { id: A.ids[model] }, data: {} }))
            const removed = await inB(() => delegate.deleteMany({ where: { id: A.ids[model] } }))
            if (touched.count !== 0) updatesRefused = false
            if (removed.count !== 0) deletesRefused = false
            if (!(await inB(() => rejects(delegate.update({ where: { id: A.ids[model] }, data: {} }), (e) => (e as { code?: string }).code === 'P2025')))) updatesRefused = false
            if (!(await inB(() => rejects(delegate.delete({ where: { id: A.ids[model] } }), (e) => (e as { code?: string }).code === 'P2025')))) deletesRefused = false
        }
        check(updatesRefused, "update and updateMany on the other gym's row change nothing, for all 12 tables")
        check(deletesRefused, "delete and deleteMany on the other gym's row remove nothing, for all 12 tables")

        let unchanged = true
        for (const model of TENANT_MODELS) {
            const raw = (rawDb as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[lower(model)]
            if (JSON.stringify(await raw.findUnique({ where: { id: A.ids[model] } })) !== before.get(model)) unchanged = false
        }
        check(unchanged, "after all that, gym A's rows are exactly as they were")

        check(
            await inB(() => rejects(db.user.update({ where: { id: B.userId }, data: { gymId: gymA.id } }), (e) => e instanceof CrossGymError)),
            'a row cannot be moved to another gym with update',
        )
        check(
            await inB(() => rejects(db.user.create({ data: { name: 'Sneaky', email: `sneaky-${run}@example.com`, gymId: gymA.id } }), (e) => e instanceof CrossGymError)),
            "a create that names another gym's id is refused",
        )
        check(
            await inB(() =>
                rejects(db.notification.createMany({ data: [{ userId: B.userId, channel: 'EMAIL', template: 't', dedupeKey: `x-${run}`, data: {}, gymId: gymA.id }] }), (e) => e instanceof CrossGymError),
            ),
            'createMany refuses a row for another gym',
        )
        await inB(() =>
            db.user.upsert({ where: { id: A.userId }, update: { name: 'Hijacked' }, create: { name: 'New', email: `upsert-${run}@example.com` } }),
        )
        const afterUpsert = await rawDb.user.findUnique({ where: { id: A.userId } })
        check(afterUpsert?.name === 'User a', 'upsert with the other gym\'s id does not overwrite that row')

        const manyCreated = await inA(() =>
            db.notification.createMany({
                data: [
                    { userId: A.userId, channel: 'EMAIL', template: 'pass_ending', dedupeKey: `m1-${run}`, data: {} },
                    { userId: A.userId, channel: 'EMAIL', template: 'pass_ending', dedupeKey: `m2-${run}`, data: {} },
                ],
            }),
        )
        const manyRows = await rawDb.notification.findMany({ where: { dedupeKey: { in: [`m1-${run}`, `m2-${run}`] } } })
        check(manyCreated.count === 2 && manyRows.every((r) => r.gymId === gymA.id), 'createMany stamps every row')

        // ---------- 6. the database is the last line of defence ----------
        console.log('\n6. The database refuses what the app forgot')
        const orphan = await rejects(rawDb.user.create({ data: { name: 'Orphan', email: `orphan-${run}@example.com` } }), (e) => (e as { code?: string }).code === 'P2003')
        check(orphan, 'a row written WITHOUT a gym (through the plain client) is rejected by a foreign key')
        check(
            await rejects(rawDb.user.create({ data: { name: 'Ghost', email: `ghost-${run}@example.com`, gymId: 'no-such-gym' } }), (e) => (e as { code?: string }).code === 'P2003'),
            'a row for a gym that does not exist is rejected too',
        )

        // ---------- 7. transactions and raw locks ----------
        console.log('\n7. Transactions and row locks')
        const inTx = await inA(() => db.$transaction(async (tx) => (await tx.user.findMany()).every((u) => u.gymId === gymA.id)))
        check(inTx, 'inside db.$transaction the client is still limited to the gym')
        const batch = await inB(() => db.$transaction([db.user.count(), db.membership.count()]))
        const expectedUsers = await rawDb.user.count({ where: { gymId: gymB.id } })
        const expectedMemberships = await rawDb.membership.count({ where: { gymId: gymB.id } })
        check(
            batch[0] === expectedUsers && batch[1] === expectedMemberships && expectedUsers < (await rawDb.user.count()),
            'the array form of $transaction is limited too',
        )
        const rolledBack = await inA(async () => {
            try {
                await db.$transaction(async (tx) => {
                    await tx.user.create({ data: { name: 'Temp', email: `temp-${run}@example.com` } })
                    throw new Error('abort')
                })
            } catch {
                /* expected */
            }
            return db.user.findFirst({ where: { email: `temp-${run}@example.com` } })
        })
        check(rolledBack === null, 'a transaction still rolls back')

        const foreignBooking = await inB(() => bookSession(A.instanceId, B.userId))
        check(foreignBooking.kind === 'not_found', "booking another gym's session answers not_found (the raw lock cannot see it)")
        const foreignCancel = await inB(() => cancelBooking(A.bookingId))
        check(foreignCancel.kind === 'not_found', "cancelling another gym's booking answers not_found")
        const ownBooking = await inB(() => bookSession(B.instanceId, B.otherId))
        check(ownBooking.kind === 'full', 'booking your own gym session still follows the capacity rule (capacity 1, already taken)')
        const waitlisted = await inB(() => bookSession(B.instanceId, B.otherId, { waitlist: true }))
        check(waitlisted.kind === 'waitlisted', '...and the waitlist still works')

        // ---------- 8. payments ----------
        console.log('\n8. Payment events settle in the right gym')
        const outsider = await inB(() =>
            processPaymentEvent({
                id: `evt-iso-${run}`, provider: 'fake', type: 'payment.succeeded', billingEventId: A.billId,
                providerPaymentId: `pi-iso-${run}`, paymentMethodId: 'pm', amountCents: 4900,
            }),
        )
        const billAfter = await rawDb.billingEvent.findUnique({ where: { id: A.billId } })
        check(outsider === 'processed' && billAfter?.status === 'PENDING', "an event run in gym B cannot settle gym A's bill")
        await inA(() =>
            processPaymentEvent({
                id: `evt-iso2-${run}`, provider: 'fake', type: 'payment.succeeded', billingEventId: A.billId,
                providerPaymentId: `pi-iso2-${run}`, paymentMethodId: 'pm', amountCents: 4900,
            }),
        )
        const settled = await rawDb.billingEvent.findUnique({ where: { id: A.billId } })
        check(settled?.status === 'PAID', "the same event run in gym A settles it")

        // ---------- 9. host to gym ----------
        console.log('\n9. From address to gym')
        clearGymCache()
        check((await findGymByHost(`${slugA}.localhost:3000`))?.id === gymA.id, 'a subdomain finds its gym')
        check((await findGymByHost(`${slugB.toUpperCase()}.localhost`))?.id === gymB.id, 'upper case does not matter')
        check((await findGymByHost('nobody-here.localhost')) === null, 'an unknown subdomain finds nothing')
        check((await findGymByHost('localhost:3000')) === null, 'the platform address is not a gym')

    } finally {
        // Remove everything the two proof gyms own, children before parents.
        for (const gym of [gymA, gymB]) {
            await rawDb.refund.deleteMany({ where: { gymId: gym.id } })
            await rawDb.payment.deleteMany({ where: { gymId: gym.id } })
            await rawDb.notification.deleteMany({ where: { gymId: gym.id } })
            await rawDb.gymClassBooking.deleteMany({ where: { gymId: gym.id } })
            await rawDb.gymClassInstance.deleteMany({ where: { gymId: gym.id } })
            await rawDb.gymClass.deleteMany({ where: { gymId: gym.id } })
            await rawDb.billingEvent.deleteMany({ where: { gymId: gym.id } })
            await rawDb.membership.deleteMany({ where: { gymId: gym.id } })
            await rawDb.passwordResetToken.deleteMany({ where: { gymId: gym.id } })
            await rawDb.user.deleteMany({ where: { gymId: gym.id } })
            await rawDb.membershipPlan.deleteMany({ where: { gymId: gym.id } })
            await rawDb.discount.deleteMany({ where: { gymId: gym.id } })
            await rawDb.gym.delete({ where: { id: gym.id } })
        }
        await rawDb.webhookEvent.deleteMany({ where: { id: { startsWith: `fake:evt-iso` } } })
        await rawDb.$disconnect()
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