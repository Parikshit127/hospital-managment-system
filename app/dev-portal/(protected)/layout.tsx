import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireDevPortalContext, type DevPortalContext } from '@/backend/dev-portal';
import { DevPortalNav } from './_components/DevPortalNav';

export const metadata: Metadata = {
    title: 'Developer Portal — Hospital OS',
    description: 'Internal Developer / Dev Admin portal',
};

// Auth check must run on every request — never statically cached.
export const dynamic = 'force-dynamic';

// Give the shared <AdminPage> chrome an emerald accent inside the dev portal,
// so its header renders correctly (the hospital admin layout normally sets these).
const DEV_PORTAL_THEME = {
    '--admin-primary': '#10b981',
    '--admin-primary-dark': '#059669',
    '--admin-primary-10': 'rgba(16, 185, 129, 0.1)',
    '--admin-text': '#0f172a',
    '--admin-text-muted': '#64748b',
} as CSSProperties;

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
    let ctx: DevPortalContext;
    try {
        ctx = await requireDevPortalContext();
    } catch {
        redirect('/dev-portal/login');
    }

    const isDevAdmin = ctx!.user.is_dev_admin;
    const roleLabel = isDevAdmin ? 'Dev Admin' : 'Developer';

    return (
        <div className="min-h-screen bg-slate-50" style={DEV_PORTAL_THEME}>
            <DevPortalNav username={ctx!.session.username} roleLabel={roleLabel} isDevAdmin={isDevAdmin} />
            <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
        </div>
    );
}
