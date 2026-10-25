import { randomBytes } from 'node:crypto'
import { promises as dns } from 'node:dns'
import type { GymDomain } from '@prisma/client'
import { parseHost, rootHostname } from './host'
import { rawDb } from './raw-db'
import { clearGymCache, getTenantGymId } from './tenant'

// ---------- pure helpers ----------

// A domain name: dot separated labels of 1 to 63 letters, digits and hyphens, ending in letters ("com", "co.id").
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type DomainInput = { ok: true; hostname: string } | { ok: false; error: string }

// "https://Members.IronPeak.com/join?x=1" -> "members.ironpeak.com". Refuses everything that is not a domain you could own.
export function parseDomainInput(input: string, root = rootHostname()): DomainInput {
    const hostname = input
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '') // a pasted address: remove "https://"
        .replace(/[/?#].*$/, '') // ...and everything after the name
        .replace(/:\d{1,5}$/, '') // ...and the port
        .replace(/\.$/, '')

    const labels = hostname.split('.')
    if (labels.length < 2 || hostname.length > 253 || !labels.every((label) => LABEL.test(label))) {
        return { ok: false, error: 'Enter a domain name such as members.yourgym.com' }
    }
    if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
        return { ok: false, error: 'Enter a domain name such as members.yourgym.com' }
    }
    // Names under our own domain are handed out as slugs, never as custom domains.
    if (hostname === root || hostname.endsWith(`.${root}`) || parseHost(hostname, root).kind !== 'custom') {
        return { ok: false, error: `Use a domain you own, not one ending in ${root}` }
    }
    return { ok: true, hostname }
}

// The proof of ownership: a TXT record that only the owner of the domain's DNS can create.
const RECORD_LABEL = '_fitnessgm-verify'
export const verifyRecordName = (hostname: string) => `${RECORD_LABEL}.${hostname}`
export const verifyRecordValue = (token: string) => `fitnessgm-verify=${token}`
export const newVerifyToken = () => randomBytes(16).toString('hex')

export type TxtResolver = (name: string) => Promise<string[][]>
export type OwnershipResult = { ok: true } | { ok: false; reason: 'no_record' | 'wrong_value' | 'lookup_failed' }

// `resolve` is injectable so tests never touch the network.
export async function checkOwnership(
    hostname: string,
    token: string,
    resolve: TxtResolver = dns.resolveTxt,
): Promise<OwnershipResult> {
    let records: string[][]
    try {
        records = await resolve(verifyRecordName(hostname))
    } catch (error) {
        const code = (error as { code?: string }).code
        return { ok: false, reason: code === 'ENOTFOUND' || code === 'ENODATA' ? 'no_record' : 'lookup_failed' }
    }
    // A long TXT value arrives cut into pieces; join each record's pieces before comparing.
    const values = records.map((chunks) => chunks.join(''))
    if (values.length === 0) return { ok: false, reason: 'no_record' }
    return values.includes(verifyRecordValue(token)) ? { ok: true } : { ok: false, reason: 'wrong_value' }
}

// ---------- database operations (always for the CURRENT gym) ----------

export type AddResult = { ok: true; domain: GymDomain } | { ok: false; error: string }

export async function addDomain(input: string): Promise<AddResult> {
    const parsed = parseDomainInput(input)
    if (!parsed.ok) return parsed
    const gymId = await getTenantGymId()

    try {
        const domain = await rawDb.$transaction(async (tx) => {
            const existing = await tx.gymDomain.findUnique({ where: { hostname: parsed.hostname } })
            if (existing) {
                if (existing.gymId === gymId) return existing // already added by this gym
                if (existing.verifiedAt) return null // proven to belong to another gym
                // Someone else only CLAIMED it and never proved it. The real owner can still prove it, so theirs replaces the claim.
                await tx.gymDomain.delete({ where: { id: existing.id } })
            }
            return tx.gymDomain.create({ data: { gymId, hostname: parsed.hostname, verifyToken: newVerifyToken() } })
        })
        if (!domain) return { ok: false, error: 'This domain already belongs to another gym' }
        return { ok: true, domain }
    } catch {
        // Two requests added the same name at the same moment.
        return { ok: false, error: 'Could not add this domain. Please try again.' }
    }
}

export async function listDomains(): Promise<GymDomain[]> {
    return rawDb.gymDomain.findMany({ where: { gymId: await getTenantGymId() }, orderBy: { createdAt: 'asc' } })
}

export type VerifyResult = OwnershipResult | { ok: false; reason: 'not_found' }

export async function verifyDomain(id: string, resolve?: TxtResolver): Promise<VerifyResult> {
    // `gymId` in the filter is what stops one gym from verifying (or even seeing) another gym's domain row.
    const domain = await rawDb.gymDomain.findFirst({ where: { id, gymId: await getTenantGymId() } })
    if (!domain) return { ok: false, reason: 'not_found' }
    if (domain.verifiedAt) return { ok: true }

    const result = await checkOwnership(domain.hostname, domain.verifyToken, resolve)
    if (result.ok) {
        await rawDb.gymDomain.update({ where: { id: domain.id }, data: { verifiedAt: new Date() } })
        clearGymCache()
    }
    return result
}

export async function removeDomain(id: string): Promise<boolean> {
    const { count } = await rawDb.gymDomain.deleteMany({ where: { id, gymId: await getTenantGymId() } })
    clearGymCache()
    return count > 0
}