import { Suspense } from 'react'
import { GymSettingsForm } from '@/components/GymSettingsForm'
import { requirePageRole } from '@/lib/guards'
import { getGym, gymBaseUrl } from '@/lib/gym'
import { ADMIN_ROLES } from '@/lib/permissions'

async function Content() {
    await requirePageRole(ADMIN_ROLES, '/admin/settings')
    const gym = await getGym()

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">Gym settings</h1>
            <p className="mt-2 text-sm text-neutral-600">
                Your address is <span className="font-mono">{await gymBaseUrl(gym)}</span>. Add your own domain under{' '}
                <a className="underline" href="/admin/domains">
                    Domains
                </a>
                .
            </p>
            <GymSettingsForm
                initial={{
                    name: gym.name,
                    timeZone: gym.timeZone,
                    brandColor: gym.brandColor,
                    billingHour: gym.billingHour,
                    reminderHour: gym.reminderHour,
                }}
            />
        </main>
    )
}

export default function GymSettingsPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}
