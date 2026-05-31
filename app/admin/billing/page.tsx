import { redirect } from 'next/navigation';

// Master Billing is now a single shared experience for all roles at /billing
// (the modern grid). Admins previously had a separate legacy dashboard here;
// this route now redirects so existing links/bookmarks keep working.
export default async function AdminMasterBillingPage() {
    redirect('/billing');
}
