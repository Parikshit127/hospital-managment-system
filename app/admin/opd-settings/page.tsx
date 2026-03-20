import { redirect } from 'next/navigation';

export default function OpdSettingsRedirect() {
    redirect('/admin/opd?tab=settings');
}
