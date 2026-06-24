import type { Metadata } from 'next';
import { PortalMISViewerPage } from '@/components/mis/PortalMISViewerPage';
import { REGISTRY } from '@/lib/mis/runner';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ reportId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { reportId } = await params;
    const reportDef = REGISTRY[reportId];
    if (!reportDef) {
        return { title: 'Report Not Found — Doctor | HospitalOS' };
    }
    return {
        title: `${reportDef.name} — Doctor MIS | HospitalOS`,
        description: reportDef.description,
    };
}

export default async function DoctorMISViewerPage({ params, searchParams }: PageProps) {
    const { reportId } = await params;
    const resolvedSearchParams = await searchParams;

    return (
        <PortalMISViewerPage
            reportId={reportId}
            searchParams={resolvedSearchParams}
            portalName="Doctor"
            backHref="/doctor/mis-reports"
            backLabel="MIS Report Catalogue"
        />
    );
}
