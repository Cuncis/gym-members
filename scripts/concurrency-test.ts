import { db } from '../src/lib/db'
import { withProofGym } from '../src/lib/script-gym'
import { bookSession, type BookResult } from '../src/lib/bookings'

const CAPACITY = 5
const PEOPLE = 20

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const runId = Date.now()
    const users = await Promise.all(
        Array.from({ length: PEOPLE }, (_, i) =>
            db.user.create({
                data: { name: `Load Test ${i + 1}`, email: `loadtest-${runId}-${i + 1}@example.com` },
                select: { id: true },
            }),
        ),
    )
    const gymClass = await db.gymClass.create({
        data: { name: `Load test ${runId}`, dayOfWeek: 1, startTime: '10:00', durationMinutes: 60, capacity: CAPACITY },
    })
    const startsAt = new Date(Date.now() + 24 * 3_600_000)
    const instance = await db.gymClassInstance.create({
        data: { classId: gymClass.id, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: CAPACITY },
    })

    try {
        // All 20 requests start together. Promise.all does not wait for one before starting the next.
        const results = await Promise.all(users.map((u) => bookSession(instance.id, u.id)))
        const count = (kind: BookResult['kind']) => results.filter((r) => r.kind === kind).length
        const bookedInDb = await db.gymClassBooking.count({ where: { instanceId: instance.id, status: 'BOOKED' } })

        console.log(`${PEOPLE} people tried to book ${CAPACITY} spots`)
        console.log(`  booked: ${count('booked')}   full: ${count('full')}   in database: ${bookedInDb}`)

        if (bookedInDb === CAPACITY && count('booked') === CAPACITY) {
            console.log('PASS: the session was not overbooked')
        } else {
            console.log(`FAIL: ${bookedInDb} people hold ${CAPACITY} spots`)
            process.exitCode = 1
        }
    } finally {
        // Deleting the class also deletes its session and bookings (cascade).
        await db.gymClass.delete({ where: { id: gymClass.id } })
        await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
        await db.$disconnect()
    }
}

withProofGym('concurrency', main).catch((e) => {
    console.error(e)
    process.exit(1)
})
