import type { ReactNode } from 'react';
import { requireDevAdminPage } from '../_guards';

export const dynamic = 'force-dynamic';

export default async function ReleasesLayout({ children }: { children: ReactNode }) {
    await requireDevAdminPage();
    return <>{children}</>;
}
