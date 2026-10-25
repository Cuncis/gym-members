import { describe, expect, it } from 'vitest'
import { planDailyRuns } from './cron-plan'

const jakarta = { id: 'g-jkt', timeZone: 'Asia/Jakarta', billingHour: 3, reminderHour: 9 }
const newYork = { id: 'g-nyc', timeZone: 'America/New_York', billingHour: 3, reminderHour: 9 }

describe('planDailyRuns', () => {
    it('uses each gym\'s own clock', () => {
        // 2030-05-31 17:30 UTC = 00:30 on June 1 in Jakarta (before 3am) and 13:30 on May 31 in New York (after 3am and 9am).
        const events = planDailyRuns([jakarta, newYork], new Date('2030-05-31T17:30:00Z'))
        expect(events.map((e) => e.id)).toEqual(['billing-run:g-nyc:2030-05-31', 'reminders-run:g-nyc:2030-05-31'])
    })

    it('names the gym and the gym-local date in the event', () => {
        const [billing] = planDailyRuns([jakarta], new Date('2030-05-31T20:30:00Z')) // 03:30 on June 1 in Jakarta
        expect(billing).toEqual({
            name: 'billing/run.requested',
            id: 'billing-run:g-jkt:2030-06-01',
            data: { gymId: 'g-jkt', runDate: '2030-06-01' },
        })
    })

    it('asks for nothing before the hour is reached', () => {
        expect(planDailyRuns([newYork], new Date('2030-05-31T05:00:00Z'))).toEqual([]) // 01:00 in New York
    })

    it('gives two gyms on the same date different ids', () => {
        const events = planDailyRuns([{ ...jakarta, id: 'a' }, { ...jakarta, id: 'b' }], new Date('2030-05-31T20:30:00Z'))
        expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
    })

    it('works with an hourly schedule: the same id every hour of the day', () => {
        const first = planDailyRuns([newYork], new Date('2030-05-31T08:00:00Z'))[0]
        const later = planDailyRuns([newYork], new Date('2030-05-31T21:00:00Z'))[0]
        expect(first.id).toBe(later.id)
    })
})