import { describe, expect, it } from 'vitest'
import { decideRoute, needsSignIn } from './proxy-rules'

const at = (host: string | null, pathname: string) => decideRoute({ host, pathname, rootHostname: 'localhost' })

describe('needsSignIn', () => {
    it('matches the protected areas and their children', () => {
        for (const p of ['/members', '/members/abc/edit', '/api/members', '/admin/settings', '/billing/notifications', '/api/domains/x/verify']) {
            expect(needsSignIn(p), p).toBe(true)
        }
    })

    it('leaves public pages alone, and does not match by accident', () => {
        for (const p of ['/', '/signin', '/signup', '/api/auth/session', '/api/calendar/abc/calendar.ics', '/members-area', '/administrator']) {
            expect(needsSignIn(p), p).toBe(false)
        }
    })
})

describe('decideRoute on the platform address', () => {
    it('shows the platform page at the front door', () => {
        expect(at('localhost:3000', '/')).toEqual({ action: 'rewrite', to: '/platform' })
    })

    it('serves only the platform endpoints', () => {
        expect(at('localhost:3000', '/api/inngest')).toEqual({ action: 'next' })
        expect(at('localhost:3000', '/api/cron/hourly')).toEqual({ action: 'next' })
        expect(at('localhost:3000', '/api/webhooks/stripe')).toEqual({ action: 'next' })
    })

    it('answers 404 for gym pages, which make no sense without a gym', () => {
        expect(at('localhost:3000', '/members')).toEqual({ action: 'notFound' })
        expect(at('localhost:3000', '/signin')).toEqual({ action: 'notFound' })
        expect(at('localhost:3000', '/api/cron-evil')).toEqual({ action: 'notFound' })
    })
})

describe('decideRoute on a gym address', () => {
    it('rewrites the front door to the gym page, keeping the address in the path', () => {
        expect(at('gymA.localhost:3000', '/')).toEqual({ action: 'rewrite', to: '/sites/gyma.localhost' })
        expect(at('members.ironpeak.com', '/')).toEqual({ action: 'rewrite', to: '/sites/members.ironpeak.com' })
    })

    it('asks for sign-in on protected paths and lets public ones through', () => {
        expect(at('gyma.localhost', '/members')).toEqual({ action: 'signIn' })
        expect(at('gyma.localhost', '/api/bookings')).toEqual({ action: 'signIn' })
        expect(at('gyma.localhost', '/signin')).toEqual({ action: 'next' })
        expect(at('gyma.localhost', '/api/auth/session')).toEqual({ action: 'next' })
    })
})

describe('decideRoute everywhere', () => {
    it('never lets a visitor reach the internal folders directly', () => {
        expect(at('gyma.localhost', '/sites/gymb.localhost')).toEqual({ action: 'notFound' })
        expect(at('localhost', '/sites')).toEqual({ action: 'notFound' })
        expect(at('gyma.localhost', '/platform')).toEqual({ action: 'notFound' })
    })

    it('refuses addresses that cannot be gyms', () => {
        expect(at(null, '/')).toEqual({ action: 'notFound' })
        expect(at('127.0.0.1:3000', '/')).toEqual({ action: 'notFound' })
        expect(at('app.localhost', '/')).toEqual({ action: 'notFound' })
    })
})