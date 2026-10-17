'use client'

import { useState } from 'react'
import { apiFetch, errorMessage } from '@/lib/api-client'

export function CalendarLink({ initialUrl }: { initialUrl: string | null }) {
    const [url, setUrl] = useState(initialUrl)
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function create() {
        if (url && !window.confirm('Create a new link? The old link will stop working in every calendar that uses it.')) return
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
            const json = await apiFetch<{ url: string }>('/api/calendar-token', { method: 'POST' })
            setUrl(json.url)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    async function turnOff() {
        if (!window.confirm('Turn off the link? Calendars using it will stop updating.')) return
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
            await apiFetch('/api/calendar-token', { method: 'DELETE' })
            setUrl(null)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    async function copy() {
        if (!url) return
        try {
            await navigator.clipboard.writeText(url)
            setNotice('Copied')
        } catch {
            setNotice('Select the link and copy it by hand')
        }
    }

    return (
        <details className="mt-6 rounded-lg border border-neutral-300 p-4">
            <summary className="cursor-pointer font-semibold">Add to your calendar</summary>

            <p className="mt-3 text-sm text-neutral-600">
                Your calendar app can follow this link and keep your bookings up to date. Anyone with the link can see your
                bookings, so do not share it. Create a new link to cancel the old one.
            </p>

            {url ? (
                <div className="mt-3 space-y-3">
                    <input
                        readOnly
                        value={url}
                        aria-label="Calendar link"
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={copy} className="rounded border px-3 py-1.5 text-sm">Copy link</button>
                        <a href={url.replace(/^https?:/, 'webcal:')} className="rounded border px-3 py-1.5 text-sm">
                            Open in calendar app
                        </a>
                        <button type="button" onClick={create} disabled={busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-60">
                            New link
                        </button>
                        <button
                            type="button"
                            onClick={turnOff}
                            disabled={busy}
                            className="rounded border px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                        >
                            Turn off
                        </button>
                        <span aria-live="polite" className="text-sm text-green-700">{notice}</span>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={create}
                    disabled={busy}
                    className="mt-3 rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                    {busy ? 'Creating…' : 'Create calendar link'}
                </button>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        </details>
    )
}