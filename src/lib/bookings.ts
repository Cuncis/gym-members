import { Prisma, type BookingStatus } from '@prisma/client'
import { db } from './db'

export type BookResult =
    | { kind: 'booked'; bookingId: string }
    | { kind: 'already'; bookingId: string; status: BookingStatus }
    | { kind: 'full' }
    | { kind: 'closed' }
    | { kind: 'not_found' }

export async function bookSession(instanceId: string, userId: string, now = new Date()): Promise<BookResult> {
    return db.$transaction(
        async (tx): Promise<BookResult> => {
            // Lock this one session's row. Anyone else booking the same session waits here
            // until we commit, so "count the spots, then take one" cannot be interleaved.
            const locked = await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT id FROM \`GymClassInstance\` WHERE id = ${instanceId} FOR UPDATE`,
            )
            if (locked.length === 0) return { kind: 'not_found' }

            const instance = await tx.gymClassInstance.findUniqueOrThrow({
                where: { id: instanceId },
                select: { startsAt: true, capacity: true },
            })
            if (instance.startsAt <= now) return { kind: 'closed' }

            const existing = await tx.gymClassBooking.findUnique({
                where: { instanceId_userId: { instanceId, userId } },
            })
            // Booking twice is not an error: the second request just reports the first booking.
            if (existing && existing.status !== 'CANCELLED') {
                return { kind: 'already', bookingId: existing.id, status: existing.status }
            }

            const taken = await tx.gymClassBooking.count({ where: { instanceId, status: 'BOOKED' } })
            if (taken >= instance.capacity) return { kind: 'full' }

            // Someone who cancelled and books again reuses their old row (the table allows one row per person per session).
            const booking = existing
                ? await tx.gymClassBooking.update({
                    where: { id: existing.id },
                    data: { status: 'BOOKED', cancelledAt: null, createdAt: now },
                })
                : await tx.gymClassBooking.create({ data: { instanceId, userId, status: 'BOOKED' } })

            return { kind: 'booked', bookingId: booking.id }
        },
        { maxWait: 10_000, timeout: 10_000 },
    )
}

export type CancelResult = 'cancelled' | 'already_cancelled' | 'closed' | 'not_found'

export async function cancelBooking(bookingId: string, now = new Date()): Promise<CancelResult> {
    const booking = await db.gymClassBooking.findUnique({
        where: { id: bookingId },
        include: { instance: { select: { startsAt: true } } },
    })
    if (!booking) return 'not_found'
    if (booking.status === 'CANCELLED') return 'already_cancelled'
    if (booking.instance.startsAt <= now) return 'closed'

    const result = await db.gymClassBooking.updateMany({
        where: { id: bookingId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelledAt: now },
    })
    return result.count === 1 ? 'cancelled' : 'already_cancelled'
}