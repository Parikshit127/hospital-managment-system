'use client';

/**
 * GAP 8 — Order Set / Saved Prescription Templates
 * GAP 9 — Investigation "My List" Feature
 */

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import OrderSetsContent from './OrderSetsContent';

export default function OrderSetsPage() {
    return (
        <AppShell>
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
            }>
                <OrderSetsContent />
            </Suspense>
        </AppShell>
    );
}
