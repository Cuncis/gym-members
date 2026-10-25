import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { calendarUrl } from '@/lib/calendar'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES } from '@/lib/permissions'
import { generateToken } from '@/lib/tokens'

const accountGone = () => NextResponse.json({ error: 'Your account no longer exists' }, { status: 401 })

const isMissingRow = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'

// Creates a link, or replaces the old one. The old link stops working immediately.
export async function POST() {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const token = generateToken()
    try {
        await db.user.update({ where: { id: guard.session.user.id }, data: { calendarToken: token } })
    } catch (e) {
        if (isMissingRow(e)) return accountGone()
        throw e
    }
    return NextResponse.json({ url: await calendarUrl(token) }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

// Turns the link off.
export async function DELETE() {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    try {
        await db.user.update({ where: { id: guard.session.user.id }, data: { calendarToken: null } })
    } catch (e) {
        if (isMissingRow(e)) return accountGone()
        throw e
    }
    return new NextResponse(null, { status: 204 })
}