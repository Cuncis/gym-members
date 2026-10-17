import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateInstances } from '@/lib/classes'
import { requireApiRole } from '@/lib/guards'
import { can, STAFF_ROLES } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(STAFF_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    const gymClass = await db.gymClass.findUnique({ where: { id }, select: { trainerId: true } })
    if (!gymClass) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    const { role, id: userId } = guard.session.user
    if (!can.manageClass(role, userId, gymClass.trainerId)) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const result = await generateInstances(id)
    if (!result) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    return NextResponse.json(result)
}