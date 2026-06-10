'use server';

import { prisma } from '@/backend/db';
import * as bcrypt from 'bcryptjs';
import { getSession } from '@/app/lib/session';

const PASSWORD_RULES: { test: (v: string) => boolean; message: string }[] = [
    { test: (v) => v.length >= 8, message: 'Password must be at least 8 characters' },
    { test: (v) => /[A-Z]/.test(v), message: 'Password must contain at least one uppercase letter' },
    { test: (v) => /[0-9]/.test(v), message: 'Password must contain at least one number' },
    { test: (v) => /[^A-Za-z0-9]/.test(v), message: 'Password must contain at least one special character' },
];

/**
 * Self-service password change for the currently logged-in staff user.
 * Any employee with an active session can change their own password by
 * supplying their current password for verification.
 */
export async function changeMyPassword(currentPassword: string, newPassword: string) {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'Your session has expired. Please log in again.' };
        }

        // Demo-mode sessions are not backed by a real DB user.
        if (session.id === 'demo-id') {
            return { success: false, error: 'Password change is not available in demo mode.' };
        }

        if (!currentPassword || !newPassword) {
            return { success: false, error: 'Both current and new password are required' };
        }

        for (const rule of PASSWORD_RULES) {
            if (!rule.test(newPassword)) {
                return { success: false, error: rule.message };
            }
        }

        const user = await prisma.user.findFirst({
            where: { id: session.id, organizationId: session.organization_id },
            select: { id: true, username: true, name: true, role: true, password: true },
        });

        if (!user) {
            return { success: false, error: 'User account not found' };
        }

        const matches = await bcrypt.compare(currentPassword, user.password);
        if (!matches) {
            return { success: false, error: 'Current password is incorrect' };
        }

        const sameAsOld = await bcrypt.compare(newPassword, user.password);
        if (sameAsOld) {
            return { success: false, error: 'New password must be different from your current password' };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        await prisma.system_audit_logs.create({
            data: {
                user_id: user.id,
                username: user.username,
                role: user.role,
                action: 'CHANGE_PASSWORD',
                module: 'account',
                details: `${user.name || user.username} changed their own password`,
                organizationId: session.organization_id,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('changeMyPassword error:', error);
        return { success: false, error: error?.message || 'Failed to change password' };
    }
}
