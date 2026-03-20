'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toggleOrganization, updateOrganizationPlan } from '@/app/actions/superadmin-actions';
import { Building2, Plus, Search, Power, Users, UserCheck, Filter, ChevronRight } from 'lucide-react';

interface Org {
    id: string;
    name: string;
    slug: string;
    code: string;
    plan: string;
    is_active: boolean;
    email: string | null;
    phone: string | null;
    hospital_type?: string | null;
    bed_capacity?: number | null;
    created_at: string | Date;
    _count?: { users?: number; patients?: number; branches?: number };
}

export default function OrgList({ orgs: initialOrgs }: { orgs: Org[] }) {
    const [orgs, setOrgs] = useState(initialOrgs);
    const [search, setSearch] = useState('');
    const [planFilter, setPlanFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
    const [typeFilter, setTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'created' | 'patients'>('created');
    const [isPending, startTransition] = useTransition();

    const filtered = orgs
        .filter(o => {
            if (search && !(
                o.name.toLowerCase().includes(search.toLowerCase()) ||
                o.slug.toLowerCase().includes(search.toLowerCase()) ||
                o.code.toLowerCase().includes(search.toLowerCase())
            )) return false;
            if (planFilter && o.plan !== planFilter) return false;
            if (statusFilter === 'active' && !o.is_active) return false;
            if (statusFilter === 'inactive' && o.is_active) return false;
            if (typeFilter && o.hospital_type !== typeFilter) return false;
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'patients') return (b._count?.patients ?? 0) - (a._count?.patients ?? 0);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

    // Derive unique hospital types for filter
    const hospitalTypes = [...new Set(orgs.map(o => o.hospital_type).filter(Boolean))] as string[];

    function handleToggle(id: string) {
        startTransition(async () => {
            const result = await toggleOrganization(id);
            if (result.success) {
                setOrgs(prev => prev.map(o => (o.id === id ? { ...o, is_active: !o.is_active } : o)));
            }
        });
    }

    function handlePlanChange(id: string, plan: string) {
        startTransition(async () => {
            const result = await updateOrganizationPlan(id, plan);
            if (result.success) {
                setOrgs(prev => prev.map(o => (o.id === id ? { ...o, plan } : o)));
            }
        });
    }

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Organizations</h1>
                    <p className="text-sm text-gray-400 mt-1">{orgs.length} hospital{orgs.length !== 1 ? 's' : ''} registered</p>
                </div>
                <Link
                    href="/superadmin/organizations/new"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition"
                >
                    <Plus className="h-4 w-4" /> Add Hospital
                </Link>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input type="text" placeholder="Search by name, slug, or code..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm" />
                </div>
                <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                    className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 outline-none">
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                    className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 outline-none">
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Suspended</option>
                </select>
                {hospitalTypes.length > 0 && (
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                        className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 outline-none">
                        <option value="">All Types</option>
                        {hospitalTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
                <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                    className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 outline-none">
                    <option value="created">Newest First</option>
                    <option value="name">Name A-Z</option>
                    <option value="patients">Most Patients</option>
                </select>
            </div>

            {/* List */}
            <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <Building2 className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">{search || planFilter || statusFilter ? 'No matching organizations' : 'No organizations yet'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {filtered.map((org) => (
                            <div key={org.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition gap-3">
                                <Link href={`/superadmin/organizations/${org.id}`} className="flex items-center gap-4 min-w-0 flex-1 group">
                                    <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                                        <Building2 className="h-5 w-5 text-violet-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate group-hover:text-violet-400 transition">{org.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-gray-500">{org.slug} · {org.code}</span>
                                            {org.hospital_type && (
                                                <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">{org.hospital_type}</span>
                                            )}
                                            {org.bed_capacity && (
                                                <span className="text-[10px] text-gray-500">{org.bed_capacity} beds</span>
                                            )}
                                        </div>
                                    </div>
                                </Link>

                                <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{org._count?.users ?? 0}</span>
                                        <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" />{org._count?.patients ?? 0}</span>
                                    </div>

                                    <select value={org.plan} onChange={e => handlePlanChange(org.id, e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-gray-300 uppercase focus:outline-none focus:ring-1 focus:ring-violet-500/50">
                                        <option value="free">Free</option>
                                        <option value="starter">Starter</option>
                                        <option value="pro">Pro</option>
                                        <option value="enterprise">Enterprise</option>
                                    </select>

                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                                        org.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                        {org.is_active ? 'Active' : 'Suspended'}
                                    </span>

                                    <button onClick={() => handleToggle(org.id)} disabled={isPending}
                                        className={`p-2 rounded-lg transition ${org.is_active ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                        title={org.is_active ? 'Suspend' : 'Activate'}>
                                        <Power className="h-4 w-4" />
                                    </button>

                                    <Link href={`/superadmin/organizations/${org.id}`} className="p-2 text-gray-500 hover:text-violet-400 transition">
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
