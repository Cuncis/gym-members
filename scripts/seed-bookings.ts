import { faker } from '@faker-js/faker'
import { db } from '../src/lib/db'
import { runWithGym } from '../src/lib/script-gym'
import { bookSession, cancelBooking, type BookResult } from '../src/lib/bookings'

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')
    faker.seed(7)

    const sessions = await db.gymClassInstance.findMany({
        where: { startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 6,
    })
    if (sessions.length === 0) {
        console.log('No upcoming sessions. Open a class page and generate sessions first.')
        return
    }

    // Only the seeded members without a login, so the four demo accounts stay untouched.
    const members = await db.user.findMany({ where: { role: 'MEMBER', passwordHash: null }, select: { id: true } })

    let attempts = 0
    for (const s of sessions) {
        const pick = faker.helpers.arrayElements(members, Math.min(members.length, s.capacity + 3))
        const results: BookResult[] = []
        for (const m of pick) results.push(await bookSession(s.id, m.id, { waitlist: true }))
        attempts += results.length

        // A couple of people change their mind, which also exercises the waitlist promotion.
        const withIds = results.filter((r) => 'bookingId' in r)
        for (const r of faker.helpers.arrayElements(withIds, Math.min(2, withIds.length))) {
            if ('bookingId' in r) await cancelBooking(r.bookingId)
        }
    }

    const total = await db.gymClassBooking.count()
    console.log(`Tried ${attempts} bookings across ${sessions.length} sessions. Bookings in the database: ${total}`)
}

runWithGym(main)
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => db.$disconnect())