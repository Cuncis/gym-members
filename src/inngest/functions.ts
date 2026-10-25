import { inngest } from './client'
import { forEachGym } from '@/lib/gym'
import { queueBillingNotices, queueReminders, renewAll, retryFailedBills } from '@/lib/jobs'
import { deliverPending } from '@/lib/notifications'
import { getSenders } from '@/lib/messaging'
import { getGateway } from '@/lib/payment-gateways'
import { runInGym } from '@/lib/tenant-context'

// Each `step.run` is saved when it finishes. If a later step throws, Inngest retries the function
// and skips the steps that already succeeded. Every step is also safe to repeat, so a retry in
// the middle of a step is harmless too.
//
// Project 8: every event now names a gym (`event.data.gymId`), and every step runs inside that gym
// with runInGym. The job code itself did not change: it still calls `db`, which now means "this gym's data".

// Once a day per gym (the cron endpoint sends one event per gym): charge due renewals, retry failed payments,
// queue the receipts and failure notices, then send everything that is waiting.
export const billingRun = inngest.createFunction(
    {
        id: 'billing-run',
        retries: 3,
        // One run at a time PER GYM: gym A's slow run never makes gym B wait.
        concurrency: { limit: 1, key: 'event.data.gymId' },
        triggers: [{ event: 'billing/run.requested' }],
    },
    async ({ event, step }) => {
        const gymId = event.data.gymId as string
        const gateway = getGateway()
        const renewals = await step.run('renew', () => runInGym(gymId, () => renewAll(gateway, new Date())))
        const retries = await step.run('retry-failed', () => runInGym(gymId, () => retryFailedBills(gateway, new Date())))
        const queued = await step.run('queue-notices', () => runInGym(gymId, () => queueBillingNotices(new Date())))
        const delivered = await step.run('deliver', () => runInGym(gymId, () => deliverPending(getSenders())))
        return { gymId, runDate: event.data.runDate as string, renewals, retries, queued, delivered }
    },
)

// Once a day per gym: "your plan renews soon" and "your pass ends soon".
export const remindersRun = inngest.createFunction(
    {
        id: 'reminders-run',
        retries: 3,
        concurrency: { limit: 1, key: 'event.data.gymId' },
        triggers: [{ event: 'reminders/run.requested' }],
    },
    async ({ event, step }) => {
        const gymId = event.data.gymId as string
        const queued = await step.run('queue-reminders', () => runInGym(gymId, () => queueReminders(new Date())))
        const delivered = await step.run('deliver', () => runInGym(gymId, () => deliverPending(getSenders())))
        return { gymId, runDate: event.data.runDate as string, queued, delivered }
    },
)

// A safety net every ten minutes: sends messages that are waiting for a retry, and any
// that were queued just before a crash. It visits every gym.
export const deliverWaiting = inngest.createFunction(
    { id: 'deliver-waiting', retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: '*/10 * * * *' }] },
    async ({ step }) =>
        step.run('deliver-all-gyms', async () => {
            const runs = await forEachGym(() => deliverPending(getSenders()))
            // A gym that failed is reported by name, and the others were still served.
            return runs.map((r) => (r.ok ? { gym: r.slug, ...r.value } : { gym: r.slug, error: String(r.error) }))
        }),
)

export const functions = [billingRun, remindersRun, deliverWaiting]