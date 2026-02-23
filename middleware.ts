import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export function middleware(request: NextRequest) {
    const session = request.cookies.get('session')
    const lastActivity = request.cookies.get('last_activity')
    const isAuthPage = request.nextUrl.pathname === '/login'

    if (isAuthPage) return NextResponse.next()

    // No session → redirect to login
    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Session expired by inactivity
    if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity.value)
        if (elapsed > SESSION_TIMEOUT_MS) {
            const response = NextResponse.redirect(new URL('/login?reason=timeout', request.url))
            response.cookies.delete('session')
            response.cookies.delete('last_activity')
            return response
        }
    }

    // Update last activity timestamp on every request
    const response = NextResponse.next()
    response.cookies.set('last_activity', Date.now().toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    })
    return response
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api/razorpay/webhook).*)']
}
