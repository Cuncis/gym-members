import { describe, expect, it } from 'vitest'
import { checkOwnership, parseDomainInput, verifyRecordName, verifyRecordValue } from './domains'

describe('parseDomainInput', () => {
    it('turns a pasted address into a plain domain', () => {
        expect(parseDomainInput('https://Members.IronPeak.com/join?x=1', 'localhost')).toEqual({ ok: true, hostname: 'members.ironpeak.com' })
        expect(parseDomainInput('ironpeak.com:8080', 'localhost')).toEqual({ ok: true, hostname: 'ironpeak.com' })
        expect(parseDomainInput('gym.co.id.', 'localhost')).toEqual({ ok: true, hostname: 'gym.co.id' })
    })

    it('refuses things that are not domains', () => {
        for (const bad of ['', 'localhost', 'ironpeak', 'a b.com', '-x.com', 'x-.com', 'ironpeak.123', '127.0.0.1', '*.ironpeak.com', 'a..com']) {
            expect(parseDomainInput(bad, 'localhost').ok, bad).toBe(false)
        }
    })

    it('refuses names under our own domain', () => {
        expect(parseDomainInput('gyma.fitnessgm.app', 'fitnessgm.app').ok).toBe(false)
        expect(parseDomainInput('fitnessgm.app', 'fitnessgm.app').ok).toBe(false)
        expect(parseDomainInput('notfitnessgm.app', 'fitnessgm.app').ok).toBe(true)
    })
})

describe('checkOwnership', () => {
    const token = 'abc123'
    const name = verifyRecordName('members.ironpeak.com')
    const good = verifyRecordValue(token)

    it('looks in the right place', () => {
        expect(name).toBe('_fitnessgm-verify.members.ironpeak.com')
    })

    it('accepts the right record, even among others and even when split in pieces', async () => {
        expect(await checkOwnership('members.ironpeak.com', token, async () => [['v=spf1 -all'], [good]])).toEqual({ ok: true })
        expect(await checkOwnership('members.ironpeak.com', token, async () => [[good.slice(0, 10), good.slice(10)]])).toEqual({ ok: true })
    })

    it('refuses a wrong value', async () => {
        expect(await checkOwnership('members.ironpeak.com', token, async () => [['fitnessgm-verify=other']])).toEqual({ ok: false, reason: 'wrong_value' })
    })

    it('tells "no record" apart from "the lookup broke"', async () => {
        const missing = Object.assign(new Error('x'), { code: 'ENOTFOUND' })
        const noData = Object.assign(new Error('x'), { code: 'ENODATA' })
        const broken = Object.assign(new Error('x'), { code: 'ETIMEOUT' })
        expect(await checkOwnership('a.com', token, async () => { throw missing })).toEqual({ ok: false, reason: 'no_record' })
        expect(await checkOwnership('a.com', token, async () => { throw noData })).toEqual({ ok: false, reason: 'no_record' })
        expect(await checkOwnership('a.com', token, async () => { throw broken })).toEqual({ ok: false, reason: 'lookup_failed' })
    })
})