import { requireSuperAdmin, listOrganizations } from '@/app/actions/superadmin-actions';
import OrgList from '../components/OrgList';

export const dynamic = 'force-dynamic';

export default async function OrganizationsPage() {
    await requireSuperAdmin();
    const result = await listOrganizations();
    const orgs = result.success ? (result.data ?? []) : [];

    return <OrgList orgs={orgs} />;
}
