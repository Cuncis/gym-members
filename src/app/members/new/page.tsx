import { Suspense } from 'react'
import Link from 'next/link'
import { requirePageRole } from '@/lib/guards'
import { MANAGER_ROLES } from '@/lib/permissions'
import { MemberForm } from '@/components/MemberForm'

export default function NewMemberPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}

async function Content() {
    await requirePageRole(MANAGER_ROLES, '/members/new')

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href="/members" className="text-sm text-neutral-600 hover:underline">
                ← Back to members
            </Link>
            <h1 className="mt-4 text-3xl font-bold">Add member</h1>
            <MemberForm />
        </main>
    )
}