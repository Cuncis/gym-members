'use client'

import { useActionState } from 'react'
import { signInWithCredentials, type SignInState } from '@/app/signin/actions'

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
    const [state, formAction, pending] = useActionState<SignInState, FormData>(signInWithCredentials, {})
    const input = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2'

    return (
        <form action={formAction} className="mt-6 space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />

            {state.error && (
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {state.error}
                </p>
            )}

            <div>
                <label htmlFor="email" className="block font-medium">Email</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={state.email ?? ''}
                    className={input}
                />
            </div>

            <div>
                <label htmlFor="password" className="block font-medium">Password</label>
                <input id="password" name="password" type="password" required autoComplete="current-password" className={input} />
            </div>

            <button
                type="submit"
                disabled={pending}
                className="w-full rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {pending ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    )
}