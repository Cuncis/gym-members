import { inngest } from '../src/inngest/client'

// Starts one of the daily jobs right now, without waiting for the clock. Needs the Inngest dev server running.
const jobs: Record<string, string> = {
    billing: 'billing/run.requested',
    reminders: 'reminders/run.requested',
}

async function main() {
    const kind = process.argv[2]
    if (!kind || !(kind in jobs)) {
        console.error('Usage: pnpm jobs:trigger billing | reminders')
        process.exit(1)
    }
    // No event id on purpose: a manual run is never mistaken for today's scheduled one.
    await inngest.send({ name: jobs[kind], data: { runDate: `manual-${Date.now()}` } })
    console.log(`Sent ${jobs[kind]}. Open http://localhost:8288 to watch it run.`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})