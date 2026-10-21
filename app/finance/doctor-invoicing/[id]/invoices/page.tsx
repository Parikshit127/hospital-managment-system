import DoctorInvoicesClient from '@/app/components/doctor-commission/DoctorInvoicesClient';

export const metadata = { title: 'Doctor Invoices — Finance' };

export default async function FinanceDoctorInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DoctorInvoicesClient doctorId={id} basePath="/finance/doctor-invoicing" />;
}
