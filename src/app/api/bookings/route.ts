import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { bookSession } from '@/lib/bookings'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES } from '@/lib/permissions'

const bodySchema = z.object({ instanceId: z.string().min(1).max(100) })

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    try {
        const result = await bookSession(parsed.data.instanceId, guard.session.user.id)

        switch (result.kind) {
            case 'booked':
                return NextResponse.json({ bookingId: result.bookingId, status: 'BOOKED' }, { status: 201 })
            case 'already':
                return NextResponse.json({ bookingId: result.bookingId, status: result.status })
            case 'full':
                return NextResponse.json({ error: 'This session is full', code: 'FULL' }, { status: 409 })
            case 'closed':
                return NextResponse.json({ error: 'This session has already started', code: 'CLOSED' }, { status: 409 })
            case 'not_found':
                return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }
    } catch (e) {
        // P2003: the signed-in user was deleted while their cookie was still valid
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
            return NextResponse.json({ error: 'Your account no longer exists' }, { status: 401 })
        }
        throw e
    }
}