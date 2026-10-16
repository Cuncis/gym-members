import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'
import { auth } from '@/lib/auth'

// For pages: sends signed-out visitors to the sign-in page, and brings them back afterwards.
export async function requireSignedIn(returnTo: string) {
    const session = await auth()
    if (!session?.user) redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`)
    return session
}

// For pages: signed in AND one of the allowed roles, otherwise sent to /members.
export async function requirePageRole(allowed: Role[], returnTo: string) {
    const session = await requireSignedIn(returnTo)
    if (!allowed.includes(session.user.role)) redirect('/members')
    return session
}

// For API routes: 401 means "not signed in", 403 means "signed in but not allowed".
export async function requireApiRole(allowed: Role[]) {
    const session = await auth()
    if (!session?.user) {
        return { ok: false as const, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
    }
    if (!allowed.includes(session.user.role)) {
        return { ok: false as const, response: NextResponse.json({ error: 'Not allowed' }, { status: 403 }) }
    }
    return { ok: true as const, session }
}