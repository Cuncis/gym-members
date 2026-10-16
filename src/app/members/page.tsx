import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { MemberStatus } from '@prisma/client'
import { listMembers } from '@/lib/members'
import { listQuerySchema, MEMBER_STATUSES, type ListQuery } from '@/lib/validation'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

const badge: Record<MemberStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-red-100 text-red-800',
    LEAD: 'bg-blue-100 text-blue-800',
}

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
    const raw = await searchParams
    const parsed = listQuerySchema.safeParse({
        page: first(raw.page),
        q: first(raw.q),
        status: first(raw.status),
    })
    // Garbage in the URL (like ?page=abc) falls back to the defaults instead of crashing.
    const query: ListQuery = parsed.success ? parsed.data : { page: 1 }

    const hrefFor = (page: number) => {
        const p = new URLSearchParams()
        if (query.q) p.set('q', query.q)
        if (query.status) p.set('status', query.status)
        if (page > 1) p.set('page', String(page))
        const s = p.toString()
        return s ? `/members?${s}` : '/members'
    }

    const result = await listMembers(query)

    // Asked for a page past the end (for example ?page=99): go to the last real page.
    if (query.page > result.totalPages) redirect(hrefFor(result.totalPages))

    const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
    const to = result.total === 0 ? 0 : from + result.items.length - 1
    const filtered = Boolean(query.q || query.status)

    const field = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2'

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">Members</h1>

            <form action="/members" method="get" className="mt-6 flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                    <label htmlFor="q" className="block text-sm font-medium">Search</label>
                    <input
                        id="q"
                        name="q"
                        type="search"
                        defaultValue={query.q ?? ''}
                        placeholder="Name or email"
                        className={field}
                    />
                </div>
                <div>
                    <label htmlFor="status" className="block text-sm font-medium">Status</label>
                    <select id="status" name="status" defaultValue={query.status ?? ''} className={field}>
                        <option value="">All statuses</option>
                        {MEMBER_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <button type="submit" className="rounded bg-black px-4 py-2 font-semibold text-white">
                    Search
                </button>
                {filtered && (
                    <Link href="/members" className="rounded border px-4 py-2">
                        Clear
                    </Link>
                )}
            </form>

            <p className="mt-4 text-sm text-neutral-600" aria-live="polite">
                {result.total === 0 ? 'No members' : `Showing ${from}-${to} of ${result.total}`}
            </p>

            {result.items.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
                    <p className="font-medium">{filtered ? 'No members match your search' : 'No members yet'}</p>
                    {filtered && <p className="mt-1 text-sm text-neutral-600">Try a different name or status.</p>}
                </div>
            ) : (
                <ul className="mt-4 space-y-3">
                    {result.items.map((m) => (
                        <li key={m.id}>
                            <Link
                                href={`/members/${m.id}`}
                                className="block rounded-lg border border-neutral-300 p-4 hover:border-black"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-semibold">{m.name}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[m.status]}`}>
                                        {m.status}
                                    </span>
                                </div>
                                <p className="text-sm text-neutral-600">
                                    {m.email} · {m._count.memberships}{' '}
                                    {m._count.memberships === 1 ? 'membership' : 'memberships'}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {result.totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                    {result.page > 1 ? (
                        <Link href={hrefFor(result.page - 1)} className="rounded border px-4 py-2">
                            Previous
                        </Link>
                    ) : (
                        <span className="rounded border px-4 py-2 text-neutral-400" aria-disabled="true">
                            Previous
                        </span>
                    )}
                    <span className="text-sm text-neutral-600">
                        Page {result.page} of {result.totalPages}
                    </span>
                    {result.page < result.totalPages ? (
                        <Link href={hrefFor(result.page + 1)} className="rounded border px-4 py-2">
                            Next
                        </Link>
                    ) : (
                        <span className="rounded border px-4 py-2 text-neutral-400" aria-disabled="true">
                            Next
                        </span>
                    )}
                </nav>
            )}
        </main>
    )
}