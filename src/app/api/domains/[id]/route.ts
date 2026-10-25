import { NextRequest, NextResponse } from 'next/server'
import { removeDomain } from '@/lib/domains'
import { requireApiRole } from '@/lib/guards'
import { ADMIN_ROLES } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    // Another gym's domain looks exactly like one that does not exist.
    if (!(await removeDomain(id))) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    return NextResponse.json({ removed: true })
}