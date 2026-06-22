import DoctorCommissionListClient from '@/app/components/doctor-commission/DoctorCommissionListClient';

export const metadata = { title: 'Doctor Invoicing — Admin' };

export default function AdminDoctorInvoicingPage() {
    return <DoctorCommissionListClient basePath="/admin/doctor-invoicing" />;
}
