import { Prisma } from '@prisma/client'
import { rawDb } from './raw-db'
import { getTenantGymId } from './tenant'
import { tenantExtension } from './tenant-scope'

// The client the whole app uses. Every query on a gym-owned table is limited to the current gym,
// and fails (instead of guessing) when there is no current gym.
export const db = rawDb.$extends(tenantExtension)

// The type of `tx` inside db.$transaction(async (tx) => ...), for functions that receive it as a parameter.
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// Raw SQL is NOT filtered by the extension, so any raw query on a gym-owned table must name the gym itself.
// This is the one place that does it: it locks one row (until the transaction ends) and says whether it exists.
// A row of another gym answers "no", exactly like a row that does not exist.
// `table` is one of four fixed names from our own code, never user input.
export async function lockRow(
    tx: Tx,
    table: 'BillingEvent' | 'Membership' | 'Payment' | 'GymClassInstance',
    id: string,
): Promise<boolean> {
    const gymId = await getTenantGymId()
    const rows = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${Prisma.raw(`\`${table}\``)} WHERE id = ${id} AND gymId = ${gymId} FOR UPDATE`,
    )
    return rows.length > 0
}