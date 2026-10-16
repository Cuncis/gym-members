import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
    it('allows local paths', () => {
        expect(safeRedirect('/members/new')).toBe('/members/new')
        expect(safeRedirect('/members?page=2')).toBe('/members?page=2')
    })

    it('falls back for missing or empty values', () => {
        expect(safeRedirect(null)).toBe('/members')
        expect(safeRedirect(undefined)).toBe('/members')
        expect(safeRedirect('')).toBe('/members')
    })

    it('rejects addresses that leave the site', () => {
        expect(safeRedirect('//evil.com')).toBe('/members')
        expect(safeRedirect('https://evil.com')).toBe('/members')
        expect(safeRedirect('/\\evil.com')).toBe('/members')
        expect(safeRedirect('javascript:alert(1)')).toBe('/members')
    })
})