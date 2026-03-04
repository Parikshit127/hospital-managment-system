import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Route -> allowed roles
const ROLE_ROUTES: Record<string, string[]> = {
    '/admin': ['admin'],
    '/doctor': ['admin', 'doctor'],
    '/reception': ['admin', 'receptionist'],
    '/lab': ['admin', 'lab_technician'],
    '/pharmacy': ['admin', 'pharmacist'],
    '/finance': ['admin', 'finance'],
    '/ipd': ['admin', 'ipd_manager'],
    '/discharge': ['admin', 'ipd_manager', 'doctor'],
    '/opd': ['admin', 'receptionist', 'doctor', 'opd_manager'],
    '/insurance': ['admin', 'finance'],
    // Phase 3 roles
    '/nurse': ['admin', 'nurse'],
    '/opd-manager': ['admin', 'opd_manager'],
    '/hr': ['admin', 'hr'],
};

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Super Admin routes — separate auth
    if (pathname.startsWith('/superadmin')) {
        const isLoginPage = pathname === '/superadmin/login';
        const saSession = request.cookies.get('superadmin_session');

        if (!saSession && !isLoginPage) {
            return NextResponse.redirect(new URL('/superadmin/login', request.url));
        }
        if (saSession && isLoginPage) {
            try {
                await jwtVerify(saSession.value, JWT_SECRET);
                return NextResponse.redirect(new URL('/superadmin', request.url));
            } catch {
                const response = NextResponse.next();
                response.cookies.delete('superadmin_session');
                return response;
            }
        }
        if (saSession && !isLoginPage) {
            try {
                await jwtVerify(saSession.value, JWT_SECRET);
                return NextResponse.next();
            } catch {
                const response = NextResponse.redirect(new URL('/superadmin/login', request.url));
                response.cookies.delete('superadmin_session');
                return response;
            }
        }
        return NextResponse.next();
    }

    // 2. Patient portal — separate auth
    if (pathname.startsWith('/patient')) {
        const isPatientAuthPage = pathname.startsWith('/patient/login');
        // Allow public assessment pages without auth
        if (pathname.startsWith('/patient/assessment/')) {
            return NextResponse.next();
        }
        const patientSession = request.cookies.get('patient_session');

        if (!isPatientAuthPage && !patientSession) {
            return NextResponse.redirect(new URL('/patient/login', request.url));
        }
        if (isPatientAuthPage && patientSession) {
            return NextResponse.redirect(new URL('/patient/dashboard', request.url));
        }
        return NextResponse.next();
    }

    // 3. Public pages (no auth required)
    if (pathname === '/opd/display') {
        return NextResponse.next();
    }

    // 4. Staff auth
    const session = request.cookies.get('session');
    const isAuthPage = pathname === '/login';

    if (!session && !isAuthPage) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!session && isAuthPage) {
        return NextResponse.next();
    }

    // 5. Verify JWT
    try {
        const { payload } = await jwtVerify(session!.value, JWT_SECRET);

        // If logged in and trying to access login page, redirect to dashboard
        if (isAuthPage) {
            const role = payload.role as string;
            const redirectMap: Record<string, string> = {
                receptionist: '/reception',
                doctor: '/doctor/dashboard',
                lab_technician: '/lab/technician',
                pharmacist: '/pharmacy/billing',
                admin: '/admin/dashboard',
                finance: '/finance/dashboard',
                ipd_manager: '/ipd',
                nurse: '/nurse/dashboard',
                opd_manager: '/opd-manager/dashboard',
                hr: '/hr/dashboard',
            };
            return NextResponse.redirect(new URL(redirectMap[role] || '/', request.url));
        }

        // 6. Role-based route protection
        for (const [routePrefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
            if (pathname.startsWith(routePrefix)) {
                if (!allowedRoles.includes(payload.role as string)) {
                    return NextResponse.redirect(new URL('/login?reason=unauthorized', request.url));
                }
                break;
            }
        }

        // 7. Session timeout check
        const lastActivity = request.cookies.get('last_activity');
        if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity.value);
            if (elapsed > SESSION_TIMEOUT_MS) {
                const response = NextResponse.redirect(new URL('/login?reason=timeout', request.url));
                response.cookies.delete('session');
                response.cookies.delete('last_activity');
                return response;
            }
        }

        // 8. Update last activity
        const response = NextResponse.next();
        response.cookies.set('last_activity', Date.now().toString(), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });
        return response;
    } catch {
        // Invalid JWT — clear and redirect
        if (isAuthPage) return NextResponse.next();
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('session');
        response.cookies.delete('last_activity');
        return response;
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api/razorpay/webhook|api/session|api/org-lookup|api/health).*)'],
};
