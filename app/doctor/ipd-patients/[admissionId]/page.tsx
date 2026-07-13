'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import IpdPatientDetailContent from './IpdPatientDetailContent';

export default function IpdPatientDetailPage() {
    const params = useParams<{ admissionId: string }>();
    const admissionId = String(params?.admissionId || '');

    return (
        <AppShell pageTitle="IPD Patient">
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
            }>
                <IpdPatientDetailContent admissionId={admissionId} />
            </Suspense>
        </AppShell>
    );
}
