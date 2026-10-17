'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, errorMessage } from '@/lib/api-client'

type Props = {
    instanceId: string
    bookingId: string | null
    status: 'BOOKED' | 'WAITLISTED' | null
    position: number | null // place in the queue, only for waitlisted bookings
    full: boolean
    past: boolean
}

export function BookingButton({ instanceId, bookingId, status, position, full, past }: Props) {
    const queryClient = useQueryClient()

    // Success or failure, reload the schedule: a 409 usually means someone just took the last spot.
    // Returning the promise keeps the button busy until the fresh data has arrived.
    const reload = () => queryClient.invalidateQueries({ queryKey: ['schedule'] })

    const book = useMutation({
        mutationFn: (waitlist: boolean) =>
            apiFetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instanceId, waitlist }),
            }),
        onSettled: reload,
    })

    const cancel = useMutation({
        mutationFn: () => apiFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' }),
        onSettled: reload,
    })

    const busy = book.isPending || cancel.isPending
    const failure = book.error ?? cancel.error

    const doBook = (waitlist: boolean) => {
        cancel.reset()
        book.mutate(waitlist)
    }

    const doCancel = () => {
        const question = status === 'WAITLISTED' ? 'Leave the waitlist?' : 'Cancel this booking?'
        if (!window.confirm(question)) return
        book.reset()
        cancel.mutate()
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
                    <button type="button" onClick={doCancel} disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-60">
                        {cancel.isPending ? 'Working…' : status === 'BOOKED' ? 'Cancel' : 'Leave'}
                    </button>
                </div>
            ) : full ? (
                <button
                    type="button"
                    onClick={() => doBook(true)}
                    disabled={busy}
                    className="rounded border border-black px-3 py-1 text-sm font-semibold disabled:opacity-60"
                >
                    {busy ? 'Joining…' : 'Join waitlist'}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => doBook(false)}
                    disabled={busy}
                    className="rounded bg-black px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
                >
                    {busy ? 'Booking…' : 'Book'}
                </button>
            )}
            {failure && <p role="alert" className="text-xs text-red-600">{errorMessage(failure)}</p>}
        </div>
    )
}