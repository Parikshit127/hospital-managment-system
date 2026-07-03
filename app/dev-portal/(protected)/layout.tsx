import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireDevPortalContext } from '@/backend/dev-portal';

export const metadata: Metadata = {
    title: 'Developer Portal — Hospital OS',
    description: 'Internal Developer / Dev Admin portal',
};

// Auth check must run on every request — never statically cached.
export const dynamic = 'force-dynamic';

/**
 * Route/layout guard — the FIRST of the two independent layers of the Dev Admin
 * portal gate (PRD Addendum v3 §6). Any direct hit to a protected /dev-portal
 * route without a valid `dev_portal_session` (or from a user whose DB flags have
 * been revoked) is bounced to the dedicated portal login — it never falls through
 * to page content and never inherits a hospital-side HospitalOS session.
 *
 * The login page lives at /dev-portal/login, OUTSIDE this (protected) route group,
 * so it is deliberately not guarded here (avoids a redirect loop).
 *
 * This is defense-in-depth only: every server action / API behind the portal must
 * still call requireDevAdmin()/requireDeveloper() independently — the layout guard
 * is not a substitute for the action-level check.
 */
export default async function DevPortalProtectedLayout({ children }: { children: ReactNode }) {
    try {
        await requireDevPortalContext();
    } catch {
        redirect('/dev-portal/login');
    }

    return <>{children}</>;
}
