import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getGym, WEEKS_AHEAD } from '@/lib/classes'
import { requireSignedIn } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { DAY_NAMES, formatDateTime } from '@/lib/time'
import { GenerateInstancesButton } from '@/components/GenerateInstancesButton'

export default function ClassPage(props: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content {...props} />
        </Suspense>
    )
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await requireSignedIn(`/classes/${id}`)
    const { role, id: userId } = session.user
    if (!can.viewClasses(role)) redirect('/members')

    const gymClass = await db.gymClass.findUnique({
        where: { id },
        include: { trainer: { select: { name: true } } },
    })
    if (!gymClass) notFound()

    const gym = await getGym()
    const sessions = await db.gymClassInstance.findMany({
        where: { classId: id, startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 30,
        include: { _count: { select: { bookings: { where: { status: 'BOOKED' } } } } },
    })

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href="/classes" className="text-sm text-neutral-600 hover:underline">← Back to classes</Link>
            <h1 className="mt-4 text-3xl font-bold">{gymClass.name}</h1>
            <p className="mt-1 text-neutral-600">
                {DAY_NAMES[gymClass.dayOfWeek]}s at {gymClass.startTime} ({gym.timeZone}) · {gymClass.durationMinutes} min ·
                capacity {gymClass.capacity} · {gymClass.trainer?.name ?? 'No trainer'}
            </p>
            {gymClass.description && <p className="mt-3">{gymClass.description}</p>}

            <h2 className="mt-8 text-xl font-semibold">Upcoming sessions ({sessions.length})</h2>

            {can.manageClass(role, userId, gymClass.trainerId) && (
                <div className="mt-3">
                    <GenerateInstancesButton classId={gymClass.id} weeks={WEEKS_AHEAD} />
                </div>
            )}

            {sessions.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center">
                    <p className="font-medium">No upcoming sessions</p>
                    <p className="mt-1 text-sm text-neutral-600">Generate the next {WEEKS_AHEAD} weeks to open this class for booking.</p>
                </div>
            ) : (
                <ul className="mt-4 space-y-2">
                    {sessions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-300 p-3">
                            <span className="font-medium">{formatDateTime(s.startsAt, gym.timeZone)}</span>
                            <span className="text-sm text-neutral-600">{s._count.bookings}/{s.capacity} booked</span>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}