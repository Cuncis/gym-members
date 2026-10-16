import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm'

export default function ForgotPasswordPage() {
    return (
        <main className="mx-auto max-w-md p-6">
            <h1 className="text-3xl font-bold">Forgot your password?</h1>
            <p className="mt-2 text-sm text-neutral-600">
                Enter your email and we will send you a link to choose a new one.
            </p>
            <ForgotPasswordForm />
            <p className="mt-6 text-sm">
                <Link href="/signin" className="underline">Back to sign in</Link>
            </p>
        </main>
    )
}