import ConsultantChargeStatementClient from '@/app/components/referrals/ConsultantChargeStatementClient';

export const metadata = { title: 'Consultant Charges — Finance' };

export default async function FinanceConsultantStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ConsultantChargeStatementClient referrerId={id} basePath="/finance/referrals" />;
}
