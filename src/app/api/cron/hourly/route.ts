import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { getGymSettings } from '@/lib/gym-settings'
import { dailyRunKey } from '@/lib/gym-clock'

export const dynamic = 'force-dynamic'

// Something outside the app (AWS EventBridge, Vercel Cron, a plain crontab) calls this every hour.
// It does no work itself: it only decides which daily jobs are due and hands them to Inngest.
async function handle(request: Request) {
    if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await getGymSettings()
    const now = new Date()
    const events: { name: string; id: string; data: { runDate: string } }[] = []

    const billingDay = dailyRunKey(now, settings.timeZone, settings.billingHour)
    if (billingDay) {
        // The event id is today's date. Inngest ignores a second event with the same id, so the hourly
        // calls after the first one today do nothing.
        events.push({ name: 'billing/run.requested', id: `billing-run:${billingDay}`, data: { runDate: billingDay } })
    }
    const reminderDay = dailyRunKey(now, settings.timeZone, settings.reminderHour)
    if (reminderDay) {
        events.push({ name: 'reminders/run.requested', id: `reminders-run:${reminderDay}`, data: { runDate: reminderDay } })
    }

    if (events.length > 0) await inngest.send(events)

    return NextResponse.json({
        now: now.toISOString(),
        timeZone: settings.timeZone,
        requested: events.map((e) => e.id),
    })
}

export { handle as GET, handle as POST }