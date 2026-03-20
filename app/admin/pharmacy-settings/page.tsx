import { redirect } from 'next/navigation';

export default function PharmacySettingsRedirect() {
    redirect('/admin/pharmacy?tab=settings');
}
