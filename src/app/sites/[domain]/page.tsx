import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { formatMoney } from '@/lib/format'
import { formatDateTimeInZone } from '@/lib/gym-clock'
import { findGymByHost } from '@/lib/tenant'
import { runInGym } from '@/lib/tenant-context'

// The proxy rewrites "/" on a gym's address to /sites/<address>. Visitors never type this path (the proxy blocks it).
type Props = { params: Promise<{ domain: string }> }

async function loadGym(params: Props['params']) {
    const { domain } = await params
    return findGymByHost(decodeURIComponent(domain))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const gym = await loadGym(params)
    return { title: gym ? gym.name : 'Gym not found' }
}

export default function GymHomePage({ params }: Props) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content params={params} />
        </Suspense>
    )
}

async function Content({ params }: Props) {
    const gym = await loadGym(params)
    if (!gym) notFound()

    // Nothing here comes from the URL except which gym; every query below is limited to that gym.
    const { plans, sessions } = await runInGym(gym.id, async () => ({
        plans: await db.membershipPlan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } }),
        sessions: await db.gymClassInstance.findMany({
            where: { startsAt: { gt: new Date() } },
            orderBy: { startsAt: 'asc' },
            take: 5,
            include: { gymClass: { select: { name: true } } },
        }),
    }))

    return (
        <main>
            <section style={{ background: 'var(--brand)', color: 'var(--brand-contrast)' }}>
                <div className="mx-auto max-w-2xl px-6 py-12">
                    <h1 className="text-4xl font-bold">{gym.name}</h1>
                    <p className="mt-2 opacity-90">
                        Classes, memberships and more. All times are {gym.timeZone} time.
                    </p>
                    <div className="mt-6 flex gap-3">
                        <Link href="/signin" className="rounded border border-current px-4 py-2 font-semibold">
                            Sign in
                        </Link>
                        <Link href="/signup" className="rounded border border-current px-4 py-2">
                            Create account
                        </Link>
                    </div>
                </div>
            </section>

            <div className="mx-auto max-w-2xl space-y-10 p-6">
                <section>
                    <h2 className="text-2xl font-semibold">Memberships</h2>
                    {plans.length === 0 ? (
                        <p className="mt-2 text-neutral-600">No plans yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {plans.map((plan) => (
                                <li key={plan.id} className="rounded-lg border border-neutral-300 p-4">
                                    <p className="font-semibold">{plan.name}</p>
                                    <p className="text-sm text-neutral-600">
                                        {formatMoney(plan.priceCents, plan.currency)}
                                        {plan.kind === 'RECURRING'
                                            ? ` per ${plan.interval === 'YEAR' ? 'year' : 'month'}`
                                            : ' one time'}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <h2 className="text-2xl font-semibold">Next classes</h2>
                    {sessions.length === 0 ? (
                        <p className="mt-2 text-neutral-600">No upcoming sessions.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {sessions.map((s) => (
                                <li key={s.id} className="flex justify-between border-b border-neutral-200 py-2">
                                    <span>{s.gymClass.name}</span>
                                    <span className="text-neutral-600">{formatDateTimeInZone(s.startsAt, gym.timeZone)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </main>
    )
}
