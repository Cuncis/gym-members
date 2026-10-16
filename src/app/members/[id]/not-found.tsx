import Link from 'next/link'

export default function MemberNotFound() {
    return (
        <main className="mx-auto max-w-2xl p-6 text-center">
            <h1 className="text-2xl font-bold">Member not found</h1>
            <p className="mt-2 text-neutral-600">This member does not exist or was deleted.</p>
            <Link href="/members" className="mt-6 inline-block rounded border px-4 py-2">
                Back to members
            </Link>
        </main>
    )
}