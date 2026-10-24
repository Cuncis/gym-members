import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { MANAGER_ROLES } from '@/lib/permissions'

const createDiscountSchema = z
    .object({
        code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9_-]{3,32}$/, 'Use 3 to 32 letters, digits, - or _'),
        type: z.enum(['PERCENT', 'FIXED']),
        value: z.number().int().positive('Must be above zero'),
        startsAt: z.coerce.date().optional(),
        expiresAt: z.coerce.date().optional(),
        maxRedemptions: z.number().int().positive().optional(),
    })
    .superRefine((d, ctx) => {
        if (d.type === 'PERCENT' && d.value > 100) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot be above 100' })
        }
        if (d.type === 'FIXED' && d.value > 1_000_000) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: 'A fixed amount cannot be above 10,000.00' })
        }
        if (d.startsAt && d.expiresAt && d.expiresAt <= d.startsAt) {
            ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Must be after the start date' })
        }
    })

export async function GET() {
    const guard = await requireApiRole(MANAGER_ROLES)
    if (!guard.ok) return guard.response

    const discounts = await db.discount.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ items: discounts })
}

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(MANAGER_ROLES)
    if (!guard.ok) return guard.response

    const json = await readJson(request)
    if (!json.ok) return json.response

    const parsed = createDiscountSchema.safeParse(json.body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    try {
        const discount = await db.discount.create({ data: parsed.data })
        return NextResponse.json(discount, { status: 201 })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'This code already exists', fieldErrors: { code: ['This code already exists'] } },
                { status: 409 },
            )
        }
        throw error
    }
}