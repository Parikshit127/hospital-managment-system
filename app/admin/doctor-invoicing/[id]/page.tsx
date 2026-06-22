import DoctorCommissionDetailClient from '@/app/components/doctor-commission/DoctorCommissionDetailClient';

export const metadata = { title: 'Doctor Commission — Admin' };

export default async function AdminDoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <DoctorCommissionDetailClient doctorId={id} basePath="/admin/doctor-invoicing" />;
}
