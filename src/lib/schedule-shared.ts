export const MAX_WEEK = 12

export type SessionDto = {
    id: string
    dayKey: string
    className: string
    trainerName: string | null
    startsAt: string // dates travel as ISO text, never as Date objects
    endsAt: string
    capacity: number
    booked: number
    waiting: number
    past: boolean
    mine: { bookingId: string; status: 'BOOKED' | 'WAITLISTED'; position: number | null } | null
}

export type WeekDto = {
    week: number
    timeZone: string
    rangeLabel: string
    days: { key: string; label: string }[]
    sessions: SessionDto[]
    myUpcoming: { id: string; className: string; startsAt: string; status: 'BOOKED' | 'WAITLISTED' }[]
    generatedAt: string
}

// '?week=abc' and '?week=99' fall back to something safe instead of crashing.
export function parseWeek(value: string | null | undefined): number {
    const n = Number(value)
    return Number.isInteger(n) ? Math.min(Math.max(n, 0), MAX_WEEK) : 0
}