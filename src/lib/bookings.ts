import type { BookingStatus } from '@prisma/client'
import { db, lockRow, type Tx } from './db'

export type BookResult =
    | { kind: 'booked'; bookingId: string }
    | { kind: 'waitlisted'; bookingId: string; position: number }
    | { kind: 'already'; bookingId: string; status: BookingStatus }
    | { kind: 'full' }
    | { kind: 'closed' }
    | { kind: 'not_found' }

type Existing = { id: string } | null

// One row per person per session: someone who cancelled and returns reuses their old row.
function saveEntry(
    tx: Tx,
    existing: Existing,
    instanceId: string,
    userId: string,
    status: 'BOOKED' | 'WAITLISTED',
    now: Date,
) {
    // createdAt is set from our own clock in both cases, because it decides the waitlist order.
    return existing
        ? tx.gymClassBooking.update({ where: { id: existing.id }, data: { status, cancelledAt: null, createdAt: now } })
        : tx.gymClassBooking.create({ data: { instanceId, userId, status, createdAt: now } })
}

export async function bookSession(
    instanceId: string,
    userId: string,
    options: { waitlist?: boolean } = {},
    now = new Date(),
): Promise<BookResult> {
    return db.$transaction(
        async (tx): Promise<BookResult> => {
            // Lock this one session's row: everyone else booking or cancelling it waits their turn.
            // lockRow only finds rows of the current gym, so another gym's session looks like it does not exist.
            if (!(await lockRow(tx, 'GymClassInstance', instanceId))) return { kind: 'not_found' }

            const instance = await tx.gymClassInstance.findUniqueOrThrow({
                where: { id: instanceId },
                select: { startsAt: true, capacity: true },
            })
            if (instance.startsAt <= now) return { kind: 'closed' }

            const existing = await tx.gymClassBooking.findUnique({
                where: { instanceId_userId: { instanceId, userId } },
            })
            if (existing && existing.status !== 'CANCELLED') {
                return { kind: 'already', bookingId: existing.id, status: existing.status }
            }

            const taken = await tx.gymClassBooking.count({ where: { instanceId, status: 'BOOKED' } })

            if (taken < instance.capacity) {
                const booking = await saveEntry(tx, existing, instanceId, userId, 'BOOKED', now)
                return { kind: 'booked', bookingId: booking.id }
            }

            if (!options.waitlist) return { kind: 'full' }

            const entry = await saveEntry(tx, existing, instanceId, userId, 'WAITLISTED', now)
            // This person just joined, so they are last in line: their position is the size of the queue.
            const position = await tx.gymClassBooking.count({ where: { instanceId, status: 'WAITLISTED' } })
            return { kind: 'waitlisted', bookingId: entry.id, position }
        },
        { maxWait: 10_000, timeout: 10_000 },
    )
}

export type CancelResult =
    | { kind: 'cancelled'; promoted: { bookingId: string; userId: string }[] }
    | { kind: 'already_cancelled' }
    | { kind: 'closed' }
    | { kind: 'not_found' }

export async function cancelBooking(bookingId: string, now = new Date()): Promise<CancelResult> {
    // We need the session's id to know which row to lock.
    const found = await db.gymClassBooking.findUnique({ where: { id: bookingId }, select: { instanceId: true } })
    if (!found) return { kind: 'not_found' }
    const { instanceId } = found

    return db.$transaction(
        async (tx): Promise<CancelResult> => {
            await lockRow(tx, 'GymClassInstance', instanceId)

            // Read again now that we hold the lock: the booking may have changed while we waited.
            const booking = await tx.gymClassBooking.findUnique({
                where: { id: bookingId },
                include: { instance: { select: { startsAt: true, capacity: true } } },
            })
            if (!booking) return { kind: 'not_found' }
            if (booking.status === 'CANCELLED') return { kind: 'already_cancelled' }
            if (booking.instance.startsAt <= now) return { kind: 'closed' }

            await tx.gymClassBooking.update({
                where: { id: bookingId },
                data: { status: 'CANCELLED', cancelledAt: now },
            })

            const promoted: { bookingId: string; userId: string }[] = []

            // Only a freed BOOKED spot can be handed on. Leaving the waitlist frees nothing.
            if (booking.status === 'BOOKED') {
                const taken = await tx.gymClassBooking.count({ where: { instanceId, status: 'BOOKED' } })
                const free = booking.instance.capacity - taken

                if (free > 0) {
                    const next = await tx.gymClassBooking.findMany({
                        where: { instanceId, status: 'WAITLISTED' },
                        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], // first come, first served
                        take: free,
                        select: { id: true, userId: true },
                    })
                    for (const entry of next) {
                        await tx.gymClassBooking.update({ where: { id: entry.id }, data: { status: 'BOOKED' } })
                        promoted.push({ bookingId: entry.id, userId: entry.userId })
                    }
                }
            }

            return { kind: 'cancelled', promoted }
        },
        { maxWait: 10_000, timeout: 10_000 },
    )
}