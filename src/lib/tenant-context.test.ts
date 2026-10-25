import { describe, expect, it } from 'vitest'
import { gymIdFromContext, runInGym, sessionBelongsToGym } from './tenant-context'

describe('runInGym', () => {
    it('has no gym outside of it', () => {
        expect(gymIdFromContext()).toBeNull()
    })

    it('makes the gym visible to everything started inside, across awaits', async () => {
        const seen = await runInGym('gym_a', async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            return gymIdFromContext()
        })
        expect(seen).toBe('gym_a')
        expect(gymIdFromContext()).toBeNull()
    })

    it('keeps two gyms running at the same time apart', async () => {
        const slow = (id: string, ms: number) =>
            runInGym(id, async () => {
                await new Promise((resolve) => setTimeout(resolve, ms))
                return gymIdFromContext()
            })
        expect(await Promise.all([slow('gym_a', 20), slow('gym_b', 1)])).toEqual(['gym_a', 'gym_b'])
    })

    it('lets a nested call switch gym, and switches back after', async () => {
        const seen = await runInGym('gym_a', async () => {
            const inner = await runInGym('gym_b', () => gymIdFromContext())
            return [inner, gymIdFromContext()]
        })
        expect(seen).toEqual(['gym_b', 'gym_a'])
    })

    it('starts a lazy promise inside the gym (the reason runInGym awaits fn itself)', async () => {
        // A "thenable" only starts working when somebody awaits it, like a Prisma query does.
        const lazy = () => ({ then: (resolve: (v: string | null) => void) => resolve(gymIdFromContext()) }) as PromiseLike<string | null>
        expect(await runInGym('gym_a', () => lazy() as unknown as Promise<string | null>)).toBe('gym_a')
    })
})

describe('sessionBelongsToGym', () => {
    it('accepts a session from the same gym and refuses another gym', () => {
        expect(sessionBelongsToGym('gym_a', 'gym_a')).toBe(true)
        expect(sessionBelongsToGym('gym_a', 'gym_b')).toBe(false)
    })

    it('refuses when either side is unknown', () => {
        expect(sessionBelongsToGym(undefined, 'gym_a')).toBe(false)
        expect(sessionBelongsToGym('gym_a', undefined)).toBe(false)
        expect(sessionBelongsToGym(undefined, undefined)).toBe(false)
        expect(sessionBelongsToGym('', '')).toBe(false)
    })
})