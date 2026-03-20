import type { Metadata } from 'next';
import { getSession } from '@/app/lib/session';
import { prisma } from '@/backend/db';
import AdminLayoutShell from './components/AdminLayoutShell';
import ThemeProvider from './components/ThemeProvider';

export const metadata: Metadata = {
    title: 'Admin Panel — Hospital OS',
    description: 'Organization administration dashboard',
};

async function getBrandingForOrg(organizationId: string) {
    try {
        const branding = await prisma.organizationBranding.findUnique({
            where: { organizationId },
        });
        return branding;
    } catch {
        return null;
    }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    const branding = session?.organization_id
        ? await getBrandingForOrg(session.organization_id)
        : null;

    return (
        <ThemeProvider branding={branding}>
            <AdminLayoutShell>{children}</AdminLayoutShell>
        </ThemeProvider>
    );
}
