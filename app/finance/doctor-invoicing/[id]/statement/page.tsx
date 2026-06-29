import DoctorPayoutStatementClient from '@/app/components/doctor-commission/DoctorPayoutStatementClient';

export const metadata = { title: 'Doctor Payout Statement — Finance' };

export default async function FinanceDoctorStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DoctorPayoutStatementClient doctorId={id} basePath="/finance/doctor-invoicing" />;
}
