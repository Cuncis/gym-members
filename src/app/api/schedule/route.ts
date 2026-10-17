import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES } from '@/lib/permissions'
import { getScheduleWeek } from '@/lib/schedule'
import { parseWeek } from '@/lib/schedule-shared'

export async function GET(request: NextRequest) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const week = parseWeek(request.nextUrl.searchParams.get('week'))
    const data = await getScheduleWeek(guard.session.user.id, week)

    // Personal data: the browser must never keep a copy for later.
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}