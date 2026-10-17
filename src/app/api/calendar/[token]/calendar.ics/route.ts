import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGym } from '@/lib/classes'
import { buildCalendar, type IcsEvent } from '@/lib/ics'

const DAY_MS = 86_400_000

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
    const { token } = await params

    // Anything that is not 64 hex characters cannot be a real token, so skip the database.
    if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse('Not found', { status: 404 })

    const user = await db.user.findUnique({ where: { calendarToken: token }, select: { id: true } })
    if (!user) return new NextResponse('Not found', { status: 404 })

    const [gym, bookings] = await Promise.all([
        getGym(),
        db.gymClassBooking.findMany({
            where: {
                userId: user.id,
                status: { in: ['BOOKED', 'WAITLISTED'] },
                // 30 days of history, so recent classes do not vanish from the calendar
                instance: { startsAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
            },
            orderBy: { instance: { startsAt: 'asc' } },
            take: 500,
            include: {
                instance: {
                    select: {
                        startsAt: true,
                        endsAt: true,
                        gymClass: { select: { name: true, trainer: { select: { name: true } } } },
                    },
                },
            },
        }),
    ])

    const events: IcsEvent[] = bookings.map((b) => {
        const waiting = b.status === 'WAITLISTED'
        const description = [
            b.instance.gymClass.trainer ? `Trainer: ${b.instance.gymClass.trainer.name}` : null,
            waiting ? 'You are on the waitlist. You will be booked automatically if a spot opens.' : null,
        ]
            .filter(Boolean)
            .join('\n')

        return {
            uid: `booking-${b.id}@gym-members.local`,
            summary: waiting ? `${b.instance.gymClass.name} (waitlist)` : b.instance.gymClass.name,
            description: description || undefined,
            location: gym.name,
            start: b.instance.startsAt,
            end: b.instance.endsAt,
            status: waiting ? 'TENTATIVE' : 'CONFIRMED',
        }
    })

    return new NextResponse(buildCalendar(`${gym.name} bookings`, events), {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="calendar.ics"',
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Robots-Tag': 'noindex',
        },
    })
}