import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireApiRole } from '@/lib/guards'
import { MANAGER_ROLES, STAFF_ROLES } from '@/lib/permissions'
import { listMembers } from '@/lib/members'
import { createMemberSchema, listQuerySchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
    const guard = await requireApiRole(STAFF_ROLES)
    if (!guard.ok) return guard.response
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = listQuerySchema.safeParse(params)

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid query', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    return NextResponse.json(await listMembers(parsed.data))
}

export async function POST(request: NextRequest) {
    const guard = await requireApiRole(MANAGER_ROLES)
    if (!guard.ok) return guard.response
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