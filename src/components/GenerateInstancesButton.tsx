'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateInstancesButton({ classId, weeks }: { classId: string; weeks: number }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function generate() {
        setBusy(true)
        setMessage(null)
        setError(null)
        try {
            const res = await fetch(`/api/classes/${classId}/instances`, { method: 'POST' })
            const json = await res.json().catch(() => null)

            if (!res.ok) {
                setError(json?.error ?? 'Something went wrong. Please try again.')
                return
            }
            setMessage(
                json.created === 0
                    ? `No new sessions: the next ${json.requested} already exist.`
                    : `Created ${json.created} new ${json.created === 1 ? 'session' : 'sessions'}.`,
            )
            router.refresh()
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {busy ? 'Generating…' : `Generate next ${weeks} weeks`}
            </button>
            <p aria-live="polite" className="mt-2 text-sm">
                {message && <span className="text-green-700">{message}</span>}
                {error && <span role="alert" className="text-red-600">{error}</span>}
            </p>
        </div>
    )
}