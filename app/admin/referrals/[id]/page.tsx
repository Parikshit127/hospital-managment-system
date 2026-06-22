import ReferrerDetailClient from '@/app/components/referrals/ReferrerDetailClient';

export const metadata = { title: 'Referrer Detail — Admin' };

export default async function AdminReferrerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ReferrerDetailClient referrerId={id} basePath="/admin/referrals" />;
}
