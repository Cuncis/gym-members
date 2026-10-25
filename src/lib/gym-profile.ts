import { z } from 'zod'
import { normalizeBrandColor } from './branding'
import { isValidTimeZone } from './gym-clock'
import { rawDb } from './raw-db'
import { clearGymCache, getTenantGymId } from './tenant'

// What an admin may change about their own gym. The address name (slug) is not here on purpose:
// changing it would break every link and bookmark, so it stays fixed.
export const gymProfileSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone. Use a name like Asia/Jakarta'),
    brandColor: z
        .string()
        .refine((v) => normalizeBrandColor(v) !== null, 'Use a colour like #2563eb')
        .transform((v) => normalizeBrandColor(v) as string),
    billingHour: z.coerce.number().int('Whole hours only').min(0, 'Between 0 and 23').max(23, 'Between 0 and 23'),
    reminderHour: z.coerce.number().int('Whole hours only').min(0, 'Between 0 and 23').max(23, 'Between 0 and 23'),
})

export type GymProfileInput = z.infer<typeof gymProfileSchema>

// Saves the settings of the CURRENT gym. The id comes from the address or runInGym, never from the request body.
export async function updateGymProfile(input: GymProfileInput) {
    const gym = await rawDb.gym.update({ where: { id: await getTenantGymId() }, data: input })
    clearGymCache() // so the next request sees the new name and colour straight away
    return gym
}