'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
    instanceId: string
    bookingId: string | null
    status: 'BOOKED' | 'WAITLISTED' | null
    full: boolean
    past: boolean
}

export function BookingButton({ instanceId, bookingId, status, full, past }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function run(request: () => Promise<Response>) {
        setBusy(true)
        setError(null)
        try {
            const res = await request()
            if (res.ok) {
                router.refresh()
                return
            }
            const json = await res.json().catch(() => null)
            setError(json?.error ?? 'Something went wrong. Please try again.')
            // A 409 means the page was out of date (for example, the last spot just went), so reload it.
            if (res.status === 409) router.refresh()
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setBusy(false)
        }
    }

    const book = () =>
        run(() =>
            fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId }),
            }),
        )

    const cancel = () => {
        if (!window.confirm('Cancel this booking?')) return
        run(() => fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' }))
    }

    if (past) return <span className="text-sm text-neutral-500">Closed</span>

    return (
        <div className="flex flex-col items-end gap-1">
            {status ? (
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        {status === 'BOOKED' ? "You're booked" : 'On waitlist'}
                    </span>
                    <button type="button" onClick={cancel} disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-60">
                        {busy ? 'Cancelling…' : 'Cancel'}
                    </button>
                </div>
            ) : full ? (
                <button type="button" disabled className="rounded border px-3 py-1 text-sm text-neutral-500">
                    Full
                </button>
            ) : (
                <button
                    type="button"
                    onClick={book}
                    disabled={busy}
                    className="rounded bg-black px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
                >
                    {busy ? 'Booking…' : 'Book'}
                </button>
            )}
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
    )
}