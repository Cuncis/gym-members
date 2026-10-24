import type { MembershipStatus } from '@prisma/client'

const styles: Record<MembershipStatus, string> = {
    PENDING: 'bg-blue-100 text-blue-800',
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    PAST_DUE: 'bg-orange-100 text-orange-800',
    CANCELLED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-neutral-100 text-neutral-700',
}

const labels: Record<MembershipStatus, string> = {
    PENDING: 'Pending',
    ACTIVE: 'Active',
    PAUSED: 'Paused',
    PAST_DUE: 'Past due',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
}

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
    return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    )
}
