import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { hashToken } from '@/lib/tokens'
import { resetPasswordSchema } from '@/lib/validation'

const INVALID = { error: 'This reset link is invalid or has expired. Please request a new one.' }

export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    const { token, password } = parsed.data
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } })

    if (!record || record.usedAt || record.expiresAt < new Date()) {
        return NextResponse.json(INVALID, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const changed = await db.$transaction(async (tx) => {
        // "Claim" the token first. If two requests arrive together, only one can flip usedAt from null.
        const claimed = await tx.passwordResetToken.updateMany({
            where: { id: record.id, usedAt: null },
            data: { usedAt: new Date() },
        })
        if (claimed.count !== 1) return false

        await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
        return true
    })

    if (!changed) return NextResponse.json(INVALID, { status: 400 })
    return NextResponse.json({ ok: true })
}