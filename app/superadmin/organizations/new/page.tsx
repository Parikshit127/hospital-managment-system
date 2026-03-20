import { requireSuperAdmin } from '@/app/actions/superadmin-actions';
import OnboardingWizard from '../../components/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function NewOrganizationPage() {
    await requireSuperAdmin();

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Add Hospital</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Register a new hospital on the platform
                </p>
            </div>
            <OnboardingWizard />
        </div>
    );
}
