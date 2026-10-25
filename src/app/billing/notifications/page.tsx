import { Suspense } from 'react'
import Link from 'next/link'
import { NotificationPreferences } from '@/components/NotificationPreferences'
import { db } from '@/lib/db'
import { requireSignedIn } from '@/lib/guards'
import { normalizePhone } from '@/lib/messaging/phone'

async function Content() {
    const session = await requireSignedIn('/billing/notifications')
    const user = await db.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: { phone: true, smsOptIn: true },
    })

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href="/billing" className="text-sm text-neutral-600 hover:underline">
                ← Back to billing
            </Link>
            <h1 className="mt-4 text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-neutral-700">
                We email you receipts, renewal reminders and payment problems. You can also get the urgent ones by text.
            </p>
            <NotificationPreferences initial={user.smsOptIn} hasPhone={Boolean(user.phone && normalizePhone(user.phone))} />
        </main>
    )
}

export default function NotificationSettingsPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}
