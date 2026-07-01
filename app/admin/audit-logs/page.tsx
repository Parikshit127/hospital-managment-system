import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { requireTenantContext } from '@/backend/tenant';
import { AdminPage } from '@/app/admin/components/AdminPage';

export const metadata: Metadata = {
    title: 'Audit Logs — Hospital OS',
    description: 'Admin-only audit trail',
};

export const dynamic = 'force-dynamic';

/**
 * Admin-only audit log page. Enforces access at the ROUTE level (redirect),
 * in addition to the 403 on /api/audit-logs. A Developer (non-admin) is bounced.
 */
export default async function AuditLogsPage(): Promise<ReactElement> {
    let ctx;
    try {
        ctx = await requireTenantContext();
    } catch {
        redirect('/login');
    }

    if (ctx!.session.role !== 'admin') {
        // Non-admins (including Developer) are redirected, not shown a 403 body.
        redirect('/admin');
    }

    return (
        <AdminPage pageTitle="Audit Logs" pageIcon={<ScrollText className="h-5 w-5" />}>
            <div
                className="rounded-xl border p-8 text-sm"
                style={{
                    borderColor: 'var(--admin-border)',
                    color: 'var(--admin-text-muted)',
                    background: 'var(--admin-surface)',
                }}
            >
                Audit trail is available to admins. The log table is rendered by the frontend
                consuming <code>GET /api/audit-logs</code> (filters: action, module, entityType,
                from, to; pagination: limit, offset).
            </div>
        </AdminPage>
    );
}
