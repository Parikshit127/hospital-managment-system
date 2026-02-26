import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Super Admin — Hospital OS',
    description: 'Platform administration dashboard',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#0a0e1a] text-white">
            {children}
        </div>
    );
}
