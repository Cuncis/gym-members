import { describe, expect, it } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
    it('accepts common US formats', () => {
        expect(normalizePhone('(555) 234-5678')).toBe('+15552345678')
        expect(normalizePhone('555-234-5678')).toBe('+15552345678')
        expect(normalizePhone('1 555 234 5678')).toBe('+15552345678')
        expect(normalizePhone('+1 (555) 234-5678')).toBe('+15552345678')
    })

    it('accepts international numbers that start with +', () => {
        expect(normalizePhone('+66 81 234 5678')).toBe('+66812345678')
        expect(normalizePhone('+44 7911 123456')).toBe('+447911123456')
    })

    it('refuses numbers it would have to guess', () => {
        expect(normalizePhone('')).toBeNull()
        expect(normalizePhone('12345')).toBeNull()
        expect(normalizePhone('0812345678')).toBeNull() // looks Thai, but no country code
        expect(normalizePhone('+0123456789')).toBeNull() // a country code never starts with 0
        expect(normalizePhone('+1234')).toBeNull() // too short
        expect(normalizePhone('call me')).toBeNull()
    })
})