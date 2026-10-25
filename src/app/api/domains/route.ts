import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readJson } from '@/lib/billing-http'
import { addDomain, listDomains } from '@/lib/domains'
import { requireApiRole } from '@/lib/guards'
import { ADMIN_ROLES } from '@/lib/permissions'

const bodySchema = z.object({ hostname: z.string().min(1).max(300) })

export async function GET() {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response
    return NextResponse.json(await listDomains())
}

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response

    const json = await readJson(request)
    if (!json.ok) return json.response
    const parsed = bodySchema.safeParse(json.body)
    if (!parsed.success) return NextResponse.json({ error: 'hostname is required' }, { status: 400 })

    const result = await addDomain(parsed.data.hostname)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result.domain, { status: 201 })
}