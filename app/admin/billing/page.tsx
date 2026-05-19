import { AdminPage } from '@/app/admin/components/AdminPage';
import { FileText } from 'lucide-react';
import { BillingMasterDashboard } from '@/app/components/finance/BillingMasterDashboard';

export default async function AdminMasterBillingPage() {
    return (
        <AdminPage pageTitle="Master Billing" pageIcon={<FileText className="h-5 w-5" />}>
            <BillingMasterDashboard role="admin" />
        </AdminPage>
    );
}
