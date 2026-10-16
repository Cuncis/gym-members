import { z } from 'zod'

export const MEMBER_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED', 'LEAD'] as const

export const createMemberSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    phone: z
        .string()
        .trim()
        .max(30, 'Phone number is too long')
        .optional()
        .transform((v) => (v === '' ? undefined : v)),
    status: z.enum(MEMBER_STATUSES).default('LEAD'),
})

export const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().trim().max(100).optional(),
    // '?status=' (empty) means "no filter", not an error
    status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(MEMBER_STATUSES).optional()),
})

export type CreateMemberInput = z.infer<typeof createMemberSchema>

export type ListQuery = z.infer<typeof listQuerySchema>

export const signUpSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z
        .string()
        .min(8, 'Use at least 8 characters')
        // bcrypt only reads the first 72 bytes, so longer passwords are cut off silently.
        .refine((p) => new TextEncoder().encode(p).length <= 72, 'Use at most 72 bytes (about 72 characters)'),
})