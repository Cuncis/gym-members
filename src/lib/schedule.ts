import { db } from './db'
import { getGym } from './classes'
import { dateKey, formatCalendarDay, weekBounds } from './time'
import type { WeekDto } from './schedule-shared'

export async function getScheduleWeek(userId: string, week: number, now = new Date()): Promise<WeekDto> {
    const gym = await getGym()
    const { start, end, days } = weekBounds(week, now, gym.timeZone)

    const [instances, myBookings] = await Promise.all([
        db.gymClassInstance.findMany({
            where: { startsAt: { gte: start, lt: end }, gymClass: { active: true } },
            orderBy: { startsAt: 'asc' },
            include: {
                gymClass: { select: { name: true, trainer: { select: { name: true } } } },
                bookings: {
                    where: { userId, status: { not: 'CANCELLED' } },
                    select: { id: true, status: true, createdAt: true },
                },
            },
        }),
        db.gymClassBooking.findMany({
            where: { userId, status: { not: 'CANCELLED' }, instance: { startsAt: { gte: now } } },
            orderBy: { instance: { startsAt: 'asc' } },
            take: 10,
            include: { instance: { select: { startsAt: true, gymClass: { select: { name: true } } } } },
        }),
    ])

    // One grouped query gives every session's booked and waitlisted counts.
    const ids = instances.map((i) => i.id)
    const counts = ids.length
        ? await db.gymClassBooking.groupBy({
            by: ['instanceId', 'status'],
            where: { instanceId: { in: ids }, status: { in: ['BOOKED', 'WAITLISTED'] } },
            _count: { _all: true },
        })
        : []
    const countOf = (instanceId: string, status: 'BOOKED' | 'WAITLISTED') =>
        counts.find((c) => c.instanceId === instanceId && c.status === status)?._count._all ?? 0

    // My place in each queue I am waiting in: people who joined before me, plus one.
    const positions = new Map<string, number>()
    await Promise.all(
        instances.flatMap((s) => {
            const mine = s.bookings[0]
            if (!mine || mine.status !== 'WAITLISTED') return []
            return [
                db.gymClassBooking
                    .count({
                        where: {
                            instanceId: s.id,
                            status: 'WAITLISTED',
                            OR: [{ createdAt: { lt: mine.createdAt } }, { createdAt: mine.createdAt, id: { lt: mine.id } }],
                        },
                    })
                    .then((n) => positions.set(s.id, n + 1)),
            ]
        }),
    )

    return {
        week,
        timeZone: gym.timeZone,
        rangeLabel: `${formatCalendarDay(days[0], false)} – ${formatCalendarDay(days[6], false)}`,
        days: days.map((d) => ({ key: d.key, label: formatCalendarDay(d) })),
        sessions: instances.map((s) => {
            const mine = s.bookings[0]
            return {
                id: s.id,
                dayKey: dateKey(s.startsAt, gym.timeZone),
                className: s.gymClass.name,
                trainerName: s.gymClass.trainer?.name ?? null,
                startsAt: s.startsAt.toISOString(),
                endsAt: s.endsAt.toISOString(),
                capacity: s.capacity,
                booked: countOf(s.id, 'BOOKED'),
                waiting: countOf(s.id, 'WAITLISTED'),
                past: s.startsAt <= now,
                mine: mine
                    ? {
                        bookingId: mine.id,
                        status: mine.status as 'BOOKED' | 'WAITLISTED',
                        position: positions.get(s.id) ?? null,
                    }
                    : null,
            }
        }),
        myUpcoming: myBookings.map((b) => ({
            id: b.id,
            className: b.instance.gymClass.name,
            startsAt: b.instance.startsAt.toISOString(),
            status: b.status as 'BOOKED' | 'WAITLISTED',
        })),
        generatedAt: now.toISOString(),
    }
}