import { db } from '../src/lib/db'
import { bookSession, cancelBooking, type BookResult } from '../src/lib/bookings'

const idOf = (r: BookResult) => ('bookingId' in r ? r.bookingId : '')

async function main() {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')

    const runId = Date.now()
    const names = ['A', 'B', 'C', 'D', 'E']
    const users = await Promise.all(
        names.map((n) =>
            db.user.create({
                data: { name: `Waitlist ${n}`, email: `waitlist-${runId}-${n}@example.com` },
                select: { id: true },
            }),
        ),
    )
    const gymClass = await db.gymClass.create({
        data: { name: `Waitlist test ${runId}`, dayOfWeek: 1, startTime: '10:00', durationMinutes: 60, capacity: 2 },
    })
    const startsAt = new Date(Date.now() + 24 * 3_600_000)
    const instance = await db.gymClassInstance.create({
        data: { classId: gymClass.id, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: 2 },
    })

    const letter = new Map(users.map((u, i) => [u.id, names[i]]))
    const who = async (status: 'BOOKED' | 'WAITLISTED') => {
        const rows = await db.gymClassBooking.findMany({ where: { instanceId: instance.id, status }, select: { userId: true } })
        return rows.map((r) => letter.get(r.userId)).sort().join('')
    }

    const failures: string[] = []
    const check = (ok: boolean, label: string) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
        if (!ok) failures.push(label)
    }

    try {
        // One after another on purpose: the order they join decides the queue.
        const results: BookResult[] = []
        for (const u of users) results.push(await bookSession(instance.id, u.id, { waitlist: true }))

        check(results.slice(0, 2).every((r) => r.kind === 'booked'), 'A and B are booked')
        check(
            results.slice(2).map((r) => (r.kind === 'waitlisted' ? r.position : -1)).join() === '1,2,3',
            'C, D and E are waitlisted at positions 1, 2 and 3',
        )

        await cancelBooking(idOf(results[0]))
        check((await who('BOOKED')) === 'BC', 'A cancels: C, first in line, is promoted')
        check((await who('WAITLISTED')) === 'DE', 'D and E move up')

        // Two cancels at the same instant must free exactly two spots and fill exactly two.
        await Promise.all([cancelBooking(idOf(results[1])), cancelBooking(idOf(results[2]))])
        check((await who('BOOKED')) === 'DE', 'B and C cancel together: D and E are promoted, nobody is left over')
        check((await who('WAITLISTED')) === '', 'the waitlist is empty')

        // A returns after cancelling and goes to the back of an empty queue, reusing the same row.
        const back = await bookSession(instance.id, users[0].id, { waitlist: true })
        check(back.kind === 'waitlisted' && back.position === 1, 'A returns and waits at position 1')
        check(idOf(back) === idOf(results[0]), 'A reuses the same booking row')

        // Someone who is waiting can leave without freeing a booked spot.
        await cancelBooking(idOf(back))
        check((await who('BOOKED')) === 'DE', 'A leaves the waitlist: D and E keep their spots')
    } finally {
        await db.gymClass.delete({ where: { id: gymClass.id } })
        await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
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