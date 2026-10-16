import { Suspense } from 'react'
import { db } from '@/lib/db'

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Suspense fallback={<p>Loading members…</p>}>
        <Members />
      </Suspense>
    </main>
  )
}

async function Members() {
  const members = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { memberships: true },
  })

  return (
    <>
      <h1 className="text-3xl font-bold">Members ({members.length})</h1>
      <ul className="mt-6 space-y-3">
        {members.map((m) => (
          <li key={m.id} className="rounded-lg border border-neutral-300 p-4">
            <p className="font-semibold">{m.name}</p>
            <p className="text-sm text-neutral-600">
              {m.email} · {m.status} · {m.memberships.length} membership(s)
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
