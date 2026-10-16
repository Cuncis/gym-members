'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

export function ResetPasswordForm({ token }: { token: string }) {
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setSubmitting(true)

        const password = String(new FormData(event.currentTarget).get('password') ?? '')
        try {
            const res = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            })
            const json = await res.json().catch(() => null)

            if (res.ok) setDone(true)
            else setError(json?.fieldErrors?.password?.[0] ?? json?.error ?? 'Something went wrong. Please try again.')
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setSubmitting(false)
        }
    }

    if (done) {
        return (
            <p role="status" className="mt-6 rounded border border-green-300 bg-green-50 p-4 text-green-800">
                Your password was changed. <Link href="/signin" className="font-medium underline">Sign in</Link>
            </p>
        )
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div>
                <label htmlFor="password" className="block font-medium">New password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
                />
            </div>
            <button
                type="submit"
                disabled={submitting}
                className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {submitting ? 'Saving…' : 'Change password'}
            </button>
        </form>
    )
}