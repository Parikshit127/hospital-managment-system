'use client';

import { use } from 'react';
import { UserCheck } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import ReferrerDetailClient from '@/app/components/referrals/ReferrerDetailClient';

export default function FinanceReferrerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <AppShell pageTitle="Referrer Detail" pageIcon={<UserCheck className="h-5 w-5" />}>
            <ReferrerDetailClient referrerId={id} basePath="/finance/referrals" />
        </AppShell>
    );
}
