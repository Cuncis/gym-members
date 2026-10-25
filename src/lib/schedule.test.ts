import { describe, expect, it } from 'vitest'
import { dailyRunKey, formatDateTimeInZone, formatInZone, isValidTimeZone, localDateKey, localParts } from './gym-clock'

const d = (iso: string) => new Date(iso)

describe('time zone names', () => {
    it('accepts real IANA names and rejects nonsense', () => {
        expect(isValidTimeZone('America/New_York')).toBe(true)
        expect(isValidTimeZone('Asia/Bangkok')).toBe(true)
        expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
        expect(isValidTimeZone('')).toBe(false)
    })
})

describe('local time', () => {
    it('reads the wall clock in winter and summer (New York is UTC-5, then UTC-4)', () => {
        expect(localParts(d('2027-01-15T08:00:00Z'), 'America/New_York')).toMatchObject({ hour: 3, minute: 0, day: 15 })
        expect(localParts(d('2027-07-15T07:00:00Z'), 'America/New_York')).toMatchObject({ hour: 3, minute: 0, day: 15 })
    })

    it('shows midnight as hour 0, never 24', () => {
        expect(localParts(d('2027-01-15T05:00:00Z'), 'America/New_York').hour).toBe(0)
    })

    it('moves to the next calendar day for zones ahead of UTC', () => {
        // 20:00 UTC on the 15th is already 03:00 on the 16th in Bangkok (UTC+7).
        expect(localDateKey(d('2027-01-15T20:00:00Z'), 'Asia/Bangkok')).toBe('2027-01-16')
        expect(localDateKey(d('2027-01-15T20:00:00Z'), 'America/Los_Angeles')).toBe('2027-01-15')
    })

    it('handles zones that are not whole hours from UTC', () => {
        // India is UTC+5:30: 21:30 UTC is 03:00 the next day.
        expect(localParts(d('2027-01-15T21:30:00Z'), 'Asia/Kolkata')).toMatchObject({ hour: 3, minute: 0, day: 16 })
    })
})

describe('daily run key', () => {
    const ny = 'America/New_York'

    it('is null before the local hour and the date after it', () => {
        expect(dailyRunKey(d('2027-01-15T07:59:00Z'), ny, 3)).toBeNull() // 02:59 local
        expect(dailyRunKey(d('2027-01-15T08:00:00Z'), ny, 3)).toBe('2027-01-15') // 03:00 local
    })

    it('stays the same for every later hour of the same local day, so repeats can be recognised', () => {
        const keys = ['08:00', '09:00', '15:00', '23:00'].map((t) => dailyRunKey(d(`2027-01-15T${t}:00Z`), ny, 3))
        expect(new Set(keys)).toEqual(new Set(['2027-01-15']))
    })

    it('changes when the local day changes, even though the UTC day has not', () => {
        // 04:59 UTC is 23:59 on Jan 14 in New York; 05:00 UTC is 00:00 on Jan 15. Hour 0 means "from midnight".
        expect(dailyRunKey(d('2027-01-15T04:59:00Z'), ny, 0)).toBe('2027-01-14')
        expect(dailyRunKey(d('2027-01-15T05:00:00Z'), ny, 0)).toBe('2027-01-15')
    })

    it('still runs on the day clocks jump forward past the chosen hour', () => {
        // On 2027-03-14 New York skips 02:00 to 03:00. A job set for 02:00 must not vanish that day.
        expect(dailyRunKey(d('2027-03-14T06:59:00Z'), ny, 2)).toBeNull() // 01:59 local
        expect(dailyRunKey(d('2027-03-14T07:00:00Z'), ny, 2)).toBe('2027-03-14') // 03:00 local
    })

    it('does not run twice on the day clocks go back', () => {
        // On 2027-11-07 01:00 to 02:00 happens twice. Both readings give the same key.
        const first = dailyRunKey(d('2027-11-07T05:30:00Z'), ny, 1) // 01:30 EDT
        const second = dailyRunKey(d('2027-11-07T06:30:00Z'), ny, 1) // 01:30 EST
        expect(first).toBe('2027-11-07')
        expect(second).toBe('2027-11-07')
    })

    it('works in a zone with a half-hour offset', () => {
        expect(dailyRunKey(d('2027-01-15T21:30:00Z'), 'Asia/Kolkata', 3)).toBe('2027-01-16')
        expect(dailyRunKey(d('2027-01-15T20:30:00Z'), 'Asia/Kolkata', 3)).toBeNull() // 02:00 local
    })

    it('refuses bad settings instead of silently never running', () => {
        expect(() => dailyRunKey(d('2027-01-15T08:00:00Z'), ny, 24)).toThrow()
        expect(() => dailyRunKey(d('2027-01-15T08:00:00Z'), ny, 2.5)).toThrow()
        expect(() => dailyRunKey(d('2027-01-15T08:00:00Z'), 'Nowhere/Land', 3)).toThrow()
    })
})

describe('formatting for people', () => {
    it('shows the date the reader would see on their own calendar', () => {
        // 03:00 UTC on Jan 1 is still Dec 31 in Los Angeles, and already Jan 1 morning in Auckland.
        expect(formatInZone(d('2027-01-01T03:00:00Z'), 'America/Los_Angeles')).toBe('Dec 31, 2026')
        expect(formatInZone(d('2027-01-01T03:00:00Z'), 'Pacific/Auckland')).toBe('Jan 1, 2027')
    })

    it('can include the time', () => {
        expect(formatDateTimeInZone(d('2027-01-15T08:00:00Z'), 'America/New_York')).toContain('3:00')
    })
})