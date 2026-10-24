import { db } from '../src/lib/db'
import { renewDue } from '../src/lib/billing'
import { getGateway } from '../src/lib/payment-gateways'

async function main() {
    const arg = process.argv.find((a) => a.startsWith('--at='))
    const now = arg ? new Date(arg.slice('--at='.length)) : new Date()
    if (Number.isNaN(now.getTime())) {
        console.error('--at must be a date, like --at=2026-12-20T00:00:00Z')
        process.exit(1)
    }

    const gateway = getGateway()
    console.log(`Billing run at ${now.toISOString()} using the "${gateway.name}" gateway`)
    console.log(await renewDue(gateway, now))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => db.$disconnect())