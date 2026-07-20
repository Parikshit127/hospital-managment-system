import { Suspense } from 'react';
import { getDefaultBranding } from '@/app/lib/get-portal-branding';
import LoginLanding from './LoginLanding';

export default async function LoginPage() {
    const branding = await getDefaultBranding();
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#faf9f6]" />}>
            <LoginLanding branding={branding} />
        </Suspense>
    );
}
