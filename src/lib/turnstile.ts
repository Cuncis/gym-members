export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY
    if (!secret) {
        console.error('TURNSTILE_SECRET_KEY is not set')
        return false // fail closed: no secret means nobody gets through
    }
    if (!token) return false

    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: new URLSearchParams({ secret, response: token }),
            signal: AbortSignal.timeout(5000),
        })
        const data = (await res.json()) as { success?: boolean }
        return data.success === true
    } catch {
        return false // if Cloudflare cannot be reached, reject rather than skip the check
    }
}