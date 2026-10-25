import { inngest } from './client'
import { queueBillingNotices, queueReminders, renewAll, retryFailedBills } from '@/lib/jobs'
import { deliverPending } from '@/lib/notifications'
import { getSenders } from '@/lib/messaging'
import { getGateway } from '@/lib/payment-gateways'

// Each `step.run` is saved when it finishes. If a later step throws, Inngest retries the function
// and skips the steps that already succeeded. Every step is also safe to repeat, so a retry in
// the middle of a step is harmless too.

// Once a day per gym (the cron endpoint sends the event): charge due renewals, retry failed payments,
// queue the receipts and failure notices, then send everything that is waiting.
export const billingRun = inngest.createFunction(
    {
        id: 'billing-run',
        retries: 3,
        concurrency: { limit: 1 }, // never two billing runs at the same time
        triggers: [{ event: 'billing/run.requested' }],
    },
    async ({ event, step }) => {
        const gateway = getGateway()
        const renewals = await step.run('renew', () => renewAll(gateway, new Date()))
        const retries = await step.run('retry-failed', () => retryFailedBills(gateway, new Date()))
        const queued = await step.run('queue-notices', () => queueBillingNotices(new Date()))
        const delivered = await step.run('deliver', () => deliverPending(getSenders()))
        return { runDate: event.data.runDate as string, renewals, retries, queued, delivered }
    },
)

// Once a day per gym: "your plan renews soon" and "your pass ends soon".
export const remindersRun = inngest.createFunction(
    {
        id: 'reminders-run',
        retries: 3,
        concurrency: { limit: 1 },
        triggers: [{ event: 'reminders/run.requested' }],
    },
    async ({ event, step }) => {
        const queued = await step.run('queue-reminders', () => queueReminders(new Date()))
        const delivered = await step.run('deliver', () => deliverPending(getSenders()))
        return { runDate: event.data.runDate as string, queued, delivered }
    },
)

// A safety net every ten minutes: sends messages that are waiting for a retry, and any
// that were queued just before a crash.
export const deliverWaiting = inngest.createFunction(
    { id: 'deliver-waiting', retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: '*/10 * * * *' }] },
    async ({ step }) => step.run('deliver', () => deliverPending(getSenders())),
)

export const functions = [billingRun, remindersRun, deliverWaiting]