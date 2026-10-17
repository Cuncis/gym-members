import { describe, expect, it } from 'vitest'
import { dateKey, upcomingStarts, weekBounds, zonedTimeToUtc } from './time'

const iso = (dates: Date[]) => dates.map((d) => d.toISOString())

describe('zonedTimeToUtc', () => {
    it('converts Jakarta time (UTC+7, no daylight saving)', () => {
        expect(zonedTimeToUtc(2026, 10, 17, 18, 30, 'Asia/Jakarta').toISOString()).toBe('2026-10-17T11:30:00.000Z')
    })

    it('follows daylight saving in New York', () => {
        expect(zonedTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z')
        expect(zonedTimeToUtc(2026, 1, 15, 9, 0, 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z')
    })
})

describe('upcomingStarts', () => {
    const base = { dayOfWeek: 6, startTime: '18:30', timeZone: 'Asia/Jakarta', weeks: 3 }

    it('lists the next Saturdays at 18:30 Jakarta time', () => {
        // Friday 16 October 2026, 13:03 in Jakarta
        const now = new Date('2026-10-16T06:03:00Z')
        expect(iso(upcomingStarts({ ...base, now }))).toEqual([
            '2026-10-17T11:30:00.000Z',
            '2026-10-24T11:30:00.000Z',
            '2026-10-31T11:30:00.000Z',
        ])
    })

    it('skips today when the class already started', () => {
        // Saturday 17 October, 19:00 in Jakarta: 18:30 has passed
        const now = new Date('2026-10-17T12:00:00Z')
        expect(iso(upcomingStarts({ ...base, now }))[0]).toBe('2026-10-24T11:30:00.000Z')
    })

    it('uses the gym date, not the UTC date', () => {
        // 18:00 UTC on Friday 16 October is already 01:00 on Saturday 17 October in Jakarta
        const now = new Date('2026-10-16T18:00:00Z')
        expect(iso(upcomingStarts({ ...base, now }))[0]).toBe('2026-10-17T11:30:00.000Z')
    })
})

describe('dateKey', () => {
    it('gives the date as the gym sees it', () => {
        // 18:00 UTC on Friday 16 October is already Saturday 17 October in Jakarta
        expect(dateKey(new Date('2026-10-16T18:00:00Z'), 'Asia/Jakarta')).toBe('2026-10-17')
    })
})

describe('weekBounds', () => {
    const tz = 'Asia/Jakarta'
    const now = new Date('2026-10-17T02:11:00Z') // Saturday 17 October, 09:11 in Jakarta

    it('runs Monday 00:00 to the next Monday 00:00 at the gym', () => {
        const w = weekBounds(0, now, tz)
        expect(w.start.toISOString()).toBe('2026-10-11T17:00:00.000Z')
        expect(w.end.toISOString()).toBe('2026-10-18T17:00:00.000Z')
        expect(w.days.map((d) => d.key)).toEqual([
            '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
        ])
    })

    it('moves by whole weeks', () => {
        expect(weekBounds(1, now, tz).start.toISOString()).toBe('2026-10-18T17:00:00.000Z')
    })

    it('uses the gym date to pick the week', () => {
        // 18:00 UTC on Sunday 18 October is already Monday 19 October in Jakarta
        const lateSunday = new Date('2026-10-18T18:00:00Z')
        expect(weekBounds(0, lateSunday, tz).days[0].key).toBe('2026-10-19')
    })
})