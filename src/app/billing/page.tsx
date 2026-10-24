import Link from 'next/link'
import { listMyMemberships } from '@/lib/billing'
import { requireSignedIn } from '@/lib/guards'
import { formatDate, formatMoney } from '@/lib/format'
import { MembershipActions } from '@/components/MembershipActions'
import { MembershipStatusBadge } from '@/components/MembershipStatusBadge'

export const dynamic = 'force-dynamic'

type Row = {
    status: string
    kind: 'RECURRING' | 'ONE_TIME'
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: Date | null
    endDate: Date | null
    priceCents: number
    currency: string
}

function describe(m: Row): string {
    const end = m.currentPeriodEnd ? formatDate(m.currentPeriodEnd) : null
    switch (m.status) {
        case 'PENDING':
            return 'Waiting for payment.'
        case 'ACTIVE':
            if (m.cancelAtPeriodEnd) return `Ends on ${end}. You keep full access until then.`
            if (m.kind === 'ONE_TIME') return `Valid until ${end}.`
            return `Renews on ${end} for ${formatMoney(m.priceCents, m.currency)}.`
        case 'PAUSED':
            return 'Paused. The time you have left is kept.'
        case 'PAST_DUE':
            return 'We could not charge your card. Please contact the gym.'
        case 'CANCELLED':
            return m.endDate ? `Cancelled. Ended on ${formatDate(m.endDate)}.` : 'Cancelled.'
        default:
            return end ? `Expired on ${end}.` : 'Expired.'
    }
}

export default async function BillingPage() {
    const session = await requireSignedIn('/billing')

    const memberships = await listMyMemberships(session.user.id)

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">My billing</h1>

            {memberships.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
                    <p className="font-medium">No memberships yet</p>
                    <Link href="/plans" className="mt-3 inline-block rounded bg-black px-4 py-2 font-semibold text-white">
                        See plans
                    </Link>
                </div>
            ) : (
                <ul className="mt-6 space-y-4">
                    {memberships.map((m) => (
                        <li key={m.id} className="rounded-lg border border-neutral-300 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold">{m.planName}</p>
                                <MembershipStatusBadge status={m.status} />
                            </div>
                            <p className="mt-1 text-sm text-neutral-600">{describe(m)}</p>

                            <MembershipActions
                                id={m.id}
                                status={m.status}
                                kind={m.kind}
                                cancelAtPeriodEnd={m.cancelAtPeriodEnd}
                                staff={false}
                            />

                            {m.payments.length > 0 && (
                                <div className="mt-4">
                                    <h2 className="text-sm font-semibold">Payments</h2>
                                    <ul className="mt-1 space-y-1 text-sm">
                                        {m.payments.map((p) => (
                                            <li key={p.id}>
                                                {formatMoney(p.amountCents, p.currency)} on {formatDate(p.createdAt)}
                                                {p.refundedCents > 0 && (
                                                    <span className="text-neutral-600"> · {formatMoney(p.refundedCents, p.currency)} refunded</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}