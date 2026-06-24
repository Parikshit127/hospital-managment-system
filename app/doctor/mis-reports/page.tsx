import type { Metadata } from 'next';
import { PortalMISCataloguePage } from '@/components/mis/PortalMISCataloguePage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'MIS Reports — Doctor Portal | HospitalOS',
    description: 'Management Information System report catalogue for Doctors.',
};

export default function DoctorMISCataloguePage() {
    return (
        <PortalMISCataloguePage
            portalName="Doctor"
            basePath="/doctor/mis"
            backHref="/doctor/dashboard"
            backLabel="Doctor Dashboard"
        />
    );
}
