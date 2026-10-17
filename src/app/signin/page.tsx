import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, googleEnabled } from '@/lib/auth'
import { safeRedirect } from '@/lib/redirect'
import { SignInForm } from '@/components/SignInForm'
import { signInWithGoogle } from './actions'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

const errorMessages: Record<string, string> = {
    OAuthAccountNotLinked: 'This email already has an account with a password. Sign in with your password instead.',
    AccessDenied: 'Sign-in was not allowed for this account.',
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
    return (
        <Suspense fallback={<main className="mx-auto max-w-md p-6" />}>
            <SignInContent searchParams={searchParams} />
        </Suspense>
    )
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
    const raw = await searchParams
    const callbackUrl = safeRedirect(first(raw.callbackUrl))
    const errorCode = first(raw.error)

    const session = await auth()
    if (session) redirect(callbackUrl)

    return (
        <main className="mx-auto max-w-md p-6">
            <h1 className="text-3xl font-bold">Sign in</h1>

            {errorCode && (
                <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {errorMessages[errorCode] ?? 'Sign-in failed. Please try again.'}
                </p>
            )}

            <SignInForm callbackUrl={callbackUrl} />

            {googleEnabled && (
                <form action={signInWithGoogle} className="mt-4">
                    <input type="hidden" name="callbackUrl" value={callbackUrl} />
                    <button type="submit" className="w-full rounded border border-neutral-300 px-4 py-2 font-semibold">
                        Continue with Google
                    </button>
                </form>
            )}

            <p className="mt-6 text-sm">
                <Link href="/forgot-password" className="underline">Forgot your password?</Link>
            </p>

            <p className="mt-2 text-sm text-neutral-600">
                No account yet?{' '}
                <Link href="/signup" className="font-medium underline">
                    Create one
                </Link>
            </p>
        </main>
    )
}