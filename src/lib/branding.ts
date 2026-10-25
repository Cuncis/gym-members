// A gym picks one colour. The page turns it into two CSS variables:
//   --brand            the colour itself, for buttons and headers
//   --brand-contrast   black or white, whichever is readable on top of it

export const DEFAULT_BRAND = '#2563eb'

// Accepts "#2563EB" or "#26e"; returns "#2563eb". Anything else gives null.
export function normalizeBrandColor(input: string): string | null {
    const value = input.trim().toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(value)) return value
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    return null
}

// How bright the colour looks to a human eye (0 = black, 1 = white), using the WCAG formula.
function luminance(hex: string): number {
    const channel = (start: number) => {
        const c = parseInt(hex.slice(start, start + 2), 16) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

// Black text on light colours, white text on dark ones.
export function contrastColor(hex: string): '#000000' | '#ffffff' {
    return luminance(hex) > 0.4 ? '#000000' : '#ffffff'
}

// The value for <body style={...}>. A colour that is not valid is replaced by the default,
// so a bad row in the database can never inject anything into the page's CSS.
export function brandStyle(color: string | null | undefined): Record<string, string> {
    const brand = (color && normalizeBrandColor(color)) || DEFAULT_BRAND
    return { '--brand': brand, '--brand-contrast': contrastColor(brand) }
}