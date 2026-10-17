import Link from 'next/link'
import { db } from '@/lib/db'
import { getGym } from '@/lib/classes'
import { requireSignedIn } from '@/lib/guards'
import { dateKey, formatCalendarDay, formatDateTime, formatTime, weekBounds } from '@/lib/time'
import { BookingButton } from '@/components/BookingButton'

const MAX_WEEK = 12

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
    const raw = await searchParams
    const weekParam = Number(first(raw.week))
    const week = Number.isInteger(weekParam) ? Math.min(Math.max(weekParam, 0), MAX_WEEK) : 0

    const session = await requireSignedIn(week === 0 ? '/schedule' : `/schedule?week=${week}`)
    const userId = session.user.id

    const gym = await getGym()
    const now = new Date()
    const { start, end, days } = weekBounds(week, now, gym.timeZone)

    const [instances, myBookings] = await Promise.all([
        db.gymClassInstance.findMany({
            where: { startsAt: { gte: start, lt: end }, gymClass: { active: true } },
            orderBy: { startsAt: 'asc' },
            include: {
                gymClass: { select: { name: true, trainer: { select: { name: true } } } },
                _count: { select: { bookings: { where: { status: 'BOOKED' } } } },
                bookings: { where: { userId, status: { not: 'CANCELLED' } }, select: { id: true, status: true } },
            },
        }),
        db.gymClassBooking.findMany({
            where: { userId, status: { not: 'CANCELLED' }, instance: { startsAt: { gte: now } } },
            orderBy: { instance: { startsAt: 'asc' } },
            take: 10,
            include: { instance: { select: { startsAt: true, gymClass: { select: { name: true } } } } },
        }),
    ])

    const byDay = new Map<string, typeof instances>()
    for (const instance of instances) {
        const key = dateKey(instance.startsAt, gym.timeZone)
        byDay.set(key, [...(byDay.get(key) ?? []), instance])
    }

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">Schedule</h1>
            <p className="mt-1 text-sm text-neutral-600">All times are {gym.timeZone} time.</p>

            <section className="mt-6">
                <h2 className="text-xl font-semibold">My bookings</h2>
                {myBookings.length === 0 ? (
                    <p className="mt-2 text-sm text-neutral-600">You have no upcoming bookings.</p>
                ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                        {myBookings.map((b) => (
                            <li key={b.id}>
                                <span className="font-medium">{b.instance.gymClass.name}</span> ·{' '}
                                {formatDateTime(b.instance.startsAt, gym.timeZone)}
                                {b.status === 'WAITLISTED' && <span className="text-neutral-600"> (waitlist)</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <nav aria-label="Week" className="mt-8 flex items-center justify-between">
                {week > 0 ? (
                    <Link href={week === 1 ? '/schedule' : `/schedule?week=${week - 1}`} className="rounded border px-3 py-1.5 text-sm">
                        ← Previous week
                    </Link>
                ) : (
                    <span className="rounded border px-3 py-1.5 text-sm text-neutral-400">← Previous week</span>
                )}
                <h2 className="font-semibold">
                    {formatCalendarDay(days[0], false)} – {formatCalendarDay(days[6], false)}
                    {week === 0 && <span className="ml-2 text-sm font-normal text-neutral-600">(this week)</span>}
                </h2>
                {week < MAX_WEEK ? (
                    <Link href={`/schedule?week=${week + 1}`} className="rounded border px-3 py-1.5 text-sm">
                        Next week →
                    </Link>
                ) : (
                    <span className="rounded border px-3 py-1.5 text-sm text-neutral-400">Next week →</span>
                )}
            </nav>

            <div className="mt-4 space-y-5">
                {days.map((day) => {
                    const sessions = byDay.get(day.key) ?? []
                    return (
                        <section key={day.key}>
                            <h3 className="font-semibold">{formatCalendarDay(day)}</h3>
                            {sessions.length === 0 ? (
                                <p className="mt-1 text-sm text-neutral-500">No classes</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {sessions.map((s) => {
                                        const mine = s.bookings[0] ?? null
                                        const booked = s._count.bookings
                                        return (
                                            <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-300 p-3">
                                                <div>
                                                    <p className="font-semibold">{s.gymClass.name}</p>
                                                    <p className="text-sm text-neutral-600">
                                                        {formatTime(s.startsAt, gym.timeZone)} – {formatTime(s.endsAt, gym.timeZone)} ·{' '}
                                                        {s.gymClass.trainer?.name ?? 'No trainer'}
                                                    </p>
                                                    <p className="text-sm text-neutral-600">
                                                        {Math.max(s.capacity - booked, 0)} of {s.capacity} spots left
                                                    </p>
                                                </div>
                                                <BookingButton
                                                    instanceId={s.id}
                                                    bookingId={mine?.id ?? null}
                                                    status={mine ? (mine.status as 'BOOKED' | 'WAITLISTED') : null}
                                                    full={booked >= s.capacity}
                                                    past={s.startsAt <= now}
                                                />
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </section>
                    )
                })}
            </div>
        </main>
    )
}