import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getGym } from '@/lib/classes'
import { requirePageRole } from '@/lib/guards'
import { can, STAFF_ROLES } from '@/lib/permissions'
import { bookingListQuerySchema, listBookings } from '@/lib/booking-list'
import { BookingsTable, type BookingRow } from '@/components/BookingsTable'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function AdminBookingsPage({ searchParams }: { searchParams: SearchParams }) {
    const session = await requirePageRole(STAFF_ROLES, '/admin/bookings')
    const { role, id: userId } = session.user

    const raw = await searchParams
    const parsed = bookingListQuerySchema.safeParse({
        page: first(raw.page),
        q: first(raw.q),
        status: first(raw.status),
        classId: first(raw.classId),
        when: first(raw.when),
        sort: first(raw.sort),
        dir: first(raw.dir),
    })
    // Garbage in the URL falls back to the defaults instead of crashing.
    const query = parsed.success ? parsed.data : bookingListQuerySchema.parse({})

    const hrefFor = (page: number) => {
        const p = new URLSearchParams()
        if (query.q) p.set('q', query.q)
        if (query.status) p.set('status', query.status)
        if (query.classId) p.set('classId', query.classId)
        if (query.when !== 'upcoming') p.set('when', query.when)
        if (query.sort !== 'startsAt') p.set('sort', query.sort)
        if (query.dir !== 'asc') p.set('dir', query.dir)
        if (page > 1) p.set('page', String(page))
        const s = p.toString()
        return s ? `/admin/bookings?${s}` : '/admin/bookings'
    }

    const [gym, result, classes] = await Promise.all([
        getGym(),
        listBookings(query, { role, id: userId }),
        db.gymClass.findMany({
            where: role === 'TRAINER' ? { trainerId: userId } : {},
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        }),
    ])

    if (query.page > result.totalPages) redirect(hrefFor(result.totalPages))

    const now = new Date()
    const rows: BookingRow[] = result.items.map((b) => ({
        id: b.id,
        memberName: b.user.name,
        memberEmail: b.user.email,
        className: b.instance.gymClass.name,
        startsAt: b.instance.startsAt.toISOString(),
        bookedAt: b.createdAt.toISOString(),
        status: b.status,
        canCancel: b.status !== 'CANCELLED' && b.instance.startsAt > now && can.cancelBooking(role, userId, b.userId),
    }))

    const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
    const to = result.total === 0 ? 0 : from + rows.length - 1
    const filtered = Boolean(query.q || query.status || query.classId || query.when !== 'upcoming')
    const field = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2'

    return (
        <main className="mx-auto max-w-5xl p-6">
            <h1 className="text-3xl font-bold">Bookings</h1>
            {role === 'TRAINER' && (
                <p className="mt-1 text-sm text-neutral-600">You see bookings for your own classes.</p>
            )}

            <form action="/admin/bookings" method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                {/* Keep the current sort when filtering */}
                <input type="hidden" name="sort" value={query.sort} />
                <input type="hidden" name="dir" value={query.dir} />

                <div className="lg:col-span-2">
                    <label htmlFor="q" className="block text-sm font-medium">Member</label>
                    <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="Name or email" className={field} />
                </div>
                <div>
                    <label htmlFor="classId" className="block text-sm font-medium">Class</label>
                    <select id="classId" name="classId" defaultValue={query.classId ?? ''} className={field}>
                        <option value="">All classes</option>
                        {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="status" className="block text-sm font-medium">Status</label>
                    <select id="status" name="status" defaultValue={query.status ?? ''} className={field}>
                        <option value="">Any status</option>
                        <option value="BOOKED">Booked</option>
                        <option value="WAITLISTED">Waitlisted</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="when" className="block text-sm font-medium">When</label>
                    <select id="when" name="when" defaultValue={query.when} className={field}>
                        <option value="upcoming">Upcoming</option>
                        <option value="past">Past</option>
                        <option value="all">All</option>
                    </select>
                </div>
                <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                    <button type="submit" className="rounded bg-black px-4 py-2 font-semibold text-white">Apply</button>
                    {filtered && (
                        <Link href="/admin/bookings" className="rounded border px-4 py-2">Clear</Link>
                    )}
                </div>
            </form>

            <p className="mt-4 text-sm text-neutral-600" aria-live="polite">
                {result.total === 0 ? 'No bookings' : `Showing ${from}-${to} of ${result.total}`} · times are {gym.timeZone}
            </p>

            {rows.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
                    <p className="font-medium">{filtered ? 'No bookings match these filters' : 'No upcoming bookings'}</p>
                </div>
            ) : (
                <BookingsTable rows={rows} timeZone={gym.timeZone} sort={query.sort} dir={query.dir} />
            )}

            {result.totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                    {result.page > 1 ? (
                        <Link href={hrefFor(result.page - 1)} className="rounded border px-4 py-2">Previous</Link>
                    ) : (
                        <span className="rounded border px-4 py-2 text-neutral-400" aria-disabled="true">Previous</span>
                    )}
                    <span className="text-sm text-neutral-600">Page {result.page} of {result.totalPages}</span>
                    {result.page < result.totalPages ? (
                        <Link href={hrefFor(result.page + 1)} className="rounded border px-4 py-2">Next</Link>
                    ) : (
                        <span className="rounded border px-4 py-2 text-neutral-400" aria-disabled="true">Next</span>
                    )}
                </nav>
            )}
        </main>
    )
}