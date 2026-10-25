import { PrismaClient } from '@prisma/client'
import { slugify, validateSlug } from '../src/lib/host'

// This script uses its own plain client on purpose: it runs BEFORE the tenant-aware client exists.
const prisma = new PrismaClient()

async function main() {
    // 1. The one gym. Project 5 created it; if it is somehow missing, build it from the Project 7 settings.
    const gyms = await prisma.gym.findMany({ orderBy: { createdAt: 'asc' } })
    if (gyms.length > 1) {
        throw new Error(`Found ${gyms.length} gyms. This script is for databases that have exactly one gym.`)
    }
    const settings = await prisma.gymSettings.findUnique({ where: { id: 'gym' } })

    let gym = gyms[0]
    if (!gym) {
        gym = await prisma.gym.create({
            data: { name: settings?.name ?? 'My Gym', timeZone: settings?.timeZone ?? 'Asia/Jakarta' },
        })
        console.log(`Created the gym "${gym.name}"`)
    }

    // 2. Give it an address name (slug), and the daily hours that used to live in GymSettings.
    const slug = process.env.GYM_SLUG ?? gym.slug ?? slugify(gym.name)
    const problem = validateSlug(slug)
    if (problem) throw new Error(`The slug "${slug}" cannot be used: ${problem}. Set GYM_SLUG to another name.`)

    if (settings && settings.timeZone !== gym.timeZone) {
        // Two tables held a time zone. Class times were created in the Gym one, so that one wins.
        console.warn(
            `Note: GymSettings said ${settings.timeZone} but the gym says ${gym.timeZone}. Keeping ${gym.timeZone}. ` +
            'You can change it later on the settings page.',
        )
    }

    gym = await prisma.gym.update({
        where: { id: gym.id },
        data: {
            slug,
            ...(settings ? { billingHour: settings.billingHour, reminderHour: settings.reminderHour } : {}),
        },
    })
    console.log(`Gym "${gym.name}" is now ${gym.slug} (${gym.timeZone}, billing ${gym.billingHour}:00, reminders ${gym.reminderHour}:00)`)

    // 3. Mark every existing row as belonging to this gym. `gymId: null` means a second run changes nothing.
    const gymId = gym.id
    const data = { gymId }
    const where = { gymId: null }
    const steps: [string, () => Promise<{ count: number }>][] = [
        ['User', () => prisma.user.updateMany({ where, data })],
        ['Membership', () => prisma.membership.updateMany({ where, data })],
        ['MembershipPlan', () => prisma.membershipPlan.updateMany({ where, data })],
        ['Discount', () => prisma.discount.updateMany({ where, data })],
        ['BillingEvent', () => prisma.billingEvent.updateMany({ where, data })],
        ['Payment', () => prisma.payment.updateMany({ where, data })],
        ['Refund', () => prisma.refund.updateMany({ where, data })],
        ['Notification', () => prisma.notification.updateMany({ where, data })],
        ['GymClass', () => prisma.gymClass.updateMany({ where, data })],
        ['GymClassInstance', () => prisma.gymClassInstance.updateMany({ where, data })],
        ['GymClassBooking', () => prisma.gymClassBooking.updateMany({ where, data })],
        ['PasswordResetToken', () => prisma.passwordResetToken.updateMany({ where, data })],
    ]
    for (const [name, run] of steps) {
        const { count } = await run()
        console.log(`${name.padEnd(20)} ${count} rows updated`)
    }

    // 4. Prove nothing was missed. The next step makes the column required, which would fail on a leftover.
    const left = await Promise.all([
        prisma.user.count({ where }),
        prisma.membership.count({ where }),
        prisma.membershipPlan.count({ where }),
        prisma.discount.count({ where }),
        prisma.billingEvent.count({ where }),
        prisma.payment.count({ where }),
        prisma.refund.count({ where }),
        prisma.notification.count({ where }),
        prisma.gymClass.count({ where }),
        prisma.gymClassInstance.count({ where }),
        prisma.gymClassBooking.count({ where }),
        prisma.passwordResetToken.count({ where }),
    ])
    const leftover = left.reduce((a, b) => a + b, 0)
    if (leftover > 0) throw new Error(`${leftover} rows still have no gym. Do not continue to the next step.`)
    console.log('\nAll rows belong to a gym.')
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())