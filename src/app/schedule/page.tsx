import { db } from '@/lib/db'
import { calendarUrl } from '@/lib/calendar'
import { getGym } from '@/lib/classes'
import { requireSignedIn } from '@/lib/guards'
import { getScheduleWeek } from '@/lib/schedule'
import { parseWeek } from '@/lib/schedule-shared'
import { CalendarLink } from '@/components/CalendarLink'
import { ScheduleView } from '@/components/ScheduleView'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
    const week = parseWeek(first((await searchParams).week))

    const session = await requireSignedIn(week === 0 ? '/schedule' : `/schedule?week=${week}`)
    const userId = session.user.id

    const [gym, initial, user] = await Promise.all([
        getGym(),
        getScheduleWeek(userId, week),
        db.user.findUnique({ where: { id: userId }, select: { calendarToken: true } }),
    ])

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">Schedule</h1>
            <p className="mt-1 text-sm text-neutral-600">All times are {gym.timeZone} time.</p>

            <CalendarLink initialUrl={user?.calendarToken ? calendarUrl(user.calendarToken) : null} />

            <ScheduleView initialWeek={week} initial={initial} />
        </main>
    )
}