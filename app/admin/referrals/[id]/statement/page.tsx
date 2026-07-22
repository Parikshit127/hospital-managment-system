import ConsultantChargeStatementClient from '@/app/components/referrals/ConsultantChargeStatementClient';

export const metadata = { title: 'Consultant Charges — Admin' };

export default async function AdminConsultantStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ConsultantChargeStatementClient referrerId={id} basePath="/admin/referrals" />;
}
