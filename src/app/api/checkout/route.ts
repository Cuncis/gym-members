import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { startCheckout } from '@/lib/billing'
import { billingErrorResponse, readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES } from '@/lib/permissions'
import { getGateway } from '@/lib/payment-gateways'

const bodySchema = z.object({
    planId: z.string().min(1).max(100),
    code: z.string().trim().max(40).optional(),
})

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const json = await readJson(request)
    if (!json.ok) return json.response

    const parsed = bodySchema.safeParse(json.body)
    if (!parsed.success) return NextResponse.json({ error: 'planId is required' }, { status: 400 })

    try {
        // The buyer is always the signed-in person. A request cannot buy on someone else's behalf.
        const result = await startCheckout(getGateway(), { userId: guard.session.user.id, ...parsed.data })
        return NextResponse.json(result, { status: 201 })
    } catch (error) {
        return billingErrorResponse(error)
    }
}