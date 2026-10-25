import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { rootHostname } from '@/lib/host'
import { decideRoute } from '@/lib/proxy-rules'

// The front door has two jobs, in this order:
//   1. Which gym is this address, and may this path be served on it? (decideRoute, no database involved)
//   2. For protected paths: is anyone signed in? (the check from Project 4; roles are still checked in pages and routes)
export default auth((req) => {
    const decision = decideRoute({
        host: req.headers.get('host'),
        pathname: req.nextUrl.pathname,
        rootHostname: rootHostname(),
    })

    switch (decision.action) {
        case 'notFound':
            // Rewriting to a page that does not exist makes Next.js render its normal 404 page.
            return NextResponse.rewrite(new URL('/404', req.url), { status: 404 })

        case 'rewrite': {
            const url = req.nextUrl.clone()
            url.pathname = decision.to
            return NextResponse.rewrite(url)
        }

        case 'signIn': {
            if (req.auth) return NextResponse.next()

            const { pathname, search } = req.nextUrl
            if (pathname.startsWith('/api/')) {
                return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
            }
            const url = new URL('/signin', req.nextUrl.origin)
            url.searchParams.set('callbackUrl', pathname + search)
            return NextResponse.redirect(url)
        }

        case 'next':
            return NextResponse.next()
    }
})

export const config = {
    // Everything except files that never change.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt)$).*)'],
}