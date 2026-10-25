import type { Gym } from '@prisma/client'
import { listGyms } from './gym'
import { rawDb } from './raw-db'
import { runInGym } from './tenant-context'

// Scripts have no web address, so they must be told which gym to work on:
//   pnpm seed:bookings --gym=gyma        or        GYM=gyma pnpm seed:bookings
// With exactly one gym in the database the choice is obvious and the flag can be left out.
export async function pickGym(): Promise<Gym> {
    const fromFlag = process.argv.find((a) => a.startsWith('--gym='))?.slice('--gym='.length)
    const slug = fromFlag ?? process.env.GYM
    const gyms = await listGyms()
    const names = gyms.map((g) => g.slug).join(', ') || '(none yet)'

    if (slug) {
        const gym = gyms.find((g) => g.slug === slug)
        if (!gym) throw new Error(`There is no gym "${slug}". Gyms: ${names}`)
        return gym
    }
    if (gyms.length === 1) return gyms[0]
    throw new Error(`There are ${gyms.length} gyms. Choose one with --gym=<slug>. Gyms: ${names}`)
}

export async function runWithGym<T>(main: () => Promise<T>): Promise<T> {
    const gym = await pickGym()
    console.log(`Gym: ${gym.name} (${gym.slug})`)
    return runInGym(gym.id, main)
}

// The proof scripts create their own people and plans. They do it in a gym of their own, so even a
// bug in a script cannot touch the data of a real gym.
export async function withProofGym<T>(name: string, main: () => Promise<T>): Promise<T> {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production')
    const slug = `proof-${name}`
    const gym = await rawDb.gym.upsert({
        where: { slug },
        update: {},
        create: { slug, name: `Proof ${name}`, timeZone: 'America/New_York' },
    })
    try {
        return await runInGym(gym.id, main)
    } finally {
        // The scripts delete what they create, so the proof gym is empty now. Remove it, so it does not show up on the
        // platform page or get a nightly billing run. If something was left behind, the database refuses and it stays.
        await rawDb.gym.delete({ where: { id: gym.id } }).catch(() => undefined)
        // The script's own $disconnect ran before this cleanup and the delete above opened a new connection. Close it,
        // or the process stays alive after the last line is printed.
        await rawDb.$disconnect()
    }
}