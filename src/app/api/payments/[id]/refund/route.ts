import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { refundPayment } from '@/lib/billing'
import { billingErrorResponse, readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { MANAGER_ROLES } from '@/lib/permissions'
import { getGateway } from '@/lib/payment-gateways'

const bodySchema = z.object({
    amountCents: z.number().int().min(1).max(100_000_000),
    reason: z.string().trim().max(200).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
    const guard = await requireApiRole(MANAGER_ROLES)
    if (!guard.ok) return guard.response

    const { id } = await params
    const json = await readJson(request)
    if (!json.ok) return json.response

    const parsed = bodySchema.safeParse(json.body)
    if (!parsed.success) {
        return NextResponse.json({ error: 'amountCents must be a whole number of cents above zero' }, { status: 400 })
    }

    try {
        const payment = await refundPayment(getGateway(), {
            paymentId: id,
            amountCents: parsed.data.amountCents,
            reason: parsed.data.reason,
            actorId: guard.session.user.id,
        })
        return NextResponse.json({ id: payment.id, refundedCents: payment.refundedCents }, { status: 201 })
    } catch (error) {
        return billingErrorResponse(error)
    }
}