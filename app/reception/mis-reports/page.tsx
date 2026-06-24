import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — Reception Portal | HospitalOS',
    description: 'Management Information System report catalogue for Reception staff.',
};

export default function ReceptionMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="Reception"
            basePath="/reception/mis"
            backHref="/reception"
            backLabel="Reception Dashboard"
        />
    );
}
