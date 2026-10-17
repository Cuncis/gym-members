import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signUpSchema } from '@/lib/validation'
import { verifyTurnstile } from '@/lib/turnstile'

export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const turnstileToken =
        typeof body === 'object' && body !== null && 'turnstileToken' in body && typeof body.turnstileToken === 'string'
            ? body.turnstileToken
            : undefined

    if (!(await verifyTurnstile(turnstileToken))) {
        return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 })
    }

    const parsed = signUpSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    const { name, email, password } = parsed.data
    const passwordHash = await bcrypt.hash(password, 12)

    try {
        // Role and status are never taken from the request: new accounts are always MEMBER and LEAD.
        const user = await db.user.create({
            data: { name, email, passwordHash },
            select: { id: true, email: true },
        })
        return NextResponse.json(user, { status: 201 })
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return NextResponse.json(
                { error: 'Could not create the account', fieldErrors: { email: ['This email is already registered'] } },
                { status: 409 },
            )
        }
        throw e
    }
}