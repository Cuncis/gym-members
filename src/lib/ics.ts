export type IcsEvent = {
    uid: string
    summary: string
    description?: string
    location?: string
    start: Date
    end: Date
    status: 'CONFIRMED' | 'TENTATIVE'
}

const CRLF = '\r\n'

export function escapeText(value: string): string {
    return value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control characters, but keep tab and newline
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n') // a real newline would let a name inject extra calendar lines
}

// Lines may not exceed 75 bytes. Longer ones continue on the next line after one space.
export function foldLine(line: string): string {
    const encoder = new TextEncoder()
    const parts: string[] = []
    let current = ''
    let bytes = 0
    let limit = 75

    for (const char of line) {
        // `for...of` walks whole characters, so a multi-byte letter is never cut in half.
        const size = encoder.encode(char).length
        if (bytes + size > limit) {
            parts.push(current)
            current = ''
            bytes = 0
            limit = 74 // the leading space on a continuation line counts too
        }
        current += char
        bytes += size
    }
    parts.push(current)
    return parts.join(CRLF + ' ')
}

// 2026-10-17T11:30:00.000Z -> 20261017T113000Z
export function formatUtc(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Gym Members Practice//Bookings//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(name)}`,
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ]

    for (const event of events) {
        lines.push(
            'BEGIN:VEVENT',
            `UID:${event.uid}`, // the same booking always has the same UID, so calendars update it instead of duplicating it
            `DTSTAMP:${formatUtc(now)}`,
            `DTSTART:${formatUtc(event.start)}`, // UTC, which is how sessions are stored, so no time zone block is needed
            `DTEND:${formatUtc(event.end)}`,
            `SUMMARY:${escapeText(event.summary)}`,
        )
        if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
        if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
        lines.push(`STATUS:${event.status}`, 'TRANSP:OPAQUE', 'END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    return lines.map(foldLine).join(CRLF) + CRLF
}