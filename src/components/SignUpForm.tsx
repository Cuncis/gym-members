'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string[]>>

export function SignUpForm() {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    const turnstileRef = useRef<TurnstileInstance>(null)
    const [token, setToken] = useState<string | null>(null)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [formError, setFormError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setErrors({})
        setFormError(null)
        setSubmitting(true)

        const data = new FormData(event.currentTarget)
        const payload = {
            name: String(data.get('name') ?? ''),
            email: String(data.get('email') ?? ''),
            password: String(data.get('password') ?? ''),
            turnstileToken: token,
        }

        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const json = await res.json().catch(() => null)

            if (res.ok) {
                setDone(true)
                return
            }
            setErrors(json?.fieldErrors ?? {})
            setFormError(json?.fieldErrors ? null : (json?.error ?? 'Something went wrong. Please try again.'))
        } catch {
            setFormError('Could not reach the server. Check your connection and try again.')
        } finally {
            // A Turnstile token works once, so every attempt needs a fresh one.
            turnstileRef.current?.reset()
            setToken(null)
            setSubmitting(false)
        }
    }

    if (done) {
        return (
            <p role="status" className="mt-6 rounded border border-green-300 bg-green-50 p-4 text-green-800">
                Account created. <a href="/signin" className="font-medium underline">Sign in</a> to continue.
            </p>
        )
    }

    const input = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2'
    const err = (m?: string[]) =>
        m?.length ? <p role="alert" className="mt-1 text-sm text-red-600">{m[0]}</p> : null

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {formError && (
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {formError}
                </p>
            )}
            <div>
                <label htmlFor="name" className="block font-medium">Name</label>
                <input id="name" name="name" autoComplete="name" className={input} aria-invalid={!!errors.name} />
                {err(errors.name)}
            </div>
            <div>
                <label htmlFor="email" className="block font-medium">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" className={input} aria-invalid={!!errors.email} />
                {err(errors.email)}
            </div>
            <div>
                <label htmlFor="password" className="block font-medium">Password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    className={input}
                    aria-invalid={!!errors.password}
                />
                {err(errors.password)}
            </div>

            {siteKey ? (
                <Turnstile
                    ref={turnstileRef}
                    siteKey={siteKey}
                    onSuccess={setToken}
                    onExpire={() => setToken(null)}
                    onError={() => setToken(null)}
                />
            ) : (
                <p role="alert" className="text-sm text-red-600">Bot check is not configured (NEXT_PUBLIC_TURNSTILE_SITE_KEY).</p>
            )}

            <button
                type="submit"
                disabled={submitting || !token}
                className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {submitting ? 'Creating account…' : 'Create account'}
            </button>
        </form>
    )
}