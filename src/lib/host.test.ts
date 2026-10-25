import { describe, expect, it } from 'vitest'
import { gymOrigin, normalizeHost, parseHost, rootHostname, slugify, validateSlug } from './host'

describe('slugify', () => {
    it('makes a web-safe name', () => {
        expect(slugify('Iron Peak Gym')).toBe('iron-peak-gym')
        expect(slugify("  Zen & Flow -- Yoga!  ")).toBe('zen-flow-yoga')
        expect(slugify('Café Fitness')).toBe('cafe-fitness')
    })

    it('never returns an empty or oversized slug', () => {
        expect(slugify('!!!')).toBe('gym')
        expect(slugify('a'.repeat(80)).length).toBe(30)
        expect(slugify('x'.repeat(29) + ' y z')).not.toMatch(/-$/)
    })
})

describe('validateSlug', () => {
    it('accepts normal names', () => {
        expect(validateSlug('iron-peak')).toBeNull()
        expect(validateSlug('a')).toBeNull()
        expect(validateSlug('gym24')).toBeNull()
    })

    it('refuses bad shapes', () => {
        for (const bad of ['', '-gym', 'gym-', 'Gym', 'my gym', 'my.gym', 'a'.repeat(31), 'gym_a']) {
            expect(validateSlug(bad), bad).not.toBeNull()
        }
    })

    it('refuses reserved names', () => {
        for (const bad of ['www', 'admin', 'api', 'localhost']) expect(validateSlug(bad), bad).toBe('This name is reserved')
    })
})

describe('normalizeHost', () => {
    it('lowercases and removes the port and a trailing dot', () => {
        expect(normalizeHost('GymA.localhost:3000')).toBe('gyma.localhost')
        expect(normalizeHost('members.example.com.')).toBe('members.example.com')
    })

    it('uses only the first value of a list', () => {
        expect(normalizeHost('a.example.com, b.example.com')).toBe('a.example.com')
    })

    it('refuses anything that is not a host name', () => {
        for (const bad of [null, undefined, '', '[::1]:3000', 'a b.com', 'a..com', '.com', 'x/y.com', 'a.com/evil']) {
            expect(normalizeHost(bad), String(bad)).toBeNull()
        }
    })
})

describe('parseHost', () => {
    const root = 'localhost'

    it('recognises the platform itself', () => {
        expect(parseHost('localhost:3000', root)).toEqual({ kind: 'platform' })
        expect(parseHost('www.localhost', root)).toEqual({ kind: 'platform' })
    })

    it('finds the gym in a subdomain', () => {
        expect(parseHost('gymA.localhost:3000', root)).toEqual({ kind: 'subdomain', slug: 'gyma', host: 'gyma.localhost' })
        expect(parseHost('iron-peak.fitnessgm.app', 'fitnessgm.app')).toEqual({
            kind: 'subdomain',
            slug: 'iron-peak',
            host: 'iron-peak.fitnessgm.app',
        })
    })

    it('treats any other name as a custom domain', () => {
        expect(parseHost('Members.IronPeak.com', root)).toEqual({ kind: 'custom', host: 'members.ironpeak.com' })
        // "evil-localhost.com" ends with "localhost.com", not with ".localhost": it is somebody else's domain.
        expect(parseHost('evil-localhost', root)).toEqual({ kind: 'custom', host: 'evil-localhost' })
        expect(parseHost('notlocalhost.com', root)).toEqual({ kind: 'custom', host: 'notlocalhost.com' })
    })

    it('refuses names under our root that cannot be gyms', () => {
        expect(parseHost('app.localhost', root)).toEqual({ kind: 'unknown' }) //  reserved
        expect(parseHost('a.b.localhost', root)).toEqual({ kind: 'unknown' }) //  two levels deep
        expect(parseHost('-x.localhost', root)).toEqual({ kind: 'unknown' })
    })

    it('refuses bad input and IP addresses', () => {
        expect(parseHost(null, root)).toEqual({ kind: 'unknown' })
        expect(parseHost('127.0.0.1:3000', root)).toEqual({ kind: 'unknown' })
        expect(parseHost('[::1]', root)).toEqual({ kind: 'unknown' })
    })
})

describe('rootHostname and gymOrigin', () => {
    it('reads the root from APP_URL', () => {
        expect(rootHostname('http://localhost:3000')).toBe('localhost')
        expect(rootHostname('https://FitnessGM.app')).toBe('fitnessgm.app')
    })

    it('builds the address of a gym', () => {
        expect(gymOrigin({ slug: 'gyma' }, { appUrl: 'http://localhost:3000' })).toBe('http://gyma.localhost:3000')
        expect(gymOrigin({ slug: 'iron' }, { appUrl: 'https://fitnessgm.app' })).toBe('https://iron.fitnessgm.app')
    })

    it('prefers a verified custom domain, always over https', () => {
        expect(gymOrigin({ slug: 'iron' }, { customHost: 'members.ironpeak.com', appUrl: 'http://localhost:3000' })).toBe(
            'https://members.ironpeak.com',
        )
    })
})