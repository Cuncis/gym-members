import { db } from '@/lib/db'
import { upcomingStarts } from '@/lib/time'

export const WEEKS_AHEAD = 8

export function getGym() {
    return db.gym.upsert({
        where: { id: 'main' },
        update: {},
        create: { id: 'main', name: 'Iron Peak Gym', timeZone: 'Asia/Jakarta' },
    })
}

// Creates the next 8 weekly sessions. Safe to run again: sessions that already exist are skipped.
export async function generateInstances(classId: string, now = new Date()) {
    const gymClass = await db.gymClass.findUnique({ where: { id: classId } })
    if (!gymClass) return null

    const gym = await getGym()
    const starts = upcomingStarts({
        dayOfWeek: gymClass.dayOfWeek,
        startTime: gymClass.startTime,
        timeZone: gym.timeZone,
        weeks: WEEKS_AHEAD,
        now,
    })

    const result = await db.gymClassInstance.createMany({
        data: starts.map((startsAt) => ({
            classId: gymClass.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + gymClass.durationMinutes * 60_000),
            capacity: gymClass.capacity,
        })),
        skipDuplicates: true,
    })

    return { created: result.count, requested: starts.length }
}