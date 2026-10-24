import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { changeMembership } from '@/lib/billing'
import { billingErrorResponse, readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES, can } from '@/lib/permissions'

const bodySchema = z.object({
    action: z.enum(['pause', 'resume', 'cancel_at_period_end', 'undo_cancel', 'cancel_now']),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    const json = await readJson(request)
    if (!json.ok) return json.response

    const parsed = bodySchema.safeParse(json.body)
    if (!parsed.success) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const { action } = parsed.data

    const membership = await db.membership.findUnique({ where: { id }, select: { userId: true } })
    const { role, id: userId } = guard.session.user

    // Someone else's membership looks exactly like one that does not exist.
    if (!membership || !(membership.userId === userId || can.editMembers(role))) {
        return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }
    // It is theirs (or they are staff), but this action is not allowed for them.
    if (!can.manageMembership(role, userId, membership.userId, action)) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    try {
        const updated = await changeMembership(id, action)
        return NextResponse.json({
            id: updated.id,
            status: updated.status,
            cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
            currentPeriodEnd: updated.currentPeriodEnd,
        })
    } catch (error) {
        return billingErrorResponse(error)
    }
}