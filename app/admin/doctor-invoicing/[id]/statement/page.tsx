import DoctorPayoutStatementClient from '@/app/components/doctor-commission/DoctorPayoutStatementClient';

export const metadata = { title: 'Doctor Payout Statement — Admin' };

export default async function AdminDoctorStatementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DoctorPayoutStatementClient doctorId={id} basePath="/admin/doctor-invoicing" />;
}
