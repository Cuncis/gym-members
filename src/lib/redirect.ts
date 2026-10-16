// Only allow paths on this site: "/members" is fine, "//evil.com" and "https://evil.com" are not.
export function safeRedirect(url: string | null | undefined, fallback = '/members'): string {
    if (!url) return fallback
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return fallback
    return url
}