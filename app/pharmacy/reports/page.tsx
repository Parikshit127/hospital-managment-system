'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';

export default function PharmacyReportsPage() {
    return (
        <AppShell
            pageTitle="Pharmacy Analytics"
            pageIcon={<BarChart3 className="h-5 w-5" />}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
                    <TrendingUp className="h-12 w-12 text-gray-300 mb-4" />
                    <h3 className="font-bold text-gray-900 mb-2">Revenue Analytics (Coming Soon)</h3>
                    <p className="text-sm text-gray-500">Charts visualizing medicine sales trends over time, segmented by category and individual drugs.</p>
                </div>

                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
                    <AlertTriangle className="h-12 w-12 text-gray-300 mb-4" />
                    <h3 className="font-bold text-gray-900 mb-2">Wastage & Expiry Report (Coming Soon)</h3>
                    <p className="text-sm text-gray-500">Analytical breakdown of financial loss due to expired stock or breakage, separated by supplier.</p>
                </div>
            </div>
        </AppShell>
    );
}
