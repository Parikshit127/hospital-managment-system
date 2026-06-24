import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — Lab Portal | HospitalOS',
    description: 'Management Information System report catalogue for Lab staff.',
};

export default function LabMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="Lab"
            basePath="/lab/mis"
            backHref="/lab/dashboard"
            backLabel="Lab Dashboard"
        />
    );
}
