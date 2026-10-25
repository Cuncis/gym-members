import { inngest } from '../src/inngest/client'
import { pickGym } from '../src/lib/script-gym'

// Starts one of the daily jobs right now for ONE gym, without waiting for the clock.
// Needs the Inngest dev server running.   pnpm jobs:trigger billing --gym=gyma
const jobs: Record<string, string> = {
    billing: 'billing/run.requested',
    reminders: 'reminders/run.requested',
}

async function main() {
    const kind = process.argv[2]
    if (!kind || !(kind in jobs)) {
        console.error('Usage: pnpm jobs:trigger billing | reminders  [--gym=<slug>]')
        process.exit(1)
    }
    const gym = await pickGym()
    // No event id on purpose: a manual run is never mistaken for today's scheduled one.
    await inngest.send({ name: jobs[kind], data: { gymId: gym.id, runDate: `manual-${Date.now()}` } })
    console.log(`Sent ${jobs[kind]} for ${gym.name}. Open http://localhost:8288 to watch it run.`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})