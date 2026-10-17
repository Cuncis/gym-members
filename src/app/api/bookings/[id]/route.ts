import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cancelBooking } from '@/lib/bookings'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES, can } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    const booking = await db.gymClassBooking.findUnique({ where: { id }, select: { userId: true } })

    // Someone else's booking looks exactly like one that does not exist.
    const { role, id: userId } = guard.session.user
    if (!booking || !can.cancelBooking(role, userId, booking.userId)) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const result = await cancelBooking(id)

    switch (result.kind) {
        case 'cancelled':
            // Project 7: email the people in result.promoted to tell them they got a spot.
            return new NextResponse(null, { status: 204 })
        case 'already_cancelled':
            return new NextResponse(null, { status: 204 })
        case 'closed':
            return NextResponse.json({ error: 'This session has already started' }, { status: 409 })
        case 'not_found':
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
}