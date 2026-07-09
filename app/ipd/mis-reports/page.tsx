import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — IPD Portal | HospitalOS',
    description: 'Management Information System report catalogue for IPD staff.',
};

export default function IPDMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="IPD"
            basePath="/ipd/mis"
            backHref="/ipd"
            backLabel="IPD Dashboard"
            hideIntro
        />
    );
}
