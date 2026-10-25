import { describe, expect, it } from 'vitest'
import { gymProfileSchema } from './gym-profile'

const valid = { name: ' Zen Flow ', timeZone: 'Asia/Jakarta', brandColor: '#15803D', billingHour: '3', reminderHour: 9 }

describe('gymProfileSchema', () => {
    it('cleans up good input', () => {
        expect(gymProfileSchema.parse(valid)).toEqual({
            name: 'Zen Flow',
            timeZone: 'Asia/Jakarta',
            brandColor: '#15803d',
            billingHour: 3,
            reminderHour: 9,
        })
    })

    it('explains each bad field', () => {
        const result = gymProfileSchema.safeParse({ name: '', timeZone: 'Mars/Base', brandColor: 'green', billingHour: 24, reminderHour: 1.5 })
        expect(result.success).toBe(false)
        if (!result.success) {
            const errors = result.error.flatten().fieldErrors
            expect(Object.keys(errors).sort()).toEqual(['billingHour', 'brandColor', 'name', 'reminderHour', 'timeZone'])
        }
    })

    it('ignores fields it does not know, such as a slug or an id', () => {
        const parsed = gymProfileSchema.parse({ ...valid, slug: 'hacked', id: 'other-gym' })
        expect('slug' in parsed).toBe(false)
        expect('id' in parsed).toBe(false)
    })
})