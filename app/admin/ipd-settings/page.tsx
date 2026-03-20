import { redirect } from 'next/navigation';

export default function IpdSettingsRedirect() {
    redirect('/admin/ipd?tab=settings');
}
