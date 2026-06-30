import type { ReactElement } from 'react';
import { LifeBuoy } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';

export const dynamic = 'force-dynamic';

export default function SupportPortalPage(): ReactElement {
    return (
        <AdminPage pageTitle="Support Portal" pageIcon={<LifeBuoy className="h-5 w-5" />}>
            <div
                className="rounded-xl border p-8 text-sm"
                style={{
                    borderColor: 'var(--admin-border)',
                    color: 'var(--admin-text-muted)',
                    background: 'var(--admin-surface)',
                }}
            >
                Support portal shell is ready. Ticket management views will be added here.
            </div>
        </AdminPage>
    );
}
