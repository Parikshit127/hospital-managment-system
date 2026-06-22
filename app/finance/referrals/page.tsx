'use client';

import { UserCheck } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import ReferralsListClient from '@/app/components/referrals/ReferralsListClient';

export default function FinanceReferralsPage() {
    return (
        <AppShell pageTitle="Referrals & Commission" pageIcon={<UserCheck className="h-5 w-5" />}>
            <ReferralsListClient basePath="/finance/referrals" />
        </AppShell>
    );
}
