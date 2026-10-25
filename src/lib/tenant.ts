import type { Gym } from '@prisma/client'
import { headers } from 'next/headers'
import { cache } from 'react'
import { parseHost, rootHostname } from './host'
import { rawDb } from './raw-db'
import { gymIdFromContext, NoGymError } from './tenant-context'

// ---------- finding the gym behind an address ----------

// A short memory so every database call of a busy server does not first look up the gym.
// Thirty seconds is the longest a stale answer can live on ANOTHER server instance; on this one, saving
// settings clears it at once. It lives on globalThis because Next.js may load this file once per route,
// and a cache that each route has its own copy of cannot be cleared by the route that saved the change.
const TTL_MS = 30_000
const globalForGyms = globalThis as unknown as { gymByHost?: Map<string, { gym: Gym; expires: number }> }
const known = (globalForGyms.gymByHost ??= new Map())

export function clearGymCache() {
    known.clear()
}

// "gyma.localhost" -> the Gym row, or null. A custom domain only counts once it is verified.
export async function findGymByHost(rawHost: string | null | undefined): Promise<Gym | null> {
    const info = parseHost(rawHost, rootHostname())
    if (info.kind !== 'subdomain' && info.kind !== 'custom') return null

    const hit = known.get(info.host)
    if (hit && hit.expires > Date.now()) return hit.gym

    let gym: Gym | null
    if (info.kind === 'subdomain') {
        gym = await rawDb.gym.findUnique({ where: { slug: info.slug } })
    } else {
        const domain = await rawDb.gymDomain.findFirst({
            where: { hostname: info.host, verifiedAt: { not: null } },
            include: { gym: true },
        })
        gym = domain?.gym ?? null
    }
    if (gym) known.set(info.host, { gym, expires: Date.now() + TTL_MS })
    return gym
}

// The Host header says what the visitor typed. Behind your own trusted load balancer you may need
// x-forwarded-host instead; never trust it when the app is reachable directly.
export function hostFromHeaders(get: (name: string) => string | null): string | null {
    if (process.env.TRUST_FORWARDED_HOST === '1') return get('x-forwarded-host') ?? get('host')
    return get('host')
}

// ---------- the gym of the current web request ----------

export const getRequestGym = cache(async (): Promise<Gym | null> => {
    const h = await headers()
    return findGymByHost(hostFromHeaders((name) => h.get(name)))
})

// For pages: the gym of this address, or the 404 page.
export async function getCurrentGym(): Promise<Gym> {
    const gym = await getRequestGym()
    if (!gym) {
        const { notFound } = await import('next/navigation')
        notFound()
    }
    return gym as Gym
}

// Next.js uses special errors to say "this page must be rendered per request". They must pass through.
function isNextControlError(error: unknown): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest
    return typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))
}

// The one question every database call asks: "for which gym?"
// First the explicit answer (runInGym), then the address of the current request. No answer means no query.
export async function getTenantGymId(): Promise<string> {
    const fromContext = gymIdFromContext()
    if (fromContext) return fromContext

    let gym: Gym | null
    try {
        gym = await getRequestGym()
    } catch (error) {
        if (isNextControlError(error)) throw error
        throw new NoGymError('No gym is selected. Outside a web request, wrap the code in runInGym(gymId, ...).')
    }
    if (!gym) throw new NoGymError('This address does not belong to a gym.')
    return gym.id
}