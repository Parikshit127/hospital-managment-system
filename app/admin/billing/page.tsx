'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { MasterBillingContent } from '@/app/billing/page';

export default function AdminMasterBillingPage() {
    // MasterBillingContent reads the query string (?status=Draft), so it needs a
    // Suspense boundary here too.
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}>
            <MasterBillingContent shell="admin" />
        </Suspense>
    );
}
