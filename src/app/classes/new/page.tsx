import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getGym } from '@/lib/classes'
import { requirePageRole } from '@/lib/guards'
import { MANAGER_ROLES, STAFF_ROLES } from '@/lib/permissions'
import { ClassForm } from '@/components/ClassForm'

export default function NewClassPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}

async function Content() {
    const session = await requirePageRole(STAFF_ROLES, '/classes/new')
    const gym = await getGym()

    // Admins and managers pick a trainer; trainers always teach their own classes.
    const trainers = MANAGER_ROLES.includes(session.user.role)
        ? await db.user.findMany({
            where: { role: { in: STAFF_ROLES } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        })
        : null

    return (
        <main className="mx-auto max-w-2xl p-6">
            <Link href="/classes" className="text-sm text-neutral-600 hover:underline">← Back to classes</Link>
            <h1 className="mt-4 text-3xl font-bold">Add class</h1>
            <ClassForm trainers={trainers} timeZone={gym.timeZone} />
        </main>
    )
}