import { getGym, gymBaseUrl } from '@/lib/gym'

// The feed lives on the gym's own address, so the token is looked up among that gym's members only.
export async function calendarUrl(token: string): Promise<string> {
    const base = await gymBaseUrl(await getGym())
    return `${base}/api/calendar/${token}/calendar.ics`
}