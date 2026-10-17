import { describe, expect, it } from 'vitest'
import { parseWeek } from './schedule-shared'

describe('parseWeek', () => {
    it('accepts whole weeks from 0 to 12', () => {
        expect(parseWeek('0')).toBe(0)
        expect(parseWeek('2')).toBe(2)
        expect(parseWeek('12')).toBe(12)
    })

    it('clamps out-of-range values', () => {
        expect(parseWeek('99')).toBe(12)
        expect(parseWeek('-3')).toBe(0)
    })

    it('falls back to this week for anything else', () => {
        expect(parseWeek('abc')).toBe(0)
        expect(parseWeek('1.5')).toBe(0)
        expect(parseWeek(null)).toBe(0)
        expect(parseWeek(undefined)).toBe(0)
    })
})