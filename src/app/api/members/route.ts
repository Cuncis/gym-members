import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { createMemberSchema, listQuerySchema } from '@/lib/validation'

const PAGE_SIZE = 10

export async function GET(request: NextRequest) {
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = listQuerySchema.safeParse(params)

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid query', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    const { page, q, status } = parsed.data

    const where: Prisma.UserWhereInput = {
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    }

    // One round trip: the total count and the current page.
    const [total, items] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
            where,
            // id as a tiebreaker keeps the order stable when createdAt values are equal
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: { _count: { select: { memberships: true } } },
        }),
    ])

    return NextResponse.json({
        items,
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
}

export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const parsed = createMemberSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    try {
        const member = await db.user.create({ data: parsed.data })
        return NextResponse.json(member, { status: 201 })
    } catch (e) {
        // P2002 is Prisma's code for "unique constraint failed"
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return NextResponse.json(
                {
                    error: 'A member with this email already exists',
                    fieldErrors: { email: ['This email is already in use'] },
                },
                { status: 409 },
            )
        }
        throw e
    }
}