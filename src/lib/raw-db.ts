import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { rawDb?: PrismaClient }

// The plain client. It sees every gym's data, so it is NOT exported from `db.ts` for normal use:
// import it only in the few places that must work across gyms (looking up a gym, the cron endpoint, scripts).
export const rawDb = globalForPrisma.rawDb ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.rawDb = rawDb
}