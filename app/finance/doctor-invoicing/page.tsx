'use client';

import { Stethoscope } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import DoctorCommissionListClient from '@/app/components/doctor-commission/DoctorCommissionListClient';

export default function FinanceDoctorInvoicingPage() {
    return (
        <AppShell pageTitle="Doctor Invoicing & Commission" pageIcon={<Stethoscope className="h-5 w-5" />}>
            <DoctorCommissionListClient basePath="/finance/doctor-invoicing" />
        </AppShell>
    );
}
