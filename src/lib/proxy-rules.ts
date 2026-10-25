import { parseHost } from './host'

// Pages and API routes that need a signed-in person. This is the old `matcher` list from Projects 4 to 7, as code.
// The proxy only checks "is anyone signed in"; roles are still checked inside each page and route.
const SIGNED_IN_PREFIXES = [
    '/members',
    '/api/members',
    '/classes',
    '/api/classes',
    '/schedule',
    '/api/bookings',
    '/api/schedule',
    '/api/calendar-token',
    '/admin',
    '/plans',
    '/billing',
    '/checkout',
    '/api/checkout',
    '/api/memberships',
    '/api/payments',
    '/api/discounts',
    '/api/notifications',
    '/api/gym',
    '/api/domains',
]

// What the platform's own address (localhost, fitnessgm.app) serves. Everything else there is a 404,
// because pages like /members only make sense inside a gym.
const PLATFORM_PREFIXES = ['/api/inngest', '/api/cron', '/api/webhooks']

// Folders that exist only to be rewritten to. A visitor typing them gets a 404.
const INTERNAL_PREFIXES = ['/sites', '/platform']

const startsWithPath = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

export function needsSignIn(pathname: string): boolean {
    return SIGNED_IN_PREFIXES.some((prefix) => startsWithPath(pathname, prefix))
}

export type RouteDecision =
    | { action: 'next' }
    | { action: 'rewrite'; to: string }
    | { action: 'notFound' }
    | { action: 'signIn' }

// The whole routing story in one pure function: which address was visited, and what should happen.
export function decideRoute(input: { host: string | null; pathname: string; rootHostname: string }): RouteDecision {
    const { pathname } = input

    if (INTERNAL_PREFIXES.some((prefix) => startsWithPath(pathname, prefix))) return { action: 'notFound' }

    const info = parseHost(input.host, input.rootHostname)

    switch (info.kind) {
        case 'unknown':
            return { action: 'notFound' }

        case 'platform':
            if (pathname === '/') return { action: 'rewrite', to: '/platform' }
            return PLATFORM_PREFIXES.some((prefix) => startsWithPath(pathname, prefix)) ? { action: 'next' } : { action: 'notFound' }

        case 'subdomain':
        case 'custom':
            // The gym's public front page. Its address is the host, kept as one path segment: /sites/gyma.localhost
            if (pathname === '/') return { action: 'rewrite', to: `/sites/${info.host}` }
            return needsSignIn(pathname) ? { action: 'signIn' } : { action: 'next' }
    }
}