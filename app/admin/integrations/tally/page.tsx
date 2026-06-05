'use client';

import { AdminPage } from '@/app/admin/components/AdminPage';
import { TallyIntegration } from '@/app/components/finance/TallyIntegration';
import { Plug } from 'lucide-react';

export default function AdminTallyIntegrationPage() {
    return (
        <AdminPage pageTitle="Tally Integration" pageIcon={<Plug className="h-5 w-5" />}>
            <TallyIntegration />
        </AdminPage>
    );
}
