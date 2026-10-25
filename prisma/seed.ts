import { faker } from '@faker-js/faker'
import bcrypt from 'bcryptjs'
import type { MemberStatus, Role } from '@prisma/client'
import { generateInstances } from '../src/lib/classes'
import { db } from '../src/lib/db'
import { rawDb } from '../src/lib/raw-db'
import { runInGym } from '../src/lib/tenant-context'

// Two demo gyms in one database. Everything below runs once per gym, inside that gym.
// Emails are unique across the whole platform (one account belongs to one gym), so each gym has its own email domain.
const GYMS = [
    {
        slug: 'gyma',
        name: 'Iron Peak Gym',
        timeZone: 'Asia/Jakarta',
        brandColor: '#2563eb',
        emailDomain: 'example.com', // the demo accounts from Project 4 live here
        fakerSeed: 42, // the same 50 people as in Project 3
        memberCount: 50,
        plans: [
            { name: 'Monthly', description: 'Unlimited access, billed every month', priceCents: 4900, kind: 'RECURRING', interval: 'MONTH' },
            { name: 'Annual', description: 'Unlimited access, billed once a year', priceCents: 49000, kind: 'RECURRING', interval: 'YEAR' },
            { name: 'Day pass', description: 'One day of access, paid once', priceCents: 1500, kind: 'ONE_TIME', durationDays: 1 },
        ],
        classes: [] as { name: string; dayOfWeek: number; startTime: string; durationMinutes: number; capacity: number }[],
    },
    {
        slug: 'gymb',
        name: 'Zen Flow Studio',
        timeZone: 'America/New_York',
        brandColor: '#15803d',
        emailDomain: 'zenflow.test',
        fakerSeed: 43,
        memberCount: 12,
        plans: [
            { name: 'Unlimited', description: 'All classes, billed every month', priceCents: 8900, kind: 'RECURRING', interval: 'MONTH' },
            { name: 'Drop-in class', description: 'One class, paid once', priceCents: 2500, kind: 'ONE_TIME', durationDays: 1 },
        ],
        classes: [
            { name: 'Sunrise Yoga', dayOfWeek: 2, startTime: '07:00', durationMinutes: 60, capacity: 14 },
            { name: 'Evening Pilates', dayOfWeek: 4, startTime: '18:30', durationMinutes: 50, capacity: 10 },
        ],
    },
] as const

type GymSpec = (typeof GYMS)[number]

const DEMO_PASSWORD = 'demo-password-123'
const REF_DATE = new Date('2026-10-16T00:00:00Z')
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const MEMBERSHIP_PLANS = [
    { planName: 'Monthly', priceCents: 4900 },
    { planName: 'Annual', priceCents: 49000 },
    { planName: 'Drop-in', priceCents: 1500 },
]

async function seedDemoAccounts(spec: GymSpec) {
    // Known passwords must never exist outside your own computer.
    if (process.env.NODE_ENV === 'production') return

    const accounts: { name: string; role: Role }[] = [
        { name: 'Ada Admin', role: 'ADMIN' },
        { name: 'Manny Manager', role: 'MANAGER' },
        { name: 'Tina Trainer', role: 'TRAINER' },
        { name: 'Mia Member', role: 'MEMBER' },
    ]
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
    for (const account of accounts) {
        const email = `${account.role.toLowerCase()}@${spec.emailDomain}`
        const existing = await db.user.findUnique({ where: { email } })
        if (existing) {
            // Re-running the seed resets the role and password of these accounts.
            await db.user.update({ where: { id: existing.id }, data: { role: account.role, passwordHash } })
        } else {
            await db.user.create({ data: { ...account, email, passwordHash, status: 'ACTIVE' } })
        }
    }
}

async function seedBilling(spec: GymSpec) {
    for (const plan of spec.plans) {
        // Plans have no unique name, so look before creating: running the seed twice makes no duplicates.
        if (!(await db.membershipPlan.findFirst({ where: { name: plan.name } }))) {
            await db.membershipPlan.create({ data: plan })
        }
    }

    const discounts = [
        { code: 'WELCOME10', type: 'PERCENT', value: 10 },
        { code: 'SAVE5', type: 'FIXED', value: 500, maxRedemptions: 3 },
        { code: 'OLDDEAL', type: 'PERCENT', value: 20, expiresAt: new Date('2025-01-01T00:00:00Z') },
        { code: 'BIG100', type: 'PERCENT', value: 100 },
    ] as const
    for (const discount of discounts) {
        // The same code can exist in both gyms: it is unique per gym. Existing ones are left alone,
        // so running the seed again never resets how many times a code was used.
        if (!(await db.discount.findFirst({ where: { code: discount.code } }))) {
            await db.discount.create({ data: discount })
        }
    }
}

async function seedMembers(spec: GymSpec) {
    faker.seed(spec.fakerSeed)
    for (let i = 0; i < spec.memberCount; i++) {
        const first = faker.person.firstName()
        const last = faker.person.lastName()
        const email = `${slug(first)}.${slug(last)}${i + 1}@${spec.emailDomain}`

        const status = faker.helpers.weightedArrayElement<MemberStatus>([
            { weight: 6, value: 'ACTIVE' },
            { weight: 1, value: 'PAUSED' },
            { weight: 2, value: 'CANCELLED' },
            { weight: 2, value: 'LEAD' },
        ])
        const count = status === 'LEAD' ? 0 : faker.number.int({ min: 1, max: 2 })
        const memberships = Array.from({ length: count }, () => {
            const plan = faker.helpers.arrayElement(MEMBERSHIP_PLANS)
            const startDate = faker.date.past({ years: 1, refDate: REF_DATE })
            const ended = status === 'CANCELLED' || plan.planName === 'Drop-in'
            return { ...plan, startDate, endDate: ended ? faker.date.soon({ days: 30, refDate: startDate }) : null }
        })
        const phone = faker.datatype.boolean(0.7) ? faker.phone.number() : null

        // Running the seed twice does not create duplicates.
        if (await db.user.findUnique({ where: { email } })) continue

        const user = await db.user.create({ data: { name: `${first} ${last}`, email, phone, status } })
        // Related rows get their own create: a nested `memberships: { create }` would skip the gym filter.
        if (memberships.length > 0) {
            await db.membership.createMany({ data: memberships.map((m) => ({ ...m, userId: user.id })) })
        }
    }
}

async function seedClasses(spec: GymSpec) {
    const trainer = await db.user.findFirst({ where: { role: 'TRAINER' } })
    for (const c of spec.classes) {
        if (await db.gymClass.findFirst({ where: { name: c.name } })) continue
        const created = await db.gymClass.create({ data: { ...c, trainerId: trainer?.id ?? null } })
        await generateInstances(created.id)
    }
}

async function main() {
    for (const spec of GYMS) {
        // The gym itself is not gym-owned data, so it is created with the plain client. Existing settings are kept.
        const gym = await rawDb.gym.upsert({
            where: { slug: spec.slug },
            update: {},
            create: { slug: spec.slug, name: spec.name, timeZone: spec.timeZone, brandColor: spec.brandColor },
        })

        await runInGym(gym.id, async () => {
            await seedDemoAccounts(spec)
            await seedBilling(spec)
            await seedMembers(spec)
            await seedClasses(spec)

            const [users, memberships, plans] = await Promise.all([db.user.count(), db.membership.count(), db.membershipPlan.count()])
            console.log(`${gym.name} (${gym.slug}): ${users} people, ${memberships} memberships, ${plans} plans`)
        })
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => rawDb.$disconnect())