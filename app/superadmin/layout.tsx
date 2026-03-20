import type { Metadata } from 'next';
import SuperAdminLayoutShell from './components/SuperAdminLayoutShell';

export const metadata: Metadata = {
    title: 'Super Admin — Hospital OS',
    description: 'Platform administration dashboard',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#0c0f1a] text-white">
            <SuperAdminLayoutShell>{children}</SuperAdminLayoutShell>
        </div>
    );
}
