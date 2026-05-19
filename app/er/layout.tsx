import { getSession } from '@/app/lib/session';
import { prisma } from '@/backend/db';
import AdminLayoutShell from '@/app/admin/components/AdminLayoutShell';
import ThemeProvider from '@/app/admin/components/ThemeProvider';

async function getBrandingForOrg(organizationId: string) {
    try {
        return await prisma.organizationBranding.findUnique({ where: { organizationId } });
    } catch {
        return null;
    }
}

export default async function ERLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (session?.role === 'admin') {
        const branding = session.organization_id
            ? await getBrandingForOrg(session.organization_id)
            : null;
        return (
            <ThemeProvider branding={branding}>
                <AdminLayoutShell userName={session.name} userRole={session.role}>
                    {children}
                </AdminLayoutShell>
            </ThemeProvider>
        );
    }

    return <>{children}</>;
}
