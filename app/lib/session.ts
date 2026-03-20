'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { validateServerEnv } from '@/app/lib/env';

validateServerEnv();

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

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

export interface PatientSessionData {
    id: string;
    name: string;
    phone: string | null;
    role: 'patient';
    organization_id: string;
    organization_name: string;
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

export async function createPatientSession(data: PatientSessionData): Promise<void> {
    const token = await new SignJWT(data as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('7d')
        .setIssuedAt()
        .sign(JWT_SECRET);

    const cookieStore = await cookies();
    cookieStore.set('patient_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
    });
}

export async function getPatientSession(): Promise<PatientSessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('patient_session')?.value;
        if (!token) return null;

        const { payload } = await jwtVerify(token, JWT_SECRET);
        return {
            id: (payload.id as string) || '',
            name: (payload.name as string) || '',
            phone: (payload.phone as string) || null,
            role: 'patient',
            organization_id: (payload.organization_id as string) || '',
            organization_name: (payload.organization_name as string) || '',
        };
    } catch {
        return null;
    }
}

// --------------- Permission Helpers ---------------

// Default permissions for system roles (kept in sync with role-actions.ts SYSTEM_ROLE_PERMISSIONS)
const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: [
        'opd.view', 'opd.create', 'opd.edit', 'opd.delete', 'opd.approve', 'opd.export',
        'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.delete', 'ipd.approve', 'ipd.export',
        'lab.view', 'lab.create', 'lab.edit', 'lab.delete', 'lab.approve', 'lab.export',
        'pharmacy.view', 'pharmacy.create', 'pharmacy.edit', 'pharmacy.delete', 'pharmacy.approve', 'pharmacy.export',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete', 'finance.approve', 'finance.export',
        'insurance.view', 'insurance.create', 'insurance.edit', 'insurance.delete', 'insurance.approve', 'insurance.export',
        'hr.view', 'hr.create', 'hr.edit', 'hr.delete', 'hr.approve', 'hr.export',
        'admin.view', 'admin.create', 'admin.edit', 'admin.delete', 'admin.approve', 'admin.export',
        'reports.view', 'reports.export',
    ],
    doctor: [
        'opd.view', 'opd.create', 'opd.edit',
        'ipd.view', 'ipd.create', 'ipd.edit',
        'lab.view', 'lab.create',
        'pharmacy.view',
        'finance.view',
        'insurance.view',
        'reports.view',
    ],
    receptionist: [
        'opd.view', 'opd.create', 'opd.edit',
        'ipd.view',
        'finance.view', 'finance.create',
        'insurance.view',
        'reports.view',
    ],
    lab_technician: [
        'lab.view', 'lab.create', 'lab.edit',
        'reports.view',
    ],
    pharmacist: [
        'pharmacy.view', 'pharmacy.create', 'pharmacy.edit',
        'reports.view',
    ],
    finance: [
        'finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'finance.export',
        'insurance.view', 'insurance.create', 'insurance.edit',
        'reports.view', 'reports.export',
    ],
    ipd_manager: [
        'ipd.view', 'ipd.create', 'ipd.edit', 'ipd.approve',
        'opd.view',
        'lab.view',
        'pharmacy.view',
        'finance.view',
        'reports.view', 'reports.export',
    ],
    nurse: [
        'ipd.view', 'ipd.edit',
        'opd.view',
        'lab.view',
        'pharmacy.view',
        'reports.view',
    ],
    opd_manager: [
        'opd.view', 'opd.create', 'opd.edit', 'opd.approve',
        'lab.view',
        'pharmacy.view',
        'finance.view',
        'reports.view', 'reports.export',
    ],
    hr: [
        'hr.view', 'hr.create', 'hr.edit', 'hr.approve', 'hr.export',
        'reports.view', 'reports.export',
    ],
};

/**
 * Check if the current session has a specific permission.
 * Falls back to role-based system permissions when no custom role is assigned.
 * @param permissionKey - Permission string like 'opd.view', 'finance.approve'
 * @returns true if the user has the permission
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
    const session = await getSession();
    if (!session) return false;

    // Admin always has all permissions
    if (session.role === 'admin') return true;

    // Check system role default permissions
    const rolePerms = SYSTEM_ROLE_PERMISSIONS[session.role];
    if (rolePerms && rolePerms.includes(permissionKey)) return true;

    return false;
}

/**
 * Check if the current session has ANY of the given permissions.
 */
export async function hasAnyPermission(permissionKeys: string[]): Promise<boolean> {
    const session = await getSession();
    if (!session) return false;
    if (session.role === 'admin') return true;

    const rolePerms = SYSTEM_ROLE_PERMISSIONS[session.role] || [];
    return permissionKeys.some(key => rolePerms.includes(key));
}

/**
 * Check if the current session has ALL of the given permissions.
 */
export async function hasAllPermissions(permissionKeys: string[]): Promise<boolean> {
    const session = await getSession();
    if (!session) return false;
    if (session.role === 'admin') return true;

    const rolePerms = SYSTEM_ROLE_PERMISSIONS[session.role] || [];
    return permissionKeys.every(key => rolePerms.includes(key));
}

/**
 * Get all permissions for the current user's role.
 */
export async function getUserPermissions(): Promise<string[]> {
    const session = await getSession();
    if (!session) return [];

    return SYSTEM_ROLE_PERMISSIONS[session.role] || [];
}
