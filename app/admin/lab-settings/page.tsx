import { redirect } from 'next/navigation';

export default function LabSettingsRedirect() {
    redirect('/admin/lab?tab=settings');
}
