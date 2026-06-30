import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/backend/tenant';

export const metadata: Metadata = {
    title: 'Support Portal — Hospital OS',
    description: 'Internal administration support portal',
};

export const dynamic = 'force-dynamic';

// Roles permitted to access the internal support portal.
const ALLOWED_ROLES: readonly string[] = ['admin', 'developer'];

export default async function SupportLayout({ children }: { children: ReactNode }) {
    // Same server-side guard pattern used across protected routes:
    // requireTenantContext() resolves session + tenant, or we bounce to /login.
    let ctx;
    try {
        ctx = await requireTenantContext();
    } catch {
        redirect('/login');
    }

    const { session } = ctx!;

    if (!ALLOWED_ROLES.includes(session.role)) {
        redirect('/login');
    }

    // Parent app/admin/layout.tsx already supplies AdminLayoutShell + ThemeProvider,
    // so this segment only enforces access and passes children through.
    return <>{children}</>;
}
