import { describe, expect, it } from 'vitest'
import { isAuthorizedCron } from './cron-auth'

const secret = 'a-long-random-secret-value-1234'

describe('isAuthorizedCron', () => {
    it('accepts the right secret', () => {
        expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true)
    })

    it('rejects a wrong, missing or malformed header', () => {
        expect(isAuthorizedCron('Bearer nope', secret)).toBe(false)
        expect(isAuthorizedCron(secret, secret)).toBe(false) // no "Bearer "
        expect(isAuthorizedCron(null, secret)).toBe(false)
        expect(isAuthorizedCron('Bearer ', secret)).toBe(false)
    })

    it('locks everyone out when the secret is missing or too short, instead of letting everyone in', () => {
        expect(isAuthorizedCron('Bearer ', undefined)).toBe(false)
        expect(isAuthorizedCron('Bearer ', '')).toBe(false)
        expect(isAuthorizedCron('Bearer short', 'short')).toBe(false)
    })
})