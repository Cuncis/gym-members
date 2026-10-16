import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { MemberStatus } from '@prisma/client'
import { getMember } from '@/lib/members'
import { formatDate, formatMoney } from '@/lib/format'
import { DeleteMemberButton } from '@/components/DeleteMemberButton'

const badge: Record<MemberStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-red-100 text-red-800',
    LEAD: 'bg-blue-100 text-blue-800',
}

export default function MemberPage(props: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content {...props} />
        </Suspense>
    )
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const member = await getMember(id)
    if (!member) notFound()

    const now = new Date()
    const isCurrent = (endDate: Date | null, startDate: Date) =>
        startDate <= now && (endDate === null || endDate >= now)

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href="/members" className="text-sm text-neutral-600 hover:underline">
                ← Back to members
            </Link>

            <div className="mt-4 flex items-start justify-between gap-3">
                <h1 className="text-3xl font-bold">{member.name}</h1>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge[member.status]}`}>
                    {member.status}
                </span>
            </div>

            <div className="mt-4 flex gap-2">
                <Link href={`/members/${member.id}/edit`} className="rounded border px-3 py-1.5 text-sm">
                    Edit
                </Link>
                <DeleteMemberButton id={member.id} name={member.name} />
            </div>

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
                                {isCurrent(m.endDate, m.startDate) && (
                                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                        Current
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-neutral-600">
                                {formatMoney(m.priceCents)} · {formatDate(m.startDate)} to{' '}
                                {m.endDate ? formatDate(m.endDate) : 'ongoing'}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    )
}