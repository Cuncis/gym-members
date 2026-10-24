import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireSignedIn } from '@/lib/guards'
import { MembershipStatusBadge } from '@/components/MembershipStatusBadge'
import { RefreshWhilePending } from '@/components/RefreshWhilePending'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function CheckoutSuccessPage(props: { searchParams: SearchParams }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content {...props} />
        </Suspense>
    )
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
    const id = first((await searchParams).m)
    const session = await requireSignedIn(id ? `/checkout/success?m=${encodeURIComponent(id)}` : '/billing')

    // Only your own purchase can be shown here.
    const membership = id ? await db.membership.findFirst({ where: { id, userId: session.user.id } }) : null
    if (!membership) notFound()

    return (
        <main className="mx-auto max-w-lg p-6">
            <h1 className="text-3xl font-bold">
                {membership.status === 'PENDING' ? 'Confirming your payment' : 'Thank you'}
            </h1>
            <p className="mt-3 flex items-center gap-2">
                <span className="font-semibold">{membership.planName}</span>
                <MembershipStatusBadge status={membership.status} />
            </p>

            {membership.status === 'PENDING' && <RefreshWhilePending />}
            {membership.status === 'ACTIVE' && <p className="mt-3">Your membership is active.</p>}

            <p className="mt-6 flex gap-4 text-sm">
                <Link href="/billing" className="underline">My billing</Link>
                <Link href="/plans" className="underline">Plans</Link>
            </p>
        </main>
    )
}