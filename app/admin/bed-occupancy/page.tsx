'use client';

import { BarChart3 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import BedOccupancyReport from '@/components/ipd/BedOccupancyReport';

export default function AdminBedOccupancyPage() {
    return (
        <AdminPage pageTitle="IPD Bed Occupancy Report" pageIcon={<BarChart3 className="h-5 w-5" />}>
            <BedOccupancyReport />
        </AdminPage>
    );
}
