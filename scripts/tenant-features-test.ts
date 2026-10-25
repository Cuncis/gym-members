import { db } from '../src/lib/db'
import { addDomain, verifyDomain, verifyRecordValue, type TxtResolver } from '../src/lib/domains'
import { forEachGym } from '../src/lib/gym'
import { updateGymProfile } from '../src/lib/gym-profile'
import { renewAll } from '../src/lib/jobs'
import { FakeSender } from '../src/lib/messaging/fake'
import { deliverPending, queueNotification } from '../src/lib/notifications'
import { FakeGateway } from '../src/lib/payment-gateways/fake'
import { rawDb } from '../src/lib/raw-db'
import { findGymByHost } from '../src/lib/tenant'
import { runInGym } from '../src/lib/tenant-context'

// Proves custom domains, gym settings and background jobs work gym by gym.
// It creates two gyms of its own (proof-feat-a and proof-feat-b) and removes them again.

const DAY = 86_400_000

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const failures: string[] = []
    const check = (ok: boolean, label: string) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
        if (!ok) failures.push(label)
    }

    const run = Date.now()
    const slugA = `proof-feat-a-${run}`.slice(0, 30)
    const slugB = `proof-feat-b-${run}`.slice(0, 30)
    const gymA = await rawDb.gym.create({ data: { slug: slugA, name: 'Alpha Gym', timeZone: 'Asia/Jakarta' } })
    const gymB = await rawDb.gym.create({ data: { slug: slugB, name: 'Beta Studio', timeZone: 'America/New_York', brandColor: '#15803d' } })
    const inA = <T>(fn: () => Promise<T>) => runInGym(gymA.id, fn)
    const inB = <T>(fn: () => Promise<T>) => runInGym(gymB.id, fn)
    const A = { userId: (await inA(() => db.user.create({ data: { name: 'User a', email: `u-a-${run}@example.com` } }))).id }

    try {
        // ---------- 10. custom domains ----------
        console.log('\n10. Custom domains')
        const host = `members-${run}.iso-test.com`
        const added = await inA(() => addDomain(`https://${host}/join`))
        check(added.ok && added.domain.hostname === host && added.domain.verifiedAt === null, 'a domain is added unverified, and the address is cleaned up')
        check((await findGymByHost(host)) === null, 'an unverified domain does not serve any gym')

        const resolverFor = (value: string): TxtResolver => async () => [[value]]
        const wrong = added.ok ? await inA(() => verifyDomain(added.domain.id, resolverFor('fitnessgm-verify=wrong'))) : null
        check(wrong?.ok === false && wrong.reason === 'wrong_value', 'a TXT record with the wrong value does not verify')
        const crossVerify = added.ok ? await inB(() => verifyDomain(added.domain.id, resolverFor(verifyRecordValue(added.domain.verifyToken)))) : null
        check(crossVerify?.ok === false && crossVerify.reason === 'not_found', "gym B cannot verify gym A's domain")

        const stolen = await inB(() => addDomain(host))
        check(stolen.ok && stolen.domain.gymId === gymB.id, "gym B can take over a name gym A only claimed but never proved")
        const lost = added.ok ? await inA(() => verifyDomain(added.domain.id, resolverFor('x'))) : null
        check(lost?.ok === false && lost.reason === 'not_found', "...and gym A's old claim is gone")

        const proved = stolen.ok ? await inB(() => verifyDomain(stolen.domain.id, resolverFor(verifyRecordValue(stolen.domain.verifyToken)))) : null
        check(proved?.ok === true, 'a correct TXT record verifies the domain')
        check((await findGymByHost(host))?.id === gymB.id, 'a verified domain now serves its gym')
        const late = await inA(() => addDomain(host))
        check(!late.ok, 'once verified, nobody else can add that name')
        check((await inA(() => addDomain(`x-${run}.${slugA}.localhost`))).ok === false, 'names under our own domain cannot be added as custom domains')

        // ---------- 11. settings ----------
        console.log('\n11. Settings')
        await inA(() => updateGymProfile({ name: 'Alpha Gym Renamed', timeZone: 'Asia/Jakarta', brandColor: '#ff0000', billingHour: 5, reminderHour: 10 }))
        const [aNow, bNow] = await Promise.all([rawDb.gym.findUnique({ where: { id: gymA.id } }), rawDb.gym.findUnique({ where: { id: gymB.id } })])
        check(aNow?.name === 'Alpha Gym Renamed' && aNow.billingHour === 5, "gym A's settings changed")
        check(bNow?.name === 'Beta Studio' && bNow.brandColor === '#15803d', "gym B's settings did not")
        check((await findGymByHost(`${slugA}.localhost`))?.name === 'Alpha Gym Renamed', 'the host cache was cleared by the save')

        // ---------- 12. jobs ----------
        console.log('\n12. Background jobs work gym by gym')
        const gateway = new FakeGateway()
        const makeDue = (tag: string) => async () => {
            const user = await db.user.create({ data: { name: `Due ${tag}`, email: `due-${tag}-${run}@example.com`, paymentCustomerId: `cus_due_${tag}_${run}` } })
            const m = await db.membership.create({
                data: {
                    userId: user.id, planName: 'Monthly', priceCents: 4900, startDate: new Date(Date.now() - 40 * DAY), kind: 'RECURRING', interval: 'MONTH',
                    status: 'ACTIVE', currentPeriodStart: new Date(Date.now() - 31 * DAY), currentPeriodEnd: new Date(Date.now() - DAY), paymentMethodId: 'pm_x',
                },
            })
            return m.id
        }
        const dueA = await inA(makeDue('a'))
        const dueB = await inB(makeDue('b'))
        const endBefore = (await rawDb.membership.findUniqueOrThrow({ where: { id: dueB } })).currentPeriodEnd!.getTime()

        await inA(() => renewAll(gateway, new Date()))
        const afterA = await rawDb.membership.findUniqueOrThrow({ where: { id: dueA } })
        const afterB = await rawDb.membership.findUniqueOrThrow({ where: { id: dueB } })
        check(afterA.currentPeriodEnd!.getTime() > Date.now(), "a billing run in gym A renewed gym A's due membership")
        check(afterB.currentPeriodEnd!.getTime() === endBefore, "...and did not touch gym B's due membership")
        await inB(() => renewAll(gateway, new Date()))
        const laterB = await rawDb.membership.findUniqueOrThrow({ where: { id: dueB } })
        check(laterB.currentPeriodEnd!.getTime() > Date.now(), "gym B's own run then renews it")
        check(gateway.charges.length === 2, 'exactly two charges happened in total, one per gym')

        const emails = new FakeSender('email')
        const texts = new FakeSender('sms')
        const data = { name: 'User', planName: 'Plan' }
        await inA(() => queueNotification({ userId: A.userId, template: 'membership_ended', key: `ended-iso-${run}`, data }))
        const idle = await inB(() => deliverPending({ email: emails, sms: texts }))
        check(idle.examined === 0 && emails.sent.length === 0, "gym B's delivery run does not send gym A's messages")
        const sentA = await inA(() => deliverPending({ email: emails, sms: texts }))
        check(sentA.sent >= 1 && emails.sent.length === 1, "gym A's delivery run sends it")
        const mail = emails.sent[0]
        check(!!mail && (mail.html ?? '').includes('Alpha Gym Renamed'), "the email carries gym A's name")
        check(!!mail && (mail.html ?? '').includes(`${slugA}.localhost`), "the email's links point at gym A's own address")

        const runs = await forEachGym(async (gym) => gym.slug)
        const mine = runs.filter((r) => r.slug === slugA || r.slug === slugB)
        check(mine.length === 2 && mine.every((r) => r.ok), 'forEachGym visits every gym, each inside its own gym')

    } finally {
        // Remove everything the two proof gyms own, children before parents. Domains go with the gym (cascade).
        for (const gym of [gymA, gymB]) {
            await rawDb.payment.deleteMany({ where: { gymId: gym.id } })
            await rawDb.notification.deleteMany({ where: { gymId: gym.id } })
            await rawDb.billingEvent.deleteMany({ where: { gymId: gym.id } })
            await rawDb.membership.deleteMany({ where: { gymId: gym.id } })
            await rawDb.user.deleteMany({ where: { gymId: gym.id } })
            await rawDb.gym.delete({ where: { id: gym.id } })
        }
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