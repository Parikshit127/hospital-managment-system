'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isMfaRequiredRole } from '@/app/actions/mfa-actions';
import { createSession, createMfaPendingSession, getMfaPendingSession } from '@/app/lib/session';
import { loginSchema } from '@/app/lib/validations';

export async function login(prevState: any, formData: FormData) {
    const raw = {
        username: formData.get('username') as string,
        password: formData.get('password') as string,
    };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const { username, password } = parsed.data;

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return { success: false, error: 'Invalid credentials' };
        }

        if (user.is_active === false) {
            return { success: false, error: 'Account is disabled. Contact your administrator.' };
        }

        // Fetch user's organization
        const org = await prisma.organization.findUnique({
            where: { id: user.organizationId },
        });

        if (!org || !org.is_active) {
            return { success: false, error: 'Organization is inactive. Contact platform admin.' };
        }

        const sessionData = {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name || '',
            specialty: user.specialty || null,
            organization_id: org.id,
            organization_slug: org.slug,
            organization_name: org.name,
        };

        // Check if MFA is required and enabled
        if (await isMfaRequiredRole(user.role)) {
            const mfaRecord = await prisma.user_mfa.findUnique({ where: { user_id: user.id } });
            if (mfaRecord?.enabled) {
                await createMfaPendingSession(sessionData);
                return { success: true, mfa_required: true };
            }
        }

        // Set the real session
        await createSession(sessionData);

        // Log successful login
        await prisma.system_audit_logs.create({
            data: {
                user_id: String(user.id),
                username: user.username,
                role: user.role,
                action: 'LOGIN',
                module: 'auth',
                organizationId: org.id,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Internal server error' };
    }

    // Redirect based on role
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return { success: false, error: 'User not found' };

    switch (user.role) {
        case 'receptionist': redirect('/reception');
        case 'doctor': redirect('/doctor/dashboard');
        case 'lab_technician': redirect('/lab/technician');
        case 'pharmacist': redirect('/pharmacy/billing');
        case 'admin': redirect('/admin/dashboard');
        case 'finance': redirect('/finance/dashboard');
        case 'ipd_manager': redirect('/ipd');
        default: redirect('/');
    }
}

export async function completeMfaLogin(token: string) {
    const pendingSession = await getMfaPendingSession();

    if (!pendingSession) {
        return { success: false, error: 'MFA session expired. Please login again.' };
    }

    const { verifyMFA } = await import('@/app/actions/mfa-actions');
    const result = await verifyMFA(pendingSession.id, token);

    if (!result.success) {
        return { success: false, error: result.error || 'Invalid MFA code' };
    }

    // MFA verified — set the real session
    await createSession(pendingSession);

    const cookieStore = await cookies();
    cookieStore.delete('mfa_pending');

    await prisma.system_audit_logs.create({
        data: {
            user_id: String(pendingSession.id),
            username: pendingSession.username,
            role: pendingSession.role,
            action: 'LOGIN_MFA',
            module: 'auth',
            organizationId: pendingSession.organization_id,
        },
    });

    return { success: true, role: pendingSession.role };
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.delete('session');
    cookieStore.delete('last_activity');
    redirect('/login');
}
