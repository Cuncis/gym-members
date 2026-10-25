import { NextRequest, NextResponse } from 'next/server'
import { verifyDomain } from '@/lib/domains'
import { requireApiRole } from '@/lib/guards'
import { ADMIN_ROLES } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

const MESSAGES = {
    not_found: 'Domain not found',
    no_record: 'We could not find the TXT record yet. DNS changes can take a few minutes. Try again soon.',
    wrong_value: 'A TXT record exists, but its value is not the one shown above.',
    lookup_failed: 'The DNS lookup failed. Please try again.',
} as const

export async function POST(_request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    const result = await verifyDomain(id)
    if (result.ok) return NextResponse.json({ verified: true })
    return NextResponse.json({ verified: false, error: MESSAGES[result.reason] }, { status: result.reason === 'not_found' ? 404 : 200 })
}