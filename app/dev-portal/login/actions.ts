'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDevPortalSession } from '@/app/lib/session';
import { loginSchema } from '@/app/lib/validations';
import {
    checkLoginAttempt,
    clearLoginFailures,
    recordLoginFailure,
} from '@/app/lib/login-rate-limit';

export interface DevPortalLoginState {
    success: boolean;
    error?: string;
}

/**
 * Dev Admin / Developer portal login (PRD Addendum v3 §6, OQ-7).
 *
 * Authenticates against the SAME `users` store as the hospital app, but issues a
 * SEPARATE `dev_portal_session` cookie and — critically — rejects any credential
 * that is not flagged `is_dev_admin` or `is_developer`, even if it is a perfectly
 * valid HospitalOS login (e.g. a Hospital Admin, Doctor, or Receptionist).
 */
export async function devPortalLogin(
    prevState: DevPortalLoginState,
    formData: FormData,
): Promise<DevPortalLoginState> {
    const parsed = loginSchema.safeParse({
        username: formData.get('username') as string,
        password: formData.get('password') as string,
    });
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const { username, password } = parsed.data;

    const headerStore = await headers();
    const ipAddress = headerStore.get('x-forwarded-for') || 'unknown';

    // Reuse the shared brute-force limiter, namespaced so portal attempts don't
    // collide with the hospital login counter for the same username.
    const rlKey = `dev-portal:${username}`;
    const attemptStatus = checkLoginAttempt(rlKey, ipAddress);
    if (attemptStatus.blocked) {
        const retryMinutes = Math.ceil(attemptStatus.retryAfterMs / (60 * 1000));
        return { success: false, error: `Too many failed attempts. Retry in ${retryMinutes} minute(s).` };
    }

    try {
        const user = await prisma.user.findUnique({ where: { username } });

        // Uniform "invalid credentials" for both unknown user and bad password,
        // so the screen never reveals whether a username exists.
        if (!user || !(await bcrypt.compare(password, user.password))) {
            recordLoginFailure(rlKey, ipAddress);
            return { success: false, error: 'Invalid credentials' };
        }

        if (user.is_active === false) {
            recordLoginFailure(rlKey, ipAddress);
            return { success: false, error: 'Account is disabled. Contact your administrator.' };
        }

        // CRITICAL GATE: password was correct, but the portal only admits accounts
        // explicitly provisioned as Dev Admin or Developer. A valid hospital-side
        // login is rejected here.
        if (!user.is_dev_admin && !user.is_developer) {
            recordLoginFailure(rlKey, ipAddress);
            return { success: false, error: 'Unauthorized: Not a developer account' };
        }

        const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
        if (!org || !org.is_active) {
            recordLoginFailure(rlKey, ipAddress);
            return { success: false, error: 'Organization is inactive. Contact platform admin.' };
        }

        await createDevPortalSession({
            id: user.id,
            username: user.username,
            name: user.name || '',
            role: user.role,
            organization_id: org.id,
            organization_slug: org.slug,
            organization_name: org.name,
            is_dev_admin: user.is_dev_admin,
            is_developer: user.is_developer,
        });

        clearLoginFailures(rlKey, ipAddress);

        await prisma.system_audit_logs.create({
            data: {
                user_id: String(user.id),
                username: user.username,
                role: user.role,
                action: 'DEV_PORTAL_LOGIN',
                module: 'dev-portal',
                organizationId: org.id,
            },
        });
    } catch (error: any) {
        console.error('Dev portal login error for user:', username, {
            message: error?.message,
            code: error?.code,
        });
        return { success: false, error: `Something went wrong: ${error?.message || 'Unknown error'}` };
    }

    // Outside the try/catch: redirect() throws NEXT_REDIRECT by design.
    redirect('/dev-portal');
}
