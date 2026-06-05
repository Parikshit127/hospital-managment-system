'use client';

import { AppShell } from '@/app/components/layout/AppShell';
import { TallyIntegration } from '@/app/components/finance/TallyIntegration';
import { Plug } from 'lucide-react';

export default function FinanceTallyIntegrationPage() {
    return (
        <AppShell pageTitle="Tally Integration" pageIcon={<Plug className="h-5 w-5" />}>
            <TallyIntegration />
        </AppShell>
    );
}
