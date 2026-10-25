import { createHash, timingSafeEqual } from 'node:crypto'

// A cron caller proves itself with "Authorization: Bearer <CRON_SECRET>".
// Both sides are hashed first so they have the same length, then compared in constant time,
// so the response time never hints at how many leading characters were right.
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
    if (!secret || secret.length < 16) return false // a missing or weak secret locks everyone out, on purpose
    if (!header?.startsWith('Bearer ')) return false
    const given = createHash('sha256').update(header.slice('Bearer '.length)).digest()
    const wanted = createHash('sha256').update(secret).digest()
    return timingSafeEqual(given, wanted)
}