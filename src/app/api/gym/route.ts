import { NextRequest, NextResponse } from 'next/server'
import { readJson } from '@/lib/billing-http'
import { requireApiRole } from '@/lib/guards'
import { getGym } from '@/lib/gym'
import { gymProfileSchema, updateGymProfile } from '@/lib/gym-profile'
import { ADMIN_ROLES } from '@/lib/permissions'

const view = (gym: Awaited<ReturnType<typeof getGym>>) => ({
    slug: gym.slug,
    name: gym.name,
    timeZone: gym.timeZone,
    brandColor: gym.brandColor,
    billingHour: gym.billingHour,
    reminderHour: gym.reminderHour,
})

export async function GET() {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response
    return NextResponse.json(view(await getGym()))
}

// Only admins change the gym's settings, and only their own gym's: the id is never read from the request.
export async function PATCH(request: NextRequest) {
    const guard = await requireApiRole(ADMIN_ROLES)
    if (!guard.ok) return guard.response

    const json = await readJson(request)
    if (!json.ok) return json.response

    const parsed = gymProfileSchema.safeParse(json.body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
        )
    }
    return NextResponse.json(view(await updateGymProfile(parsed.data)))
}