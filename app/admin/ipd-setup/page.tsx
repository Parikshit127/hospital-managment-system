import { getIpdInventory } from './actions';
import { WardManager } from '@/app/components/admin/ipd/WardManager';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { BedDouble } from 'lucide-react';
import { requireTenantContext } from '@/backend/tenant';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'IPD Inventory | Hospital OS',
};

export default async function AdminIpdSetupPage() {
    // Only fetch the data needed to bootstrap the client component. 
    // We get organizationId directly from context for safety.
    const { organizationId } = await requireTenantContext();
    const { wards, departments } = await getIpdInventory();

    return (
        <AdminPage
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
        </AdminPage>
    );
}

