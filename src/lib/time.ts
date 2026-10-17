export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// How far ahead of UTC a zone is at a given moment, in milliseconds (Jakarta is +7 hours).
function offsetMs(utcMs: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(utcMs))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return wallClockAsUtc - Math.floor(utcMs / 1000) * 1000
}

// "18:30 on 17 October 2026 in Jakarta" -> the exact UTC instant.
export function zonedTimeToUtc(
    year: number,
    month: number, // 1-12
    day: number,
    hour: number,
    minute: number,
    timeZone: string,
): Date {
    const guess = Date.UTC(year, month - 1, day, hour, minute)
    const first = offsetMs(guess, timeZone)
    let utc = guess - first
    // Near a clock change the offset can differ at the real instant, so correct once.
    const second = offsetMs(utc, timeZone)
    if (second !== first) utc = guess - second
    return new Date(utc)
}

// Today's calendar date as the gym sees it (which can differ from the UTC date).
export function localDate(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(date)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    return { year: get('year'), month: get('month'), day: get('day') }
}

// The next `weeks` start times for a weekly class that are still in the future.
export function upcomingStarts(opts: {
    dayOfWeek: number // 1 = Monday ... 7 = Sunday
    startTime: string // "18:30"
    timeZone: string
    weeks: number
    now: Date
}): Date[] {
    const { dayOfWeek, startTime, timeZone, weeks, now } = opts
    const [hour, minute] = startTime.split(':').map(Number)
    const today = localDate(now, timeZone)
    const starts: Date[] = []

    // Date.UTC is used here only as a calendar, to step through days. It is never treated as a clock.
    for (let i = 0; i < weeks * 7 + 7 && starts.length < weeks; i++) {
        const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i))
        const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
        if (isoWeekday !== dayOfWeek) continue

        const startsAt = zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, timeZone)
        if (startsAt.getTime() > now.getTime()) starts.push(startsAt)
    }
    return starts
}

export function formatDateTime(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}

// 'YYYY-MM-DD' for a moment, as the gym sees the date.
export function dateKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

const DAY_MS = 86_400_000

// Monday 00:00 to next Monday 00:00 at the gym, `offsetWeeks` away from the current week.
export function weekBounds(offsetWeeks: number, now: Date, timeZone: string) {
    const today = localDate(now, timeZone)
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day))
    const isoWeekday = base.getUTCDay() === 0 ? 7 : base.getUTCDay()
    const monday = new Date(base.getTime() + (offsetWeeks * 7 - (isoWeekday - 1)) * DAY_MS)

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday.getTime() + i * DAY_MS)
        const year = d.getUTCFullYear()
        const month = d.getUTCMonth() + 1
        const day = d.getUTCDate()
        return { year, month, day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
    })

    const nextMonday = new Date(monday.getTime() + 7 * DAY_MS)
    return {
        start: zonedTimeToUtc(days[0].year, days[0].month, days[0].day, 0, 0, timeZone),
        end: zonedTimeToUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), 0, 0, timeZone),
        days,
    }
}

// A calendar day has no time zone, so format it in UTC to keep the day from shifting.
export function formatCalendarDay(d: { year: number; month: number; day: number }, withWeekday = true): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        ...(withWeekday ? { weekday: 'long' as const } : {}),
        month: 'short',
        day: 'numeric',
    }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)))
}

export function formatTime(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)
}