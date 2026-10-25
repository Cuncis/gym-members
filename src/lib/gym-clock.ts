// Time zone helpers. Everything here is pure: give it a date and a zone name, get an answer.
// Dates are stored in UTC. A time zone only matters when a person is going to read the time,
// or when "3 in the morning at the gym" has to be turned into a moment.

const pad = (n: number) => String(n).padStart(2, '0')

export function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone })
        return true
    } catch {
        return false
    }
}

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number }

// The wall-clock reading in that zone at that moment.
export function localParts(date: Date, timeZone: string): LocalParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23', // hours run 0 to 23, so midnight is 0 and never "24"
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

// "2027-03-14": which calendar day it is in that zone.
export function localDateKey(date: Date, timeZone: string): string {
    const p = localParts(date, timeZone)
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

// Decides whether a daily job is due.
// Returns today's date key once the local clock has reached `hour`, and null before that.
// The key doubles as the job's identity: the same key means "already requested today".
// Using "has reached" instead of "is exactly" has two benefits: a missed hour is caught up later
// the same day, and a daylight-saving jump that skips an hour cannot skip the whole job.
export function dailyRunKey(now: Date, timeZone: string, hour: number): string | null {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('hour must be a whole number from 0 to 23')
    if (!isValidTimeZone(timeZone)) throw new Error(`Unknown time zone: ${timeZone}`)
    return localParts(now, timeZone).hour >= hour ? localDateKey(now, timeZone) : null
}

// "Mar 14, 2027", read in the gym's zone.
export function formatInZone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium' }).format(date)
}

// "Mar 14, 2027, 3:00 AM", read in the gym's zone.
export function formatDateTimeInZone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
