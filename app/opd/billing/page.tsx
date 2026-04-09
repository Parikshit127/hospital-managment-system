import { AppShell } from '@/app/components/layout/AppShell';
import { BillingMasterDashboard } from '@/app/components/finance/BillingMasterDashboard';

export default async function OPDBillingPage() {
    return (
        <AppShell>
            <BillingMasterDashboard role="opd" />
        </AppShell>
    );
}
