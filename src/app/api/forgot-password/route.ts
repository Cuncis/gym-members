import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGym, gymBaseUrl } from '@/lib/gym'
import { sendPasswordResetEmail } from '@/lib/mailer'
import { generateToken, hashToken } from '@/lib/tokens'
import { forgotPasswordSchema } from '@/lib/validation'

const ONE_HOUR = 60 * 60 * 1000

// The same answer whether or not the email has an account, so the form cannot be used to find out.
const REPLY = { message: 'If an account exists for that email, we have sent a reset link.' }

export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
    }

    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email } })

    if (user) {
        const token = generateToken()
        await db.$transaction([
            // Only the newest link works: older unused ones are removed.
            db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
            db.passwordResetToken.create({
                data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ONE_HOUR) },
            }),
        ])

        // The link's address is built from what we store about the gym (its subdomain or verified domain),
        // never copied from the request's Host header, which an attacker can fake.
        const base = await gymBaseUrl(await getGym())
        try {
            await sendPasswordResetEmail(user.email, `${base}/reset-password?token=${token}`)
        } catch (e) {
            console.error('Could not send reset email', e)
        }
    }

    return NextResponse.json(REPLY)
}