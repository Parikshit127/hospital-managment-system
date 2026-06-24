import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — Pharmacy Portal | HospitalOS',
    description: 'Management Information System report catalogue for Pharmacy staff.',
};

export default function PharmacyMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="Pharmacy"
            basePath="/pharmacy/mis"
            backHref="/pharmacy/dashboard"
            backLabel="Pharmacy Dashboard"
        />
    );
}
