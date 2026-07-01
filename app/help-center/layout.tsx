import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/backend/tenant';

export const metadata: Metadata = {
    title: 'Help Center — HospitalOS',
    description: 'Raise and track support tickets for your facility',
};

export const dynamic = 'force-dynamic';

import { HelpCenterNav } from './_components/HelpCenterNav';

export default async function HelpCenterLayout({ children }: { children: ReactNode }) {
    try {
        await requireTenantContext();
    } catch {
        redirect('/login');
    }

    return (
        <div className="flex flex-col min-h-screen bg-[var(--background)]">
            <HelpCenterNav />
            {children}
        </div>
    );
}
