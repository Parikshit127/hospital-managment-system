'use server';

import { requireDevPortalContext } from '@/backend/dev-portal';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { prisma } from '@/backend/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fetch the contact email stored on the dev-portal user's own User record.
 * Uses requireDevPortalContext() to guard the session and re-validate the DB
 * flags, then reads the `email` field for that userId.
 */
export async function getDevPortalEmail(): Promise<{ success: boolean; email: string; error?: string }> {
    try {
        const { session } = await requireDevPortalContext();

        const user = await prisma.user.findUnique({
            where: { id: session.id },
            select: { email: true },
        });

        return { success: true, email: user?.email ?? '' };
    } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
            return { success: false, email: '', error: 'Not authorized' };
        }
        console.error('getDevPortalEmail error:', error);
        return { success: false, email: '', error: 'Internal error' };
    }
}

/**
 * Persist a contact email onto the dev-portal user's own User record.
 * Guarded by requireDevPortalContext(). Validates the email format before
 * writing to the database.
 */
export async function saveDevPortalEmail(input: { email: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const { session } = await requireDevPortalContext();

        const email = input.email?.trim() ?? '';
        if (!EMAIL_RE.test(email)) {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        await prisma.user.update({
            where: { id: session.id },
            data: { email },
        });

        return { success: true };
    } catch (error) {
        if (error instanceof AuthError || error instanceof ForbiddenError) {
            return { success: false, error: 'Not authorized' };
        }
        console.error('saveDevPortalEmail error:', error);
        return { success: false, error: 'Internal error' };
    }
}
