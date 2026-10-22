/**
 * Token + device-session layer for the HR mobile app (`/api/v1`).
 *
 *  - Access token: short-lived JWT (30 min), signed with a key DERIVED from JWT_SECRET so it can never be
 *    replayed as a web `session` cookie (and web cookies are not valid here).
 *  - Refresh token: 256-bit random, stored only as a SHA-256 hash in `mobile_sessions`, rotated on every use.
 *    Presenting a rotated-out token revokes the whole session (the phone or the token was copied).
 *  - Revoking a row (logout, HR, password change, user disabled) kills the session at the next API call.
 *
 * Uses the raw `prisma` client on purpose: this is auth plumbing keyed by user, like the web login action.
 */

import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/backend/db';
import { validateServerEnv } from '@/app/lib/env';
import { isAccessClaims } from '@/app/lib/access/claims';
import type { SessionData } from '@/app/lib/session';

validateServerEnv();

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

const ACCESS_KEY = new TextEncoder().encode(`${process.env.JWT_SECRET}::hr-mobile-access`);
const MFA_KEY = new TextEncoder().encode(`${process.env.JWT_SECRET}::hr-mobile-mfa`);

export const ACCESS_TTL_SECONDS = 30 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MFA_TTL_SECONDS = 5 * 60;

export interface DeviceInfo {
    deviceId: string;
    deviceName?: string | null;
    platform?: string | null;
    appVersion?: string | null;
}

export interface LoginLocation {
    lat: number;
    lng: number;
    accuracy?: number | null;
}

export interface MobileTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    sessionId: string;
}

export class MobileAuthError extends Error {
    constructor(message: string, public code: 'invalid_token' | 'revoked' | 'expired' | 'user_disabled' | 'stale') {
        super(message);
        this.name = 'MobileAuthError';
    }
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const newRefreshToken = () => randomBytes(32).toString('base64url');

async function loadClaims(base: SessionData) {
    try {
        const { buildAccessClaims } = await import('@/app/lib/access/claims-server');
        return await buildAccessClaims({ id: base.id, role: base.role, organization_id: base.organization_id });
    } catch {
        return null;
    }
}

async function signAccess(base: SessionData, sessionId: string): Promise<string> {
    const { access: _ignored, ...rest } = base;
    const claims = await loadClaims(base);
    return new SignJWT({ ...rest, ...(claims ?? {}), typ: 'mobile_access', sid: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
        .sign(ACCESS_KEY);
}

/** Verify an access token; returns the same SessionData shape `getSession()` yields for a cookie. */
export async function verifyAccessToken(token: string): Promise<{ session: SessionData; sessionId: string }> {
    let payload: Record<string, any>;
    try {
        ({ payload } = await jwtVerify(token, ACCESS_KEY));
    } catch (e: any) {
        throw new MobileAuthError(e?.code === 'ERR_JWT_EXPIRED' ? 'Access token expired' : 'Invalid token',
            e?.code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid_token');
    }
    if (payload.typ !== 'mobile_access' || typeof payload.sid !== 'string' || !payload.id) {
        throw new MobileAuthError('Invalid token', 'invalid_token');
    }
    const session: SessionData = {
        id: String(payload.id),
        username: String(payload.username ?? ''),
        role: String(payload.role ?? ''),
        name: String(payload.name ?? ''),
        specialty: (payload.specialty as string) || null,
        organization_id: String(payload.organization_id ?? ''),
        organization_slug: String(payload.organization_slug ?? ''),
        organization_name: String(payload.organization_name ?? ''),
        ...(isAccessClaims(payload)
            ? { access: { cid: (payload.cid as string | null) ?? null, eid: (payload.eid as number | null) ?? null, mods: payload.mods as string[], mv: payload.mv as string, ae: 'enforce' as const } }
            : {}),
    };
    return { session, sessionId: payload.sid };
}

/**
 * Per-request check that the device session is still alive and the user is unchanged. A role change makes the
 * token `stale` (the app silently refreshes, which re-reads the role); a disabled user or revoked row is final.
 */
export async function assertSessionActive(session: SessionData, sessionId: string): Promise<void> {
    const row = await prisma.mobileSession.findUnique({
        where: { id: sessionId },
        select: {
            user_id: true, revoked_at: true, expires_at: true,
            user: { select: { is_active: true, role: true } },
        },
    });
    if (!row || row.user_id !== session.id) throw new MobileAuthError('Session not found', 'invalid_token');
    if (row.revoked_at) throw new MobileAuthError('This device was signed out', 'revoked');
    if (row.expires_at < new Date()) throw new MobileAuthError('Session expired', 'expired');
    if (row.user.is_active === false) throw new MobileAuthError('Account is disabled', 'user_disabled');
    if (row.user.role !== session.role) throw new MobileAuthError('Your access changed', 'stale');
}

/** Create a device session after credentials (and MFA, if any) are verified. */
export async function startMobileSession(
    base: SessionData,
    device: DeviceInfo,
    opts: { location?: LoginLocation | null; ip?: string | null },
): Promise<MobileTokens> {
    // One live session per physical device: a fresh login replaces the previous one.
    await prisma.mobileSession.updateMany({
        where: { user_id: base.id, device_id: device.deviceId, revoked_at: null },
        data: { revoked_at: new Date(), revoked_reason: 'replaced_by_new_login' },
    });
    // Housekeeping: drop long-dead rows for this user.
    await prisma.mobileSession.deleteMany({
        where: { user_id: base.id, OR: [{ expires_at: { lt: new Date(Date.now() - 30 * 86400000) } }, { revoked_at: { lt: new Date(Date.now() - 30 * 86400000) } }] },
    });

    const refreshToken = newRefreshToken();
    const row = await prisma.mobileSession.create({
        data: {
            user_id: base.id,
            org_id: base.organization_id,
            device_id: device.deviceId,
            device_name: device.deviceName?.slice(0, 100) || null,
            platform: device.platform?.slice(0, 20) || null,
            app_version: device.appVersion?.slice(0, 30) || null,
            refresh_hash: hashToken(refreshToken),
            login_lat: opts.location?.lat ?? null,
            login_lng: opts.location?.lng ?? null,
            login_accuracy_m: opts.location?.accuracy ?? null,
            login_ip: opts.ip?.slice(0, 64) || null,
            expires_at: new Date(Date.now() + REFRESH_TTL_MS),
        },
        select: { id: true },
    });
    return { accessToken: await signAccess(base, row.id), refreshToken, expiresIn: ACCESS_TTL_SECONDS, sessionId: row.id };
}

/** Exchange a refresh token for a new pair. Re-reads the user so role/active changes take effect here. */
export async function rotateMobileSession(refreshToken: string, deviceId: string): Promise<MobileTokens> {
    const hash = hashToken(refreshToken);
    const row = await prisma.mobileSession.findFirst({
        where: { OR: [{ refresh_hash: hash }, { prev_refresh_hash: hash }] },
        include: { user: true },
    });
    if (!row) throw new MobileAuthError('Invalid refresh token', 'invalid_token');

    if (row.revoked_at) throw new MobileAuthError('This device was signed out', 'revoked');
    if (row.device_id !== deviceId) {
        await revokeMobileSession(row.id, 'device_mismatch');
        throw new MobileAuthError('Invalid refresh token', 'revoked');
    }
    if (row.prev_refresh_hash === hash && row.refresh_hash !== hash) {
        // A token that was already rotated out is being replayed.
        await revokeMobileSession(row.id, 'refresh_reuse_detected');
        throw new MobileAuthError('Session revoked for security. Please sign in again.', 'revoked');
    }
    if (row.expires_at < new Date()) throw new MobileAuthError('Session expired. Please sign in again.', 'expired');
    if (row.user.is_active === false) throw new MobileAuthError('Account is disabled', 'user_disabled');

    const org = await prisma.organization.findUnique({ where: { id: row.user.organizationId } });
    if (!org || !org.is_active) throw new MobileAuthError('Organization is inactive', 'user_disabled');

    const next = newRefreshToken();
    // Compare-and-swap on the current hash so two concurrent refreshes cannot both win.
    const swapped = await prisma.mobileSession.updateMany({
        where: { id: row.id, refresh_hash: hash, revoked_at: null },
        data: {
            refresh_hash: hashToken(next), prev_refresh_hash: hash,
            last_used_at: new Date(), expires_at: new Date(Date.now() + REFRESH_TTL_MS),
        },
    });
    if (swapped.count !== 1) throw new MobileAuthError('Refresh token already used', 'invalid_token');

    const base = sessionDataFor(row.user, org);
    return { accessToken: await signAccess(base, row.id), refreshToken: next, expiresIn: ACCESS_TTL_SECONDS, sessionId: row.id };
}

export async function revokeMobileSession(sessionId: string, reason: string) {
    await prisma.mobileSession.updateMany({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: new Date(), revoked_reason: reason },
    });
}

export async function revokeAllMobileSessionsForUser(userId: string, reason: string) {
    await prisma.mobileSession.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date(), revoked_reason: reason },
    });
}

export function sessionDataFor(
    user: { id: string; username: string; role: string; name: string | null; specialty: string | null },
    org: { id: string; slug: string; name: string },
): SessionData {
    return {
        id: user.id, username: user.username, role: user.role, name: user.name || '', specialty: user.specialty || null,
        organization_id: org.id, organization_slug: org.slug, organization_name: org.name,
    };
}

// ── MFA step ────────────────────────────────────────────────────────────────

export interface MfaPending {
    session: SessionData;
    device: DeviceInfo;
    location: LoginLocation | null;
    ip: string | null;
}

export async function signMfaToken(p: MfaPending): Promise<string> {
    return new SignJWT({ ...p, typ: 'mobile_mfa' } as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${MFA_TTL_SECONDS}s`)
        .sign(MFA_KEY);
}

export async function verifyMfaToken(token: string): Promise<MfaPending> {
    try {
        const { payload } = await jwtVerify(token, MFA_KEY);
        if (payload.typ !== 'mobile_mfa') throw new Error('bad typ');
        return payload as unknown as MfaPending;
    } catch {
        throw new MobileAuthError('MFA session expired. Please sign in again.', 'expired');
    }
}
