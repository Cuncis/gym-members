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
    if (result === 'closed') {
        return NextResponse.json({ error: 'This session has already started' }, { status: 409 })
    }
    if (result === 'not_found') {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
}