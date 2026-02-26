import { requireSuperAdmin, listOrganizations } from '@/app/actions/superadmin-actions';
import SuperAdminShell from '../components/SuperAdminShell';
import OrgList from '../components/OrgList';

export default async function OrganizationsPage() {
    const session = await requireSuperAdmin();
    const result = await listOrganizations();
    const orgs = result.success ? (result.data ?? []) : [];

    return (
        <SuperAdminShell session={session}>
            <OrgList orgs={orgs} />
        </SuperAdminShell>
    );
}
