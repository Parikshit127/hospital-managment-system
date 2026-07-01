import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/session';

export default async function AuditLogsLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    return <>{children}</>;
}
