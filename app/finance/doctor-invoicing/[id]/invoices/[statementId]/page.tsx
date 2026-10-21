import DoctorInvoiceDetailClient from '@/app/components/doctor-commission/DoctorInvoiceDetailClient';

export const metadata = { title: 'Doctor Invoice — Finance' };

export default async function FinanceDoctorInvoiceDetailPage({ params }: { params: Promise<{ id: string; statementId: string }> }) {
    const { id, statementId } = await params;
    return <DoctorInvoiceDetailClient doctorId={id} statementId={statementId} basePath="/finance/doctor-invoicing" />;
}
