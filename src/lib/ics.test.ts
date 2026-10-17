import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, foldLine, formatUtc } from './ics'

const bytes = (s: string) => new TextEncoder().encode(s).length
const unfold = (s: string) => s.replace(/\r\n /g, '')

describe('escapeText', () => {
    it('escapes commas, semicolons, backslashes and newlines', () => {
        expect(escapeText('Core, Abs; Stretch')).toBe('Core\\, Abs\\; Stretch')
        expect(escapeText('a\\b')).toBe('a\\\\b')
        expect(escapeText('line1\nline2')).toBe('line1\\nline2')
    })

    it('cannot be used to inject extra calendar lines', () => {
        const result = escapeText('Evil\r\nBEGIN:VEVENT')
        expect(result).not.toMatch(/[\r\n]/)
        expect(result).toBe('Evil\\nBEGIN:VEVENT')
    })
})

describe('foldLine', () => {
    it('leaves short lines alone', () => {
        expect(foldLine('SUMMARY:Yoga')).toBe('SUMMARY:Yoga')
    })

    it('folds long lines to at most 75 bytes and loses nothing', () => {
        const line = 'DESCRIPTION:' + 'a'.repeat(200)
        const folded = foldLine(line)
        for (const physical of folded.split('\r\n')) expect(bytes(physical)).toBeLessThanOrEqual(75)
        expect(unfold(folded)).toBe(line)
    })

    it('never splits a multi-byte character', () => {
        const line = 'SUMMARY:' + '日本語'.repeat(40)
        const folded = foldLine(line)
        for (const physical of folded.split('\r\n')) expect(bytes(physical)).toBeLessThanOrEqual(75)
        expect(unfold(folded)).toBe(line)
    })
})

describe('formatUtc', () => {
    it('uses the compact UTC format', () => {
        expect(formatUtc(new Date('2026-10-17T11:30:00.000Z'))).toBe('20261017T113000Z')
    })
})

describe('buildCalendar', () => {
    const event = {
        uid: 'booking-1@gym-members.local',
        summary: 'Core, Abs; Stretch',
        description: 'Trainer: Tina',
        start: new Date('2026-10-17T11:30:00Z'),
        end: new Date('2026-10-17T12:30:00Z'),
        status: 'CONFIRMED' as const,
    }
    const output = buildCalendar('My bookings', [event], new Date('2026-10-17T00:00:00Z'))

    it('ends every line with CRLF and never uses a bare newline', () => {
        expect(output.endsWith('\r\n')).toBe(true)
        expect(output).not.toMatch(/(?<!\r)\n/)
    })

    it('has the required structure and escaped text', () => {
        expect(output).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0')
        expect(output).toContain('DTSTART:20261017T113000Z')
        expect(output).toContain('DTEND:20261017T123000Z')
        expect(output).toContain('SUMMARY:Core\\, Abs\\; Stretch')
        expect(output).toContain('STATUS:CONFIRMED')
        expect(output.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    })

    it('is valid with no events', () => {
        const empty = buildCalendar('My bookings', [])
        expect(empty).toContain('BEGIN:VCALENDAR')
        expect(empty).not.toContain('BEGIN:VEVENT')
    })
})