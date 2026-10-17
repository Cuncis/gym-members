import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireSignedIn } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { DAY_NAMES } from '@/lib/time'

export default async function ClassesPage() {
    const session = await requireSignedIn('/classes')
    const role = session.user.role
    if (!can.viewClasses(role)) redirect('/members')

    const now = new Date()
    const classes = await db.gymClass.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        include: {
            trainer: { select: { name: true } },
            _count: { select: { instances: { where: { startsAt: { gte: now } } } } },
        },
    })

    return (
        <main className="mx-auto max-w-2xl p-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-3xl font-bold">Classes</h1>
                {can.createClass(role) && (
                    <Link href="/classes/new" className="rounded bg-black px-4 py-2 font-semibold text-white">
                        Add class
                    </Link>
                )}
            </div>

            {classes.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
                    <p className="font-medium">No classes yet</p>
                </div>
            ) : (
                <ul className="mt-6 space-y-3">
                    {classes.map((c) => (
                        <li key={c.id}>
                            <Link href={`/classes/${c.id}`} className="block rounded-lg border border-neutral-300 p-4 hover:border-black">
                                <p className="font-semibold">{c.name}</p>
                                <p className="text-sm text-neutral-600">
                                    {DAY_NAMES[c.dayOfWeek]}s at {c.startTime} · {c.durationMinutes} min · capacity {c.capacity}
                                </p>
                                <p className="text-sm text-neutral-600">
                                    {c.trainer?.name ?? 'No trainer'} · {c._count.instances} upcoming{' '}
                                    {c._count.instances === 1 ? 'session' : 'sessions'}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}