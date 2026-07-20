import { Suspense } from 'react';
import { getDefaultBranding } from '@/app/lib/get-portal-branding';
import PatientLoginClient from './PatientLoginClient';

export default async function PatientLoginPage() {
    const branding = await getDefaultBranding();
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#fafaf8]" />}>
            <PatientLoginClient branding={branding} />
        </Suspense>
    );
}
