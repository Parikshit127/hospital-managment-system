'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import IpdPatientsContent from './IpdPatientsContent';

export default function IpdPatientsPage() {
    return (
        <AppShell pageTitle="IPD Patients">
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
            }>
                <IpdPatientsContent />
            </Suspense>
        </AppShell>
    );
}
