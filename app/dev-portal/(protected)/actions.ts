'use server';

import { redirect } from 'next/navigation';
import { clearDevPortalSession, getDevPortalSession } from '@/app/lib/session';

export async function devPortalLogout() {
    await clearDevPortalSession();
    redirect('/dev-portal/login');
}

/**
 * Lightweight identity read for client components (e.g. to disable Dev-Admin-only
 * controls). This is a UI hint only — the authoritative checks are the
 * requireDevAdmin()/requireDeveloper() guards on the underlying server actions.
 */
export async function getDevPortalIdentity(): Promise<{
    userId: string | null;
    isDevAdmin: boolean;
    isDeveloper: boolean;
}> {
    const session = await getDevPortalSession();
    if (!session) return { userId: null, isDevAdmin: false, isDeveloper: false };
    return {
        userId: session.id,
        isDevAdmin: session.is_dev_admin,
        isDeveloper: session.is_developer,
    };
}
