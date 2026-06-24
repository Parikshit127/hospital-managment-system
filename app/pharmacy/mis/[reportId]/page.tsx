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
        return { title: 'Report Not Found — Pharmacy | HospitalOS' };
    }
    return {
        title: `${reportDef.name} — Pharmacy MIS | HospitalOS`,
        description: reportDef.description,
    };
}

export default async function PharmacyMISViewerPage({ params, searchParams }: PageProps) {
    const { reportId } = await params;
    const resolvedSearchParams = await searchParams;

    return (
        <PortalMISViewerPage
            reportId={reportId}
            searchParams={resolvedSearchParams}
            portalName="Pharmacy"
            backHref="/pharmacy/mis-reports"
            backLabel="MIS Report Catalogue"
        />
    );
}
