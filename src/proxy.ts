import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Front door: is anyone signed in? Roles are NOT checked here.
// They are checked where the data is touched, in pages and API routes.
export default auth((req) => {
    if (req.auth) return NextResponse.next()

    const { pathname, search } = req.nextUrl

    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const url = new URL('/signin', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', pathname + search)
    return NextResponse.redirect(url)
})

export const config = {
    matcher: [
        '/members/:path*',
        '/api/members/:path*',
        '/classes/:path*',
        '/api/classes/:path*',
        '/schedule/:path*',
        '/api/bookings/:path*',
        '/api/schedule/:path*',
        '/api/calendar-token/:path*',
        '/admin/:path*',
    ],
}