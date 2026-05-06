'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import PendingApprovalsContent from './PendingApprovalsContent';

export default function PendingApprovalsPage() {
    return (
        <AppShell>
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
            }>
                <PendingApprovalsContent />
            </Suspense>
        </AppShell>
    );
}
