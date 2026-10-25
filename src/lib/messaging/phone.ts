// Turns what a person typed into the international format SMS providers require: +15551234567.
// Returns null when it cannot be sure, because texting a wrong number is worse than not texting.
export function normalizePhone(raw: string, defaultCountryCode = '1'): string | null {
    const trimmed = raw.trim()
    const digits = trimmed.replace(/\D/g, '')

    if (trimmed.startsWith('+')) {
        return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
    }
    // Without a "+", we only guess for the default country (the United States and Canada).
    if (defaultCountryCode === '1') {
        if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`
        if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`
    }
    return null
}