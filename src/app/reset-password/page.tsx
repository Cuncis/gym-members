import { Suspense } from 'react'
import Link from 'next/link'
import { ResetPasswordForm } from '@/components/ResetPasswordForm'

// Do not send this page's address (which contains the token) to other sites in the Referer header.
export const metadata = { referrer: 'no-referrer' as const }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function ResetPasswordPage(props: { searchParams: SearchParams }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content {...props} />
        </Suspense>
    )
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
    const raw = (await searchParams).token
    const token = Array.isArray(raw) ? raw[0] : raw

    return (
        <main className="mx-auto max-w-md p-6">
            <h1 className="text-3xl font-bold">Choose a new password</h1>
            {token ? (
                <ResetPasswordForm token={token} />
            ) : (
                <p role="alert" className="mt-6 text-red-600">
                    This link is incomplete. <Link href="/forgot-password" className="underline">Request a new one</Link>.
                </p>
            )}
        </main>
    )
}