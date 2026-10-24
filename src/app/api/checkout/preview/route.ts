import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { quoteCheckout } from '@/lib/billing'
import { billingErrorResponse, readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { ALL_ROLES } from '@/lib/permissions'

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
        const quote = await quoteCheckout(parsed.data.planId, parsed.data.code)
        return NextResponse.json({
            listPriceCents: quote.listPriceCents,
            discountCents: quote.discountCents,
            totalCents: quote.totalCents,
            currency: quote.plan.currency,
            code: quote.discount?.code ?? null,
        })
    } catch (error) {
        return billingErrorResponse(error)
    }
}