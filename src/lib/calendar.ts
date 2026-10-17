export function calendarUrl(token: string): string {
    const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    return `${base}/api/calendar/${token}/calendar.ics`
}