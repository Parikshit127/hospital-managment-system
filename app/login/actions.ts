'use server';

import { prisma } from '@/app/lib/db';
import * as bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isMfaRequiredRole } from '@/app/actions/mfa-actions';

export async function login(prevState: any, formData: FormData) {
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
        return { success: false, error: 'Username and password are required' };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return { success: false, error: 'Invalid credentials' };
        }

        // Set Session Cookie (Next.js 15+ needs await)
        const cookieStore = await cookies();
        cookieStore.set('session', JSON.stringify({
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            specialty: user.specialty || null,
            hospital_id: user.hospital_id || 'avani-default',
        }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 8, // 8 hours max session life
            path: '/'
        });

        // Set last_activity cookie for session timeout middleware
        cookieStore.set('last_activity', Date.now().toString(), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        // Check if MFA is required and enabled
        if (await isMfaRequiredRole(user.role)) {
            const mfaRecord = await prisma.user_mfa.findUnique({ where: { user_id: user.id } });
            if (mfaRecord?.enabled) {
                // Store a pending MFA session (not fully authenticated yet)
                cookieStore.set('mfa_pending', JSON.stringify({
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    name: user.name,
                    specialty: user.specialty || null,
                    hospital_id: user.hospital_id || 'avani-default',
                }), {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 60 * 5, // 5 minutes to complete MFA
                    path: '/'
                });
                // Don't set the main session cookie yet
                cookieStore.delete('session');
                return { success: true, mfa_required: true };
            }
        }

        // Log successful login audit event
        await prisma.system_audit_logs.create({
            data: {
                user_id: String(user.id),
                username: user.username,
                role: user.role,
                action: 'LOGIN',
                module: 'auth',
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Internal server error' };
    }

    // Redirect based on role (must be outside try/catch because redirects throw errors)
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return { success: false, error: 'User not found' }; // Should not happen

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

// Complete login after MFA verification
export async function completeMfaLogin(token: string) {
    const cookieStore = await cookies();
    const mfaPendingCookie = cookieStore.get('mfa_pending');

    if (!mfaPendingCookie) {
        return { success: false, error: 'MFA session expired. Please login again.' };
    }

    const pendingSession = JSON.parse(mfaPendingCookie.value);

    // Dynamically import to avoid circular deps
    const { verifyMFA } = await import('@/app/actions/mfa-actions');
    const result = await verifyMFA(pendingSession.id, token);

    if (!result.success) {
        return { success: false, error: result.error || 'Invalid MFA code' };
    }

    // MFA verified — set the real session cookie
    cookieStore.set('session', JSON.stringify(pendingSession), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8,
        path: '/'
    });

    cookieStore.set('last_activity', Date.now().toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });

    cookieStore.delete('mfa_pending');

    await prisma.system_audit_logs.create({
        data: {
            user_id: String(pendingSession.id),
            username: pendingSession.username,
            role: pendingSession.role,
            action: 'LOGIN_MFA',
            module: 'auth',
        }
    });

    // Return role so the client can redirect
    return { success: true, role: pendingSession.role };
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.delete('session');
    cookieStore.delete('last_activity');
    redirect('/login');
}
