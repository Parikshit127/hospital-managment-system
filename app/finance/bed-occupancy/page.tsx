'use client';

import { BarChart3 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import BedOccupancyReport from '@/components/ipd/BedOccupancyReport';

export default function FinanceBedOccupancyPage() {
    return (
        <AppShell pageTitle="IPD Bed Occupancy Report" pageIcon={<BarChart3 className="h-5 w-5" />}>
            <BedOccupancyReport />
        </AppShell>
    );
}
