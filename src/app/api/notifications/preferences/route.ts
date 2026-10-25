import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readJson } from '@/lib/billing-http'
import { db } from '@/lib/db'
import { requireApiRole } from '@/lib/guards'
import { normalizePhone } from '@/lib/messaging/phone'
import { ALL_ROLES } from '@/lib/permissions'

const bodySchema = z.object({ smsOptIn: z.boolean() })

// People change their own text-message setting. There is no id in the request: it is always the signed-in person.
export async function PATCH(request: NextRequest) {
    const guard = await requireApiRole(ALL_ROLES)
    if (!guard.ok) return guard.response

    const json = await readJson(request)
    if (!json.ok) return json.response
    const parsed = bodySchema.safeParse(json.body)
    if (!parsed.success) return NextResponse.json({ error: 'smsOptIn must be true or false' }, { status: 400 })

    const userId = guard.session.user.id
    const user = await db.user.findUnique({ where: { id: userId }, select: { phone: true, smsOptIn: true, smsConsentAt: true } })
    if (!user) return NextResponse.json({ error: 'Your account no longer exists' }, { status: 404 })

    if (parsed.data.smsOptIn && !(user.phone && normalizePhone(user.phone))) {
        return NextResponse.json({ error: 'Add a valid mobile number to your profile first' }, { status: 400 })
    }

    // Keep the date the person first agreed. It is the record that they consented.
    await db.user.update({
        where: { id: userId },
        data: {
            smsOptIn: parsed.data.smsOptIn,
            smsConsentAt: parsed.data.smsOptIn ? (user.smsOptIn ? user.smsConsentAt : new Date()) : null,
        },
    })
    return NextResponse.json({ smsOptIn: parsed.data.smsOptIn })
}