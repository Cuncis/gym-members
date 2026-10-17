'use client'

import { useState } from 'react'
import {
    QueryClient,
    QueryClientProvider,
    keepPreviousData,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/lib/api-client'
import { MAX_WEEK, type SessionDto, type WeekDto } from '@/lib/schedule-shared'
import { formatDateTime, formatTime } from '@/lib/time'
import { BookingButton } from './BookingButton'

type Props = { initialWeek: number; initial: WeekDto }

const fetchWeek = (week: number) => apiFetch<WeekDto>(`/api/schedule?week=${week}`)

export function ScheduleView(props: Props) {
    // One cache for the page. A real app usually creates this once in the root layout.
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 15_000, // data younger than 15 seconds is not fetched again
                        retry: (failureCount, error) => {
                            // Do not retry "not signed in" or "not found": asking again will not change the answer.
                            if (error instanceof ApiError && error.status < 500) return false
                            return failureCount < 2
                        },
                    },
                },
            }),
    )

    return (
        <QueryClientProvider client={client}>
            <Schedule {...props} />
        </QueryClientProvider>
    )
}

function SessionRow({ s, timeZone }: { s: SessionDto; timeZone: string }) {
    return (
        <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-300 p-3">
            <div>
                <p className="font-semibold">{s.className}</p>
                <p className="text-sm text-neutral-600">
                    {formatTime(new Date(s.startsAt), timeZone)} – {formatTime(new Date(s.endsAt), timeZone)} ·{' '}
                    {s.trainerName ?? 'No trainer'}
                </p>
                <p className="text-sm text-neutral-600">
                    {Math.max(s.capacity - s.booked, 0)} of {s.capacity} spots left
                    {s.waiting > 0 && ` · ${s.waiting} on waitlist`}
                </p>
            </div>
            <BookingButton
                instanceId={s.id}
                bookingId={s.mine?.bookingId ?? null}
                status={s.mine?.status ?? null}
                position={s.mine?.position ?? null}
                full={s.booked >= s.capacity}
                past={s.past}
            />
        </li>
    )
}

function Schedule({ initialWeek, initial }: Props) {
    const queryClient = useQueryClient()
    const [week, setWeek] = useState(initialWeek)

    const query = useQuery({
        queryKey: ['schedule', week],
        queryFn: () => fetchWeek(week),
        // The server already loaded this week, so there is no loading flash on the first view.
        initialData: week === initialWeek ? initial : undefined,
        initialDataUpdatedAt: new Date(initial.generatedAt).getTime(),
        // While another week loads, keep showing the one on screen (dimmed) instead of a blank page.
        placeholderData: keepPreviousData,
        // Spots taken by other people show up without reloading, and refresh when you return to the tab.
        refetchInterval: 30_000,
    })

    const data = query.data

    function goTo(next: number) {
        setWeek(next)
        // Keep the address bookmarkable. replaceState does not add a history entry per week.
        window.history.replaceState(null, '', next === 0 ? '/schedule' : `/schedule?week=${next}`)
    }

    // Hovering or focusing a week button loads that week in the background, so the click feels instant.
    const prefetch = (target: number) => {
        if (target < 0 || target > MAX_WEEK) return
        void queryClient.prefetchQuery({ queryKey: ['schedule', target], queryFn: () => fetchWeek(target) })
    }

    if (!data) {
        return query.isError ? (
            <div role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                Could not load the schedule.{' '}
                <button type="button" onClick={() => void query.refetch()} className="font-medium underline">
                    Try again
                </button>
            </div>
        ) : (
            <p className="mt-6 text-sm text-neutral-600" aria-live="polite">Loading…</p>
        )
    }

    const showingOtherWeek = query.isPlaceholderData
    const sessionsByDay = new Map<string, SessionDto[]>()
    for (const s of data.sessions) sessionsByDay.set(s.dayKey, [...(sessionsByDay.get(s.dayKey) ?? []), s])

    const navButton = 'rounded border px-3 py-1.5 text-sm disabled:text-neutral-400'

    return (
        <div>
            {query.isError && (
                <p role="alert" className="mt-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Could not refresh. Showing the last data we have.{' '}
                    <button type="button" onClick={() => void query.refetch()} className="font-medium underline">
                        Try again
                    </button>
                </p>
            )}

            <section className="mt-6">
                <h2 className="text-xl font-semibold">My bookings</h2>
                {data.myUpcoming.length === 0 ? (
                    <p className="mt-2 text-sm text-neutral-600">You have no upcoming bookings.</p>
                ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                        {data.myUpcoming.map((b) => (
                            <li key={b.id}>
                                <span className="font-medium">{b.className}</span> · {formatDateTime(new Date(b.startsAt), data.timeZone)}
                                {b.status === 'WAITLISTED' && <span className="text-neutral-600"> (waitlist)</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <nav aria-label="Week" className="mt-8 flex items-center justify-between gap-2">
                <button
                    type="button"
                    className={navButton}
                    disabled={week <= 0}
                    onClick={() => goTo(week - 1)}
                    onMouseEnter={() => prefetch(week - 1)}
                    onFocus={() => prefetch(week - 1)}
                >
                    ← Previous week
                </button>
                <h2 className="text-center font-semibold" aria-live="polite">
                    {data.rangeLabel}
                    {week === 0 && <span className="ml-2 text-sm font-normal text-neutral-600">(this week)</span>}
                    {query.isFetching && <span className="ml-2 text-sm font-normal text-neutral-500">Updating…</span>}
                </h2>
                <button
                    type="button"
                    className={navButton}
                    disabled={week >= MAX_WEEK}
                    onClick={() => goTo(week + 1)}
                    onMouseEnter={() => prefetch(week + 1)}
                    onFocus={() => prefetch(week + 1)}
                >
                    Next week →
                </button>
            </nav>

            <div className={`mt-4 space-y-5 ${showingOtherWeek ? 'opacity-60' : ''}`} aria-busy={showingOtherWeek}>
                {data.days.map((day) => {
                    const sessions = sessionsByDay.get(day.key) ?? []
                    return (
                        <section key={day.key}>
                            <h3 className="font-semibold">{day.label}</h3>
                            {sessions.length === 0 ? (
                                <p className="mt-1 text-sm text-neutral-500">No classes</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {sessions.map((s) => (
                                        <SessionRow key={s.id} s={s} timeZone={data.timeZone} />
                                    ))}
                                </ul>
                            )}
                        </section>
                    )
                })}
            </div>
        </div>
    )
}