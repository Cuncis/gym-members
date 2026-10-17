import { PrismaClient, MemberStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

// Fixed seed and fixed reference date: every run produces the same 50 people.
faker.seed(42)
const REF_DATE = new Date('2026-10-16T00:00:00Z')

const PLANS = [
    { planName: 'Monthly', priceCents: 4900 },
    { planName: 'Annual', priceCents: 49000 },
    { planName: 'Drop-in', priceCents: 1500 },
]

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

const DEMO_PASSWORD = 'demo-password-123'

const DEMO_ACCOUNTS = [
    { name: 'Ada Admin', email: 'admin@example.com', role: 'ADMIN' },
    { name: 'Manny Manager', email: 'manager@example.com', role: 'MANAGER' },
    { name: 'Tina Trainer', email: 'trainer@example.com', role: 'TRAINER' },
    { name: 'Mia Member', email: 'member@example.com', role: 'MEMBER' },
] as const

async function seedDemoAccounts() {
    // Known passwords must never exist outside your own computer.
    if (process.env.NODE_ENV === 'production') return

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
    for (const account of DEMO_ACCOUNTS) {
        await prisma.user.upsert({
            where: { email: account.email },
            // Re-running the seed also resets the role and password of these four accounts.
            update: { role: account.role, passwordHash },
            create: { ...account, passwordHash, status: 'ACTIVE' },
        })
    }
}

async function main() {
    await prisma.gym.upsert({
        where: { id: 'main' },
        update: {},
        create: { id: 'main', name: 'Iron Peak Gym', timeZone: 'Asia/Jakarta' },
    })
    await seedDemoAccounts()

    for (let i = 0; i < 50; i++) {
        const first = faker.person.firstName()
        const last = faker.person.lastName()
        const email = `${slug(first)}.${slug(last)}${i + 1}@example.com`

        const status = faker.helpers.weightedArrayElement<MemberStatus>([
            { weight: 6, value: 'ACTIVE' },
            { weight: 1, value: 'PAUSED' },
            { weight: 2, value: 'CANCELLED' },
            { weight: 2, value: 'LEAD' },
        ])

        // Leads have not bought anything yet; everyone else has 1 or 2 memberships.
        const count = status === 'LEAD' ? 0 : faker.number.int({ min: 1, max: 2 })

        const memberships = Array.from({ length: count }, () => {
            const plan = faker.helpers.arrayElement(PLANS)
            const startDate = faker.date.past({ years: 1, refDate: REF_DATE })
            const ended = status === 'CANCELLED' || plan.planName === 'Drop-in'
            return {
                ...plan,
                startDate,
                endDate: ended ? faker.date.soon({ days: 30, refDate: startDate }) : null,
            }
        })

        // upsert on the unique email: running the seed twice does not create duplicates
        await prisma.user.upsert({
            where: { email },
            update: {},
            create: {
                name: `${first} ${last}`,
                email,
                phone: faker.datatype.boolean(0.7) ? faker.phone.number() : null,
                status,
                memberships: { create: memberships },
            },
        })
    }

    const [users, memberships] = await Promise.all([prisma.user.count(), prisma.membership.count()])
    console.log(`Seed done: ${users} members, ${memberships} memberships in the database`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())