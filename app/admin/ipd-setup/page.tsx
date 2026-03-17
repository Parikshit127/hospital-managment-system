import { getIpdInventory } from './actions';
import { WardManager } from '@/app/components/admin/ipd/WardManager';
import { AppShell } from '@/app/components/layout/AppShell';
import { BedDouble } from 'lucide-react';
import { requireTenantContext } from '@/backend/tenant';

export const metadata = {
    title: 'IPD Inventory | Hospital OS',
};

export default async function AdminIpdSetupPage() {
    // Only fetch the data needed to bootstrap the client component. 
    // We get organizationId directly from context for safety.
    const { organizationId } = await requireTenantContext();
    const { wards, departments } = await getIpdInventory();

    return (
        <AppShell
            pageTitle="IPD Inventory & Configuration"
            pageIcon={<BedDouble className="h-5 w-5" />}
        >
            <div className="max-w-5xl mx-auto py-6">
                <WardManager 
                    wards={wards || []} 
                    departments={departments || []} 
                    organizationId={organizationId} 
                />
            </div>
        </AppShell>
    );
}

