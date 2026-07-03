import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/backend/tenant';

// Auth/role check must run on every request — never statically cached.
export const dynamic = 'force-dynamic';

/**
 * Hospital-admin-only guard for the Broadcasts page. Only a hospital `admin`
 * may compose a broadcast to their own hospital; any other role hitting this
 * route directly is bounced to the admin dashboard. (This is the full dev-admin
 * broadcast composer's simpler hospital-side counterpart — the cross-facility
 * composer lives in the Dev Admin portal.)
 */
export default async function AdminBroadcastsLayout({ children }: { children: ReactNode }) {
    let session: { role?: string };
    try {
        ({ session } = await requireTenantContext());
    } catch {
        redirect('/login');
    }

    if (session.role !== 'admin') {
        redirect('/admin/dashboard');
    }

    return <>{children}</>;
}
