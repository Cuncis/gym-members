import { describe, expect, it } from 'vitest'
import { generateToken, hashToken } from './tokens'

describe('tokens', () => {
    it('generates long, unique tokens', () => {
        const a = generateToken()
        const b = generateToken()
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        expect(a).not.toBe(b)
    })

    it('hashes the same token to the same value, and never stores the token itself', () => {
        const token = generateToken()
        expect(hashToken(token)).toBe(hashToken(token))
        expect(hashToken(token)).not.toBe(token)
        expect(hashToken(token)).not.toBe(hashToken(generateToken()))
    })
})