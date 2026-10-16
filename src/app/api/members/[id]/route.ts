import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { createMemberSchema } from '@/lib/validation'

type Ctx = { params: Promise<{ id: string }> }

// PUT replaces all the editable fields, so the form always sends all of them.
export async function PUT(request: NextRequest, { params }: Ctx) {
    const { id } = await params

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
        const member = await db.user.update({
            where: { id },
            // An empty phone becomes undefined, which Prisma ignores. null clears it.
            data: { ...parsed.data, phone: parsed.data.phone ?? null },
        })
        return NextResponse.json(member)
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2002') {
                return NextResponse.json(
                    {
                        error: 'A member with this email already exists',
                        fieldErrors: { email: ['This email is already in use'] },
                    },
                    { status: 409 },
                )
            }
            if (e.code === 'P2025') {
                return NextResponse.json({ error: 'Member not found' }, { status: 404 })
            }
        }
        throw e
    }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
    const { id } = await params

    try {
        await db.user.delete({ where: { id } })
        return new NextResponse(null, { status: 204 })
    } catch (e) {
        // P2025 is Prisma's code for "record not found"
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            return NextResponse.json({ error: 'Member not found' }, { status: 404 })
        }
        throw e
    }
}