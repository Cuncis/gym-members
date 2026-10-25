// Everything in this file is pure: text in, text out. No database, no Next.js. That is why it is easy to test,
// and why the proxy (which must stay fast) can use it.

// Names a gym may not take, because they would look like parts of the platform itself.
export const RESERVED_SLUGS = new Set([
    'www',
    'app',
    'api',
    'admin',
    'auth',
    'billing',
    'blog',
    'cdn',
    'dashboard',
    'docs',
    'help',
    'localhost',
    'mail',
    'platform',
    'static',
    'status',
    'support',
])

// 1 to 30 characters: lowercase letters, digits and hyphens, never starting or ending with a hyphen.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

// "Iron Peak Gym!" -> "iron-peak-gym". Always returns something valid-looking (falls back to "gym").
export function slugify(name: string): string {
    const slug = name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '') // "é" -> "e"
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30)
        .replace(/-+$/g, '')
    return slug || 'gym'
}

// Returns a message when the slug cannot be used, or null when it is fine.
export function validateSlug(slug: string): string | null {
    if (!SLUG.test(slug)) return 'Use 1 to 30 lowercase letters, digits or hyphens, not starting or ending with a hyphen'
    if (RESERVED_SLUGS.has(slug)) return 'This name is reserved'
    return null
}

// The Host header looks like "GymA.localhost:3000". We keep only the lowercase name: "gyma.localhost".
export function normalizeHost(raw: string | null | undefined): string | null {
    if (!raw) return null
    // The header can hold several comma separated values behind some proxies. Only the first counts.
    const first = raw.split(',')[0].trim().toLowerCase()
    const withoutPort = first.replace(/:\d{1,5}$/, '').replace(/\.$/, '')
    if (withoutPort.length === 0 || withoutPort.length > 253) return null
    // Letters, digits, hyphens and dots only. This also rejects IPv6 forms such as "[::1]".
    if (!/^[a-z0-9.-]+$/.test(withoutPort)) return null
    if (withoutPort.startsWith('.') || withoutPort.includes('..')) return null
    return withoutPort
}

export type HostInfo =
    | { kind: 'platform' } //  the platform itself: localhost, fitnessgm.app
    | { kind: 'subdomain'; slug: string; host: string } //  iron-peak.fitnessgm.app
    | { kind: 'custom'; host: string } //  members.ironpeak.com
    | { kind: 'unknown' } //  something we will never serve

// `rootHostname` is the platform's own name without a port: "localhost" while developing, "fitnessgm.app" in production.
export function parseHost(rawHost: string | null | undefined, rootHostname: string): HostInfo {
    const host = normalizeHost(rawHost)
    if (!host) return { kind: 'unknown' }
    // A bare IP address is not a gym.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { kind: 'unknown' }

    const root = rootHostname.toLowerCase()
    if (host === root || host === `www.${root}`) return { kind: 'platform' }

    if (host.endsWith(`.${root}`)) {
        const label = host.slice(0, -(root.length + 1))
        // "a.b.fitnessgm.app", "app.fitnessgm.app" or a bad name: under our root, but not a gym.
        if (validateSlug(label) !== null) return { kind: 'unknown' }
        return { kind: 'subdomain', slug: label, host }
    }

    return { kind: 'custom', host }
}

// The root hostname comes from APP_URL, which already exists from Project 6 ("http://localhost:3000").
export function rootHostname(appUrl = process.env.APP_URL ?? 'http://localhost:3000'): string {
    return new URL(appUrl).hostname.toLowerCase()
}

// The address a gym's visitors use. A verified custom domain wins over the platform subdomain.
export function gymOrigin(
    gym: { slug: string },
    options: { customHost?: string | null; appUrl?: string } = {},
): string {
    if (options.customHost) return `https://${options.customHost}`
    const app = new URL(options.appUrl ?? process.env.APP_URL ?? 'http://localhost:3000')
    return `${app.protocol}//${gym.slug}.${app.hostname}${app.port ? `:${app.port}` : ''}`
}