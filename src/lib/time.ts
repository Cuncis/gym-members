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