import { Prisma } from '@prisma/client'
import { getTenantGymId } from './tenant'

// Every model that has a `gymId` column. A test (tenant-scope.test.ts) compares this list with schema.prisma,
// so adding a table and forgetting to list it here fails the build.
export const TENANT_MODELS: ReadonlySet<string> = new Set([
    'User',
    'Membership',
    'MembershipPlan',
    'Discount',
    'BillingEvent',
    'Payment',
    'Refund',
    'Notification',
    'GymClass',
    'GymClassInstance',
    'GymClassBooking',
    'PasswordResetToken',
])

export class CrossGymError extends Error {
    constructor() {
        super('A write tried to use a different gym than the current one.')
        this.name = 'CrossGymError'
    }
}

type Json = Record<string, unknown>

// A caller may leave gymId out, or repeat the right one. Any other value is a bug (or an attack).
function withGym(data: Json | undefined, gymId: string): Json {
    if (data && 'gymId' in data && data.gymId !== undefined && data.gymId !== gymId) throw new CrossGymError()
    return { ...data, gymId }
}

function withoutOtherGym(data: Json | undefined, gymId: string): Json | undefined {
    if (data && 'gymId' in data && data.gymId !== undefined && data.gymId !== gymId) throw new CrossGymError()
    return data
}

// Rewrites the arguments of one query so it can only touch `gymId`'s rows. Pure, so it can be tested without a database.
export function scopeArgs(operation: string, args: Json | undefined, gymId: string): Json {
    const a: Json = { ...args }
    switch (operation) {
        // Reads and deletes: add the gym to the filter. Spread order matters: ours comes last and wins.
        case 'findUnique':
        case 'findUniqueOrThrow':
        case 'findFirst':
        case 'findFirstOrThrow':
        case 'findMany':
        case 'count':
        case 'aggregate':
        case 'groupBy':
        case 'delete':
        case 'deleteMany':
            a.where = { ...(a.where as Json), gymId }
            return a
        // Updates: filter by gym, and refuse to move a row to another gym.
        case 'update':
        case 'updateMany':
        case 'updateManyAndReturn':
            a.where = { ...(a.where as Json), gymId }
            a.data = withoutOtherGym(a.data as Json, gymId)
            return a
        case 'create':
            a.data = withGym(a.data as Json, gymId)
            return a
        case 'createMany':
        case 'createManyAndReturn': {
            const rows = a.data as Json | Json[]
            a.data = Array.isArray(rows) ? rows.map((row) => withGym(row, gymId)) : withGym(rows, gymId)
            return a
        }
        case 'upsert':
            a.where = { ...(a.where as Json), gymId }
            a.create = withGym(a.create as Json, gymId)
            a.update = withoutOtherGym(a.update as Json, gymId)
            return a
        default:
            // Anything we have not thought about is refused, not passed through.
            throw new Error(`Operation "${operation}" is not allowed on a gym-scoped table`)
    }
}

export const tenantExtension = Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                // Gym, GymDomain, WebhookEvent and the sign-in tables are not per-gym rows.
                if (!TENANT_MODELS.has(model)) return query(args)
                const gymId = await getTenantGymId()
                return query(scopeArgs(operation, args as Json, gymId) as typeof args)
            },
        },
    },
})