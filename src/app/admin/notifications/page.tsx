import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getGymSettings } from '@/lib/gym-settings'
import { requireSignedIn } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { formatDateTimeInZone } from '@/lib/gym-clock'

const badge: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    SENT: 'bg-green-100 text-green-800',
    SKIPPED: 'bg-neutral-100 text-neutral-700',
    FAILED: 'bg-red-100 text-red-800',
}

async function Content() {
    const session = await requireSignedIn('/admin/notifications')
    if (!can.viewNotifications(session.user.role)) notFound()

    const [settings, rows, counts] = await Promise.all([
        getGymSettings(),
        db.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: { select: { name: true, email: true } } },
        }),
        db.notification.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

    return (
        <main className="mx-auto max-w-5xl p-6">
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-sm text-neutral-600">
                The latest 100 messages. Times are shown in the gym time zone ({settings.timeZone}).
            </p>
            <p className="mt-2 text-sm">
                {counts.map((c) => `${c.status.toLowerCase()}: ${c._count._all}`).join(' · ') || 'No messages yet'}
            </p>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-neutral-300">
                            <th className="py-2 pr-3">When</th>
                            <th className="py-2 pr-3">Who</th>
                            <th className="py-2 pr-3">Message</th>
                            <th className="py-2 pr-3">Channel</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2">Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((n) => (
                            <tr key={n.id} className="border-b border-neutral-200 align-top">
                                <td className="py-2 pr-3 whitespace-nowrap">{formatDateTimeInZone(n.createdAt, settings.timeZone)}</td>
                                <td className="py-2 pr-3">
                                    {n.user.name}
                                    <span className="block text-xs text-neutral-500">{n.user.email}</span>
                                </td>
                                <td className="py-2 pr-3">{n.template.replace(/_/g, ' ')}</td>
                                <td className="py-2 pr-3">{n.channel.toLowerCase()}</td>
                                <td className="py-2 pr-3">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[n.status]}`}>{n.status}</span>
                                </td>
                                <td className="py-2 text-neutral-600">{n.error ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    )
}

export default function NotificationLogPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}
