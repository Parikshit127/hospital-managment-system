import { requireSuperAdmin, getSystemStats, listOrganizations } from '@/app/actions/superadmin-actions';
import { Building2, Users, UserCheck, Bed, Activity } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SuperAdminDashboard() {
    await requireSuperAdmin();
    const [statsResult, orgsResult] = await Promise.all([
        getSystemStats(),
        listOrganizations(),
    ]);

    const stats = statsResult.success ? statsResult.data : null;
    const orgs = orgsResult.success ? (orgsResult.data ?? []) : [];

    const statCards = [
        { label: 'Total Hospitals', value: stats?.totalOrgs ?? 0, icon: Building2, color: 'from-violet-500 to-purple-600' },
        { label: 'Active Hospitals', value: stats?.activeOrgs ?? 0, icon: Activity, color: 'from-emerald-500 to-teal-600' },
        { label: 'Total Staff Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'from-blue-500 to-cyan-600' },
        { label: 'Total Patients', value: stats?.totalPatients ?? 0, icon: UserCheck, color: 'from-amber-500 to-orange-600' },
        { label: 'Active Admissions', value: stats?.totalAdmissions ?? 0, icon: Bed, color: 'from-rose-500 to-pink-600' },
    ];

    return (
        <>
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
                <p className="text-sm text-gray-400 mt-1">Overview of all hospitals on the platform</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="bg-white/5 border border-white/5 rounded-2xl p-5">
                            <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${card.color} mb-3`}>
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                            <p className="text-2xl font-bold text-white">{card.value}</p>
                            <p className="text-xs text-gray-400 mt-1">{card.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Recent Organizations */}
            <div className="bg-white/5 border border-white/5 rounded-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h2 className="text-lg font-semibold text-white">Hospitals</h2>
                    <Link
                        href="/superadmin/organizations"
                        className="text-sm text-violet-400 hover:text-violet-300 transition"
                    >
                        View all
                    </Link>
                </div>

                {orgs.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <Building2 className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">No hospitals registered yet</p>
                        <Link
                            href="/superadmin/organizations/new"
                            className="inline-block mt-3 text-sm text-violet-400 hover:text-violet-300"
                        >
                            Add your first hospital
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {orgs.slice(0, 5).map((org: any) => (
                            <Link
                                key={org.id}
                                href={`/superadmin/organizations/${org.id}`}
                                className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                                        <Building2 className="h-5 w-5 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">{org.name}</p>
                                        <p className="text-xs text-gray-500">{org.slug} · {org.code}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs text-gray-400">
                                            {org._count?.users ?? 0} staff · {org._count?.patients ?? 0} patients
                                        </p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                                        org.is_active
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-red-500/10 text-red-400'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                        {org.is_active ? 'Active' : 'Suspended'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-gray-400 uppercase">
                                        {org.plan}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
