import ReferralsListClient from '@/app/components/referrals/ReferralsListClient';

export const metadata = { title: 'Referrals & Commission — Admin' };

export default function AdminReferralsPage() {
    return <ReferralsListClient basePath="/admin/referrals" />;
}
