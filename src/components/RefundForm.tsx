'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { centsToDecimal, parseMoneyToCents } from '@/lib/billing-core'

type Props = { paymentId: string; remainingCents: number }

export function RefundForm({ paymentId, remainingCents }: Props) {
    const router = useRouter()
    const [amount, setAmount] = useState(centsToDecimal(remainingCents))
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function submit(event: FormEvent) {
        event.preventDefault()
        setError(null)

        const cents = parseMoneyToCents(amount)
        if (cents === null || cents < 1) {
            setError('Enter an amount like 10.00')
            return
        }
        if (cents > remainingCents) {
            setError(`At most ${centsToDecimal(remainingCents)} can still be refunded`)
            return
        }
        if (!window.confirm(`Refund ${centsToDecimal(cents)}? This cannot be undone.`)) return

        setBusy(true)
        try {
            await apiFetch(`/api/payments/${paymentId}/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amountCents: cents, reason: reason.trim() || undefined }),
            })
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    const field = 'rounded border border-neutral-300 px-2 py-1 text-sm'

    return (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
            <div>
                <label htmlFor={`amount-${paymentId}`} className="block text-xs font-medium">Refund amount</label>
                <input
                    id={`amount-${paymentId}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    className={`${field} w-24`}
                />
            </div>
            <div>
                <label htmlFor={`reason-${paymentId}`} className="block text-xs font-medium">Reason (optional)</label>
                <input
                    id={`reason-${paymentId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    className={`${field} w-48`}
                />
            </div>
            <button type="submit" disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-60">
                {busy ? 'Refunding…' : 'Refund'}
            </button>
            {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
        </form>
    )
}