import DoctorInvoiceDetailClient from '@/app/components/doctor-commission/DoctorInvoiceDetailClient';

export const metadata = { title: 'Doctor Invoice — Admin' };

export default async function AdminDoctorInvoiceDetailPage({ params }: { params: Promise<{ id: string; statementId: string }> }) {
    const { id, statementId } = await params;
    return <DoctorInvoiceDetailClient doctorId={id} statementId={statementId} basePath="/admin/doctor-invoicing" />;
}
