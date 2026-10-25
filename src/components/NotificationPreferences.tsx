'use client'

import { useState } from 'react'
import { apiFetch, errorMessage } from '@/lib/api-client'

export function NotificationPreferences({ initial, hasPhone }: { initial: boolean; hasPhone: boolean }) {
    const [smsOptIn, setSmsOptIn] = useState(initial)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function change(next: boolean) {
        setBusy(true)
        setError(null)
        try {
            await apiFetch('/api/notifications/preferences', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smsOptIn: next }),
            })
            setSmsOptIn(next)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="mt-4 rounded-lg border border-neutral-300 p-4">
            <label className="flex items-start gap-3">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={smsOptIn}
                    disabled={busy || (!hasPhone && !smsOptIn)}
                    onChange={(e) => change(e.target.checked)}
                />
                <span>
                    <span className="font-medium">Text me about payments and renewals</span>
                    <span className="block text-sm text-neutral-600">
                        Message and data rates may apply. Reply STOP to any text to opt out. Emails are always sent.
                    </span>
                </span>
            </label>
            {!hasPhone && !smsOptIn && (
                <p className="mt-2 text-sm text-neutral-600">Add a mobile number to your profile to turn this on.</p>
            )}
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
    )
}