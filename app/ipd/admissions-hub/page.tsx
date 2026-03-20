import { getAdmissionsHubData } from './actions';
import { AdmissionsDataGrid } from '@/app/components/ipd/AdmissionsDataGrid';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity } from 'lucide-react';
import { requireTenantContext } from '@/backend/tenant';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Admissions Hub | Hospital OS',
};

export default async function AdmissionsHubPage() {
    // We get the data without any initial filters to allow client-side fast filtering
    // since this is a high density page.
    const { admissions, wards } = await getAdmissionsHubData();

    return (
        <AppShell
            pageTitle="Admissions Hub"
            pageIcon={<Activity className="h-5 w-5" />}
        >
            <div className="max-w-6xl mx-auto py-6">
                <AdmissionsDataGrid 
                    initialData={admissions || []} 
                    wards={wards || []} 
                />
            </div>
        </AppShell>
    );
}
