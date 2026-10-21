import DoctorInvoicesClient from '@/app/components/doctor-commission/DoctorInvoicesClient';

export const metadata = { title: 'Doctor Invoices — Admin' };

export default async function AdminDoctorInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DoctorInvoicesClient doctorId={id} basePath="/admin/doctor-invoicing" />;
}
