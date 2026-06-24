import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — Finance Portal | HospitalOS',
    description: 'Management Information System report catalogue for the Finance team.',
};

export default function FinanceMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="Finance"
            basePath="/finance/mis"
            backHref="/finance/dashboard"
            backLabel="Finance Dashboard"
        />
    );
}
