'use client'

import { useState, type FormEvent } from 'react'

export function ForgotPasswordForm() {
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setSubmitting(true)

        const email = String(new FormData(event.currentTarget).get('email') ?? '')
        try {
            const res = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const json = await res.json().catch(() => null)

            if (res.ok) setMessage(json?.message ?? 'Check your email for a reset link.')
            else setError(json?.fieldErrors?.email?.[0] ?? 'Something went wrong. Please try again.')
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setSubmitting(false)
        }
    }

    if (message) {
        return (
            <p role="status" className="mt-6 rounded border border-green-300 bg-green-50 p-4 text-green-800">
                {message}
            </p>
        )
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div>
                <label htmlFor="email" className="block font-medium">Email</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
                />
            </div>
            <button
                type="submit"
                disabled={submitting}
                className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {submitting ? 'Sending…' : 'Send reset link'}
            </button>
        </form>
    )
}