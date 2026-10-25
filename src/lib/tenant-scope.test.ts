import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CrossGymError, scopeArgs, TENANT_MODELS } from './tenant-scope'

const GYM = 'gym_a'

describe('scopeArgs: reads', () => {
    it('adds the gym to the filter', () => {
        expect(scopeArgs('findMany', { where: { status: 'ACTIVE' } }, GYM)).toEqual({ where: { status: 'ACTIVE', gymId: GYM } })
    })

    it('works when the caller passed no arguments at all', () => {
        expect(scopeArgs('findMany', undefined, GYM)).toEqual({ where: { gymId: GYM } })
        expect(scopeArgs('count', {}, GYM)).toEqual({ where: { gymId: GYM } })
    })

    it('overrides a gymId the caller put in the filter', () => {
        expect(scopeArgs('findFirst', { where: { gymId: 'gym_b' } }, GYM)).toEqual({ where: { gymId: GYM } })
    })

    it('also limits deletes', () => {
        expect(scopeArgs('deleteMany', { where: { id: 'x' } }, GYM)).toEqual({ where: { id: 'x', gymId: GYM } })
    })
})

describe('scopeArgs: writes', () => {
    it('stamps new rows with the gym', () => {
        expect(scopeArgs('create', { data: { name: 'Ana' } }, GYM)).toEqual({ data: { name: 'Ana', gymId: GYM } })
        expect(scopeArgs('createMany', { data: [{ name: 'a' }, { name: 'b' }] }, GYM)).toEqual({
            data: [
                { name: 'a', gymId: GYM },
                { name: 'b', gymId: GYM },
            ],
        })
    })

    it('accepts the right gymId and refuses any other', () => {
        expect(scopeArgs('create', { data: { gymId: GYM } }, GYM)).toEqual({ data: { gymId: GYM } })
        expect(() => scopeArgs('create', { data: { gymId: 'gym_b' } }, GYM)).toThrow(CrossGymError)
        expect(() => scopeArgs('createMany', { data: [{ name: 'ok' }, { gymId: 'gym_b' }] }, GYM)).toThrow(CrossGymError)
    })

    it('limits updates and refuses to move a row to another gym', () => {
        expect(scopeArgs('update', { where: { id: '1' }, data: { name: 'x' } }, GYM)).toEqual({
            where: { id: '1', gymId: GYM },
            data: { name: 'x' },
        })
        expect(() => scopeArgs('updateMany', { where: {}, data: { gymId: 'gym_b' } }, GYM)).toThrow(CrossGymError)
    })

    it('upsert is limited on all three sides', () => {
        const out = scopeArgs('upsert', { where: { id: '1' }, create: { name: 'n' }, update: { name: 'm' } }, GYM)
        expect(out).toEqual({ where: { id: '1', gymId: GYM }, create: { name: 'n', gymId: GYM }, update: { name: 'm' } })
        expect(() => scopeArgs('upsert', { where: { id: '1' }, create: {}, update: { gymId: 'gym_b' } }, GYM)).toThrow(CrossGymError)
    })

    it('refuses operations it does not know', () => {
        expect(() => scopeArgs('somethingNew', {}, GYM)).toThrow(/not allowed/)
    })
})

describe('TENANT_MODELS', () => {
    it('lists exactly the tables that have a gymId column', () => {
        const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
        const withGymId = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
            // GymDomain has a gymId too, but it is read across gyms on purpose (to turn an address into a gym).
            .filter((m) => /^\s+gymId\s/m.test(m[2]) && m[1] !== 'GymDomain')
            .map((m) => m[1])
            .sort()
        expect([...TENANT_MODELS].sort()).toEqual(withGymId)
    })
})