import { AsyncLocalStorage } from 'node:async_hooks'

// "Which gym is this code working for?" For a web request the answer comes from the address.
// For everything else (scripts, background jobs, tests) the code says so with runInGym.
const storage = new AsyncLocalStorage<{ gymId: string }>()

export class NoGymError extends Error {
    code = 'NO_GYM'
    constructor(message: string) {
        super(message)
        this.name = 'NoGymError'
    }
}

// Everything started inside `fn`, including every await, sees `gymId`. Nested calls may switch gym.
// `await fn()` happens INSIDE the gym context on purpose: a Prisma query is lazy and only starts running when
// something awaits it, so `runInGym(id, () => db.user.findMany())` would otherwise start too late, outside the context.
export function runInGym<T>(gymId: string, fn: () => T | Promise<T>): Promise<T> {
    return storage.run({ gymId }, async () => await fn())
}

export function gymIdFromContext(): string | null {
    return storage.getStore()?.gymId ?? null
}

// True only when the signed-in person belongs to the gym whose address is being visited.
// Unknown on either side means "no".
export function sessionBelongsToGym(sessionGymId: string | undefined, gymId: string | undefined): boolean {
    return Boolean(sessionGymId) && Boolean(gymId) && sessionGymId === gymId
}