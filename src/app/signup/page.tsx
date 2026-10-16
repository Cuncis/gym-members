import { SignUpForm } from '@/components/SignUpForm'

export default function SignUpPage() {
    return (
        <main className="mx-auto max-w-md p-6">
            <h1 className="text-3xl font-bold">Create an account</h1>
            <SignUpForm />
        </main>
    )
}