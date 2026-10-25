import { describe, expect, it } from 'vitest'
import { brandStyle, contrastColor, DEFAULT_BRAND, normalizeBrandColor } from './branding'

describe('normalizeBrandColor', () => {
    it('accepts 6 and 3 digit hex colours in any case', () => {
        expect(normalizeBrandColor('#2563EB')).toBe('#2563eb')
        expect(normalizeBrandColor(' #26e ')).toBe('#2266ee')
    })

    it('refuses everything else', () => {
        for (const bad of ['', 'blue', '2563eb', '#2563eg', '#12345', 'red; background: url(x)', 'rgb(1,2,3)', '#2563eb;}']) {
            expect(normalizeBrandColor(bad), bad).toBeNull()
        }
    })
})

describe('contrastColor', () => {
    it('picks readable text', () => {
        expect(contrastColor('#ffffff')).toBe('#000000')
        expect(contrastColor('#ffd400')).toBe('#000000') // yellow is light
        expect(contrastColor('#000000')).toBe('#ffffff')
        expect(contrastColor('#2563eb')).toBe('#ffffff') // the default blue is dark enough
        expect(contrastColor('#15803d')).toBe('#ffffff') // green
    })
})

describe('brandStyle', () => {
    it('sets both variables', () => {
        expect(brandStyle('#15803d')).toEqual({ '--brand': '#15803d', '--brand-contrast': '#ffffff' })
    })

    it('falls back to the default for missing or bad values', () => {
        for (const bad of [null, undefined, '', 'x</style><script>']) {
            expect(brandStyle(bad)['--brand'], String(bad)).toBe(DEFAULT_BRAND)
        }
    })
})