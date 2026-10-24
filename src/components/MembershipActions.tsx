'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, errorMessage } from '@/lib/api-client'

type Action = 'pause' | 'resume' | 'cancel_at_period_end' | 'undo_cancel' | 'cancel_now'

type Props = {
    id: string
    status: string
    kind: 'RECURRING' | 'ONE_TIME'
    cancelAtPeriodEnd: boolean
    staff: boolean
}

export function MembershipActions({ id, status, kind, cancelAtPeriodEnd, staff }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState<Action | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function run(action: Action, question: string) {
        if (!window.confirm(question)) return
        setBusy(action)
        setError(null)
        try {
            await apiFetch(`/api/memberships/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(null)
            router.refresh() // a refused action usually means the page was out of date
        }
    }

    const button = 'rounded border px-3 py-1.5 text-sm disabled:opacity-60'
    const active = status === 'ACTIVE'

    return (
        <div className="mt-3">
            <div className="flex flex-wrap gap-2">
                {active && (
                    <button
                        type="button"
                        className={button}
                        disabled={busy !== null}
                        onClick={() => run('pause', 'Pause this membership? Nothing is charged while it is paused, and the time you have left is kept.')}
                    >
                        {busy === 'pause' ? 'Pausing…' : 'Pause'}
                    </button>
                )}
                {status === 'PAUSED' && (
                    <button type="button" className={button} disabled={busy !== null} onClick={() => run('resume', 'Resume this membership?')}>
                        {busy === 'resume' ? 'Resuming…' : 'Resume'}
                    </button>
                )}
                {active && kind === 'RECURRING' && !cancelAtPeriodEnd && (
                    <button
                        type="button"
                        className={button}
                        disabled={busy !== null}
                        onClick={() => run('cancel_at_period_end', 'Cancel at the end of this period? You keep full access until then and are not charged again.')}
                    >
                        {busy === 'cancel_at_period_end' ? 'Working…' : 'Cancel at period end'}
                    </button>
                )}
                {active && cancelAtPeriodEnd && (
                    <button type="button" className={button} disabled={busy !== null} onClick={() => run('undo_cancel', 'Keep this membership running?')}>
                        {busy === 'undo_cancel' ? 'Working…' : 'Keep my membership'}
                    </button>
                )}
                {staff && ['PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE'].includes(status) && (
                    <button
                        type="button"
                        className={`${button} border-red-300 text-red-700`}
                        disabled={busy !== null}
                        onClick={() => run('cancel_now', 'Cancel this membership right now? This does not refund anything.')}
                    >
                        {busy === 'cancel_now' ? 'Cancelling…' : 'Cancel now'}
                    </button>
                )}
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
    )
}