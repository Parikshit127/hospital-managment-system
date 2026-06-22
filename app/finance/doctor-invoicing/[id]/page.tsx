'use client';

import { use } from 'react';
import { Stethoscope } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import DoctorCommissionDetailClient from '@/app/components/doctor-commission/DoctorCommissionDetailClient';

export default function FinanceDoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <AppShell pageTitle="Doctor Commission" pageIcon={<Stethoscope className="h-5 w-5" />}>
            <DoctorCommissionDetailClient doctorId={id} basePath="/finance/doctor-invoicing" />
        </AppShell>
    );
}
