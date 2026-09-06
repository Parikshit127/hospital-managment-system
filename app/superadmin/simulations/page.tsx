import { requireSuperAdmin } from '@/app/actions/superadmin-actions';
import { listSimulations, listHospitalsForCloning } from '@/app/actions/simulation-actions';
import SimulationsPanel from '../components/SimulationsPanel';

export const dynamic = 'force-dynamic';

export default async function SimulationsPage() {
    await requireSuperAdmin();

    // Fetched server-side and passed down, so the panel renders populated with no
    // loading state and no extra round trip on mount.
    const [sims, hospitals] = await Promise.all([listSimulations(), listHospitalsForCloning()]);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Simulations</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Environments that generate synthetic hospital activity. Clone a hospital to
                    create one, then start it when you need the screens populated.
                </p>
            </div>
            <SimulationsPanel
                simulations={sims.success ? sims.data ?? [] : []}
                hospitals={hospitals.success ? hospitals.data ?? [] : []}
                loadError={sims.success ? null : (sims.error ?? 'Failed to load simulations')}
            />
        </div>
    );
}
