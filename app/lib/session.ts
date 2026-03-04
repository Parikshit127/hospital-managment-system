'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export interface SessionData {
    id: string;
    username: string;
    role: string;
    name: string;
    specialty: string | null;
    organization_id: string;
    organization_slug: string;
    organization_name: string;
}

export interface SuperAdminSessionData {
    id: string;
    email: string;
    name: string;
    role: 'superadmin';
}

export async function createSession(data: SessionData): Promise<void> {
    const token = await new SignJWT(data as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('8h')
        .setIssuedAt()
        .sign(JWT_SECRET);

    const cookieStore = await cookies();
    cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8,
        path: '/',
    });

    cookieStore.set('last_activity', Date.now().toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
}

export async function getSession(): Promise<SessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('session')?.value;
        if (!token) return null;

        const { payload } = await jwtVerify(token, JWT_SECRET);
        return {
            id: (payload.id as string) || '',
            username: (payload.username as string) || '',
            role: (payload.role as string) || '',
            name: (payload.name as string) || '',
            specialty: (payload.specialty as string) || null,
            organization_id: (payload.organization_id as string) || '',
            organization_slug: (payload.organization_slug as string) || '',
            organization_name: (payload.organization_name as string) || '',
        };
    } catch {
        return null;
    }
}

export async function createSuperAdminSession(data: SuperAdminSessionData): Promise<void> {
    const token = await new SignJWT(data as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('2h')
        .setIssuedAt()
        .sign(JWT_SECRET);

    const cookieStore = await cookies();
    cookieStore.set('superadmin_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 2,
        path: '/',
    });
}

export async function getSuperAdminSession(): Promise<SuperAdminSessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('superadmin_session')?.value;
        if (!token) return null;

        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.role !== 'superadmin') return null;

        return {
            id: (payload.id as string) || '',
            email: (payload.email as string) || '',
            name: (payload.name as string) || '',
            role: 'superadmin',
        };
    } catch {
        return null;
    }
}

export async function createMfaPendingSession(data: SessionData): Promise<void> {
    const token = await new SignJWT(data as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('5m')
        .setIssuedAt()
        .sign(JWT_SECRET);

    const cookieStore = await cookies();
    cookieStore.set('mfa_pending', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 5,
        path: '/',
    });
}

export async function getMfaPendingSession(): Promise<SessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('mfa_pending')?.value;
        if (!token) return null;

        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as SessionData;
    } catch {
        return null;
    }
}

