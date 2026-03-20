import { redirect } from 'next/navigation';

export default function FinanceSettingsRedirect() {
    redirect('/admin/finance?tab=settings');
}
