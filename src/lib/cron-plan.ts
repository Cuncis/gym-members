import type { Gym } from '@prisma/client'
import { dailyRunKey } from './gym-clock'

export type JobEvent = {
    name: 'billing/run.requested' | 'reminders/run.requested'
    id: string
    data: { gymId: string; runDate: string }
}

// For every gym, which daily jobs are due at `now` on THAT gym's clock? Pure: no database, no Inngest.
// The id holds the gym AND the gym-local date. Inngest ignores a second event with the same id, so the hourly
// calls after the first one today do nothing, and one gym's run never hides another gym's.
export function planDailyRuns(gyms: Pick<Gym, 'id' | 'timeZone' | 'billingHour' | 'reminderHour'>[], now: Date): JobEvent[] {
    const events: JobEvent[] = []
    for (const gym of gyms) {
        const billingDay = dailyRunKey(now, gym.timeZone, gym.billingHour)
        if (billingDay) {
            events.push({
                name: 'billing/run.requested',
                id: `billing-run:${gym.id}:${billingDay}`,
                data: { gymId: gym.id, runDate: billingDay },
            })
        }
        const reminderDay = dailyRunKey(now, gym.timeZone, gym.reminderHour)
        if (reminderDay) {
            events.push({
                name: 'reminders/run.requested',
                id: `reminders-run:${gym.id}:${reminderDay}`,
                data: { gymId: gym.id, runDate: reminderDay },
            })
        }
    }
    return events
}