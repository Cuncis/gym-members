import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMember } from '@/lib/members'
import { MemberForm } from '@/components/MemberForm'


export default function EditMemberPage(props: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content {...props} />
        </Suspense>
    )
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const member = await getMember(id)
    if (!member) notFound()

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href={`/members/${member.id}`} className="text-sm text-neutral-600 hover:underline">
                ← Back to profile
            </Link>
            <h1 className="mt-4 text-3xl font-bold">Edit {member.name}</h1>
            <MemberForm
                member={{
                    id: member.id,
                    name: member.name,
                    email: member.email,
                    phone: member.phone,
                    status: member.status,
                }}
            />
        </main>
    )
}