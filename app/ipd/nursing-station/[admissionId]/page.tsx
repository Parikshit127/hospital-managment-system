import { getAdmissionDetail } from '@/app/actions/ipd-actions';
import { NursingActionWorkspace } from '@/app/components/ipd/nursing/NursingActionWorkspace';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/backend/tenant';

export const metadata = {
    title: 'Nursing Action Workspace | Hospital OS',
};

export default async function NursingStationPage({ params }: { params: Promise<{ admissionId: string }> }) {
    await requireTenantContext();
    const resolvedParams = await Promise.resolve(params);
    const result = await getAdmissionDetail(resolvedParams.admissionId);
    
    if (!result.success || !result.data) {
        notFound();
    }

    return (
        <NursingActionWorkspace admission={result.data} />
    );
}
