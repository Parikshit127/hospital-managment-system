import type { ReactNode } from 'react';
import { requireDevAdminPage } from '../_guards';

export const dynamic = 'force-dynamic';

export default async function AuditLayout({ children }: { children: ReactNode }) {
    await requireDevAdminPage();
    return <>{children}</>;
}
