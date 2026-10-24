import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MemberStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { getMember } from '@/lib/members'
import { formatDate, formatMoney } from '@/lib/format'
import { requireSignedIn } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { DeleteMemberButton } from '@/components/DeleteMemberButton'
import { MembershipActions } from '@/components/MembershipActions'
import { MembershipStatusBadge } from '@/components/MembershipStatusBadge'
import { RefundForm } from '@/components/RefundForm'

export const dynamic = 'force-dynamic'

const badge: Record<MemberStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-red-100 text-red-800',
    LEAD: 'bg-blue-100 text-blue-800',
}

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await requireSignedIn(`/members/${id}`)
    const role = session.user.role

    // A member opening someone else's profile gets a 404, the same as for an id that does not exist.
    if (!can.viewMember(role, session.user.id, id)) notFound()

    const member = await getMember(id)
    if (!member) notFound()

    const payments = await db.payment.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { membership: { select: { planName: true } } },
    })

    const isStaff = can.editMembers(role)

    return (
        <main className="mx-auto max-w-2xl p-6">
            {can.viewDirectory(role) && (
                <Link href="/members" className="text-sm text-neutral-600 hover:underline">
                    ← Back to members
                </Link>
            )}

            <div className="mt-4 flex items-start justify-between gap-3">
                <h1 className="text-3xl font-bold">{member.name}</h1>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge[member.status]}`}>{member.status}</span>
            </div>

            {(can.editMembers(role) || can.deleteMember(role, session.user.id, member.id)) && (
                <div className="mt-4 flex gap-2">
                    {can.editMembers(role) && (
                        <Link href={`/members/${member.id}/edit`} className="rounded border px-3 py-1.5 text-sm">
                            Edit
                        </Link>
                    )}
                    {can.deleteMember(role, session.user.id, member.id) && (
                        <DeleteMemberButton id={member.id} name={member.name} />
                    )}
                </div>
            )}

            <dl className="mt-6 grid gap-4 rounded-lg border border-neutral-300 p-4 sm:grid-cols-2">
                <div>
                    <dt className="text-sm text-neutral-600">Email</dt>
                    <dd className="font-medium">{member.email}</dd>
                </div>
                <div>
                    <dt className="text-sm text-neutral-600">Phone</dt>
                    <dd className="font-medium">{member.phone ?? 'Not provided'}</dd>
                </div>
                <div>
                    <dt className="text-sm text-neutral-600">Member since</dt>
                    <dd className="font-medium">{formatDate(member.createdAt)}</dd>
                </div>
            </dl>

            <h2 className="mt-8 text-xl font-semibold">Memberships ({member.memberships.length})</h2>

            {member.memberships.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-neutral-300 p-6 text-center">
                    <p className="font-medium">No memberships yet</p>
                </div>
            ) : (
                <ul className="mt-3 space-y-3">
                    {member.memberships.map((m) => (
                        <li key={m.id} className="rounded-lg border border-neutral-300 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold">{m.planName}</p>
                                <MembershipStatusBadge status={m.status} />
                            </div>
                            <p className="text-sm text-neutral-600">
                                {formatMoney(m.priceCents, m.currency)} · {formatDate(m.startDate)} to{' '}
                                {m.endDate ? formatDate(m.endDate) : 'ongoing'}
                                {m.currentPeriodEnd && m.status === 'ACTIVE' && <> · period ends {formatDate(m.currentPeriodEnd)}</>}
                                {m.cancelAtPeriodEnd && <> · set to end</>}
                            </p>
                            {/* Rows from before billing existed (no plan) have no actions. */}
                            {m.planId && (
                                <MembershipActions
                                    id={m.id}
                                    status={m.status}
                                    kind={m.kind}
                                    cancelAtPeriodEnd={m.cancelAtPeriodEnd}
                                    staff={isStaff}
                                />
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {payments.length > 0 && (
                <>
                    <h2 className="mt-8 text-xl font-semibold">Payments ({payments.length})</h2>
                    <ul className="mt-3 space-y-3">
                        {payments.map((p) => {
                            const remaining = p.amountCents - p.refundedCents
                            return (
                                <li key={p.id} className="rounded-lg border border-neutral-300 p-4">
                                    <p className="font-semibold">
                                        {formatMoney(p.amountCents, p.currency)}{' '}
                                        <span className="font-normal text-neutral-600">for {p.membership.planName}</span>
                                    </p>
                                    <p className="text-sm text-neutral-600">
                                        {formatDate(p.createdAt)} · {p.provider}
                                        {p.refundedCents > 0 && <> · {formatMoney(p.refundedCents, p.currency)} refunded</>}
                                    </p>
                                    {can.refund(role) && remaining > 0 && <RefundForm paymentId={p.id} remainingCents={remaining} />}
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </main>
    )
}