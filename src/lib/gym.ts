import type { Gym } from '@prisma/client'
import { gymOrigin } from './host'
import { rawDb } from './raw-db'
import { getTenantGymId } from './tenant'
import { runInGym } from './tenant-context'

// The gym the current request (or runInGym block) belongs to. It replaces the single GymSettings row of Project 7.
export async function getGym(): Promise<Gym> {
    return rawDb.gym.findUniqueOrThrow({ where: { id: await getTenantGymId() } })
}

export function listGyms(): Promise<Gym[]> {
    return rawDb.gym.findMany({ orderBy: { createdAt: 'asc' } })
}

// Where this gym's visitors go: its first verified custom domain, or its platform subdomain.
// Used for every link we put in an email, a payment return address or a calendar feed.
export async function gymBaseUrl(gym: Pick<Gym, 'id' | 'slug'>): Promise<string> {
    const domain = await rawDb.gymDomain.findFirst({
        where: { gymId: gym.id, verifiedAt: { not: null } },
        orderBy: { verifiedAt: 'asc' },
        select: { hostname: true },
    })
    return gymOrigin(gym, { customHost: domain?.hostname })
}

export type GymRun<T> = { slug: string; ok: true; value: T } | { slug: string; ok: false; error: unknown }

// Runs `fn` once for every gym, one after the other, each inside its own gym context.
// A failure in one gym is recorded and does not stop the others.
export async function forEachGym<T>(fn: (gym: Gym) => Promise<T>): Promise<GymRun<T>[]> {
    const results: GymRun<T>[] = []
    for (const gym of await listGyms()) {
        try {
            results.push({ slug: gym.slug, ok: true, value: await runInGym(gym.id, () => fn(gym)) })
        } catch (error) {
            results.push({ slug: gym.slug, ok: false, error })
        }
    }
    return results
}