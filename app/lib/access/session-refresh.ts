import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { buildAccessClaims } from './claims-server';
import { isAccessClaims, sameClaims, type AccessClaims } from './claims';

/**
 * Re-mint the signed-in staff member's access claims after their access changed (role edited, module switched
 * off, unit moved to / from `enforce`) — docs/COMPANY_OS_PLAN.md §7.5.
 *
 * Deliberately keeps the ORIGINAL `exp`: refreshing claims must never extend the 8-hour absolute session limit,
 * and it never touches `last_activity` (the 15-minute idle timeout). Server-only; the route handler wraps it.
 */
export type RefreshResult =
    | { status: 'no-session' }
    | { status: 'unchanged'; enforced: boolean }
    | { status: 'updated'; enforced: boolean };

export async function refreshAccessClaims(): Promise<RefreshResult> {
    const secret = process.env.JWT_SECRET;
    if (!secret) return { status: 'no-session' };

    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { status: 'no-session' };

    let payload: Record<string, unknown> & { exp?: number };
    try {
        ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret)));
    } catch {
        return { status: 'no-session' };
    }
    if (!payload.exp || typeof payload.id !== 'string') return { status: 'no-session' };

    const current: AccessClaims | null = isAccessClaims(payload) ? (payload as unknown as AccessClaims) : null;
    const next = await buildAccessClaims({ id: payload.id as string, role: payload.role as string, organization_id: payload.organization_id as string });
    if (sameClaims(current, next)) return { status: 'unchanged', enforced: !!current };

    // Rebuild the payload from the identity fields only, then attach the new claims (or none).
    const base = {
        id: payload.id, username: payload.username, role: payload.role, name: payload.name, specialty: payload.specialty,
        organization_id: payload.organization_id, organization_slug: payload.organization_slug, organization_name: payload.organization_name,
    };
    const fresh = await new SignJWT(next ? { ...base, ...next } : base)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(payload.exp) // original expiry — never extended
        .sign(new TextEncoder().encode(secret));

    cookieStore.set('session', fresh, {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') ?? false,
        sameSite: 'lax',
        maxAge: Math.max(1, payload.exp - Math.floor(Date.now() / 1000)),
        path: '/',
    });
    return { status: 'updated', enforced: !!next };
}
