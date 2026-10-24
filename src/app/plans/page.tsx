import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requireSignedIn } from '@/lib/guards'
import { PlanPicker, type PlanDto } from '@/components/PlanPicker'

export default function PlansPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}

async function Content() {
    await requireSignedIn('/plans')

    const plans = await db.membershipPlan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } })
    const dtos: PlanDto[] = plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        kind: p.kind,
        interval: p.interval,
        durationDays: p.durationDays,
    }))

    return (
        <main className="mx-auto max-w-4xl p-6">
            <h1 className="text-3xl font-bold">Plans</h1>
            <p className="mt-1 text-sm text-neutral-600">
                Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC. Already a member?{' '}
                <Link href="/billing" className="underline">See your billing</Link>.
            </p>
            {dtos.length === 0 ? (
                <p className="mt-6 text-neutral-600">No plans yet. Run pnpm db:seed.</p>
            ) : (
                <PlanPicker plans={dtos} />
            )}
        </main>
    )
}