import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiRole } from '@/lib/guards'
import { STAFF_ROLES } from '@/lib/permissions'
import { createClassSchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(STAFF_ROLES)
    if (!guard.ok) return guard.response

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const parsed = createClassSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    const { role, id: userId } = guard.session.user
    const { trainerId: requestedTrainerId, ...data } = parsed.data

    // A trainer can only create classes for themselves, whatever the request says.
    let trainerId: string
    if (role === 'TRAINER') {
        trainerId = userId
    } else {
        if (!requestedTrainerId) {
            return NextResponse.json({ error: 'Validation failed', fieldErrors: { trainerId: ['Choose a trainer'] } }, { status: 400 })
        }
        const trainer = await db.user.findUnique({ where: { id: requestedTrainerId }, select: { id: true, role: true } })
        if (!trainer || !STAFF_ROLES.includes(trainer.role)) {
            return NextResponse.json({ error: 'Validation failed', fieldErrors: { trainerId: ['Choose a trainer from the list'] } }, { status: 400 })
        }
        trainerId = trainer.id
    }

    const created = await db.gymClass.create({ data: { ...data, trainerId }, select: { id: true } })
    return NextResponse.json(created, { status: 201 })
}