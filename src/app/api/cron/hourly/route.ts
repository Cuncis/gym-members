import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'
import { planDailyRuns } from '@/lib/cron-plan'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { listGyms } from '@/lib/gym'

// Something outside the app (AWS EventBridge, Vercel Cron, a plain crontab) calls this every hour.
// It does no work itself: for EACH gym it decides which daily jobs are due on that gym's own clock
// (planDailyRuns) and hands them to Inngest.
async function handle(request: Request) {
    if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const gyms = await listGyms()
    const events = planDailyRuns(gyms, now)

    if (events.length > 0) await inngest.send(events)

    return NextResponse.json({
        now: now.toISOString(),
        gyms: gyms.length,
        requested: events.map((e) => e.id),
    })
}

export { handle as GET, handle as POST }