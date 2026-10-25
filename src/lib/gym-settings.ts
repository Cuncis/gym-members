import { db } from './db'

// The gym's name and time zone. The row is created with its defaults the first time anyone asks.
// Project 8 will make this one row per gym.
export function getGymSettings() {
    return db.gymSettings.upsert({ where: { id: 'gym' }, update: {}, create: { id: 'gym' } })
}