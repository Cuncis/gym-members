'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
    instanceId: string
    bookingId: string | null
    status: 'BOOKED' | 'WAITLISTED' | null
    position: number | null // place in the queue, only for waitlisted bookings
    full: boolean
    past: boolean
}

export function BookingButton({ instanceId, bookingId, status, position, full, past }: Props) {
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
            // A 409 means the page was out of date, so reload it. A session that just filled now shows "Join waitlist".
            if (res.status === 409) router.refresh()
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setBusy(false)
        }
    }

    const book = (waitlist: boolean) =>
        run(() =>
            fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId, waitlist }),
            }),
        )

    const cancel = () => {
        const question = status === 'WAITLISTED' ? 'Leave the waitlist?' : 'Cancel this booking?'
        if (!window.confirm(question)) return
        run(() => fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' }))
    }

    if (past) return <span className="text-sm text-neutral-500">Closed</span>

    return (
        <div className="flex flex-col items-end gap-1">
            {status ? (
                <div className="flex items-center gap-2">
                    <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${status === 'BOOKED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}
                    >
                        {status === 'BOOKED' ? "You're booked" : `Waitlist #${position ?? '?'}`}
                    </span>
                    <button type="button" onClick={cancel} disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-60">
                        {busy ? 'Working…' : status === 'BOOKED' ? 'Cancel' : 'Leave'}
                    </button>
                </div>
            ) : full ? (
                <button
                    type="button"
                    onClick={() => book(true)}
                    disabled={busy}
                    className="rounded border border-black px-3 py-1 text-sm font-semibold disabled:opacity-60"
                >
                    {busy ? 'Joining…' : 'Join waitlist'}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => book(false)}
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