'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOrganizationDetail, toggleOrganization, updateOrganizationPlan } from '@/app/actions/superadmin-actions';
import { Building2, Power, Activity, Users, Database, FileText, MapPin, Loader2, Settings, Clock, BarChart3, CreditCard } from 'lucide-react';
import OverviewTab from './tabs/OverviewTab';
import BranchesTab from './tabs/BranchesTab';
import ConfigTab from './tabs/ConfigTab';
import ActivityTab from './tabs/ActivityTab';
import UsageTab from './tabs/UsageTab';
import BillingTab from './tabs/BillingTab';

const TABS = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'branches', label: 'Branches', icon: MapPin },
    { key: 'config', label: 'Configuration', icon: Settings },
    { key: 'usage', label: 'Usage', icon: BarChart3 },
    { key: 'billing', label: 'Billing', icon: CreditCard },
    { key: 'activity', label: 'Activity Log', icon: Clock },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function TenantDetail() {
    const { id } = useParams();
    const router = useRouter();
    const [org, setOrg] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    const loadData = async () => {
        setLoading(true);
        const res = await getOrganizationDetail(id as string);
        if (res.success) setOrg(res.data);
        else router.push('/superadmin/organizations');
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [id]);

    const handleToggle = async () => {
        if (!confirm(`Are you sure you want to ${org.is_active ? 'suspend' : 'activate'} this tenant?`)) return;
        setToggling(true);
        const res = await toggleOrganization(org.id);
        setToggling(false);
        if (res.success) loadData();
        else alert(res.error);
    };

    const handlePlan = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const res = await updateOrganizationPlan(org.id, e.target.value);
        if (res.success) loadData();
        else alert(res.error);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${org.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-violet-500/15 text-violet-400 rounded-xl shrink-0">
                            <Building2 className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                                {org.name}
                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest rounded text-white ${org.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                    {org.is_active ? 'Active' : 'Suspended'}
                                </span>
                            </h1>
                            <div className="flex gap-3 mt-1.5">
                                <span className="text-xs font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">{org.slug}</span>
                                <span className="text-xs font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">{org.code}</span>
                                {org.hospital_type && <span className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">{org.hospital_type}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            value={org.plan}
                            onChange={handlePlan}
                            className="bg-white/5 border border-white/10 text-gray-300 rounded-lg px-3 py-2 text-sm font-medium outline-none cursor-pointer uppercase tracking-wider"
                        >
                            <option value="free">Free</option>
                            <option value="starter">Starter</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                        <button
                            disabled={toggling}
                            onClick={handleToggle}
                            className={`flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg transition text-white ${org.is_active ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                        >
                            <Power className="h-4 w-4" /> {org.is_active ? 'Suspend' : 'Activate'}
                        </button>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg"><Users className="h-4 w-4 text-indigo-400" /></div>
                        <div>
                            <p className="text-lg font-bold text-white">{org._count.users}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Staff</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg"><Activity className="h-4 w-4 text-emerald-400" /></div>
                        <div>
                            <p className="text-lg font-bold text-white">{org._count.patients}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Patients</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-500/10 rounded-lg"><Database className="h-4 w-4 text-rose-400" /></div>
                        <div>
                            <p className="text-lg font-bold text-white">{org._count.admissions}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Admissions</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg"><FileText className="h-4 w-4 text-blue-400" /></div>
                        <div>
                            <p className="text-lg font-bold text-white">{org._count.invoices}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Invoices</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/5">
                <nav className="flex gap-1">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                                    activeTab === tab.key
                                        ? 'border-violet-500 text-violet-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && <OverviewTab org={org} onUpdate={loadData} />}
            {activeTab === 'branches' && <BranchesTab orgId={org.id} />}
            {activeTab === 'config' && <ConfigTab orgId={org.id} />}
            {activeTab === 'usage' && <UsageTab orgId={org.id} />}
            {activeTab === 'billing' && <BillingTab orgId={org.id} currentPlan={org.plan} onPlanChange={loadData} />}
            {activeTab === 'activity' && <ActivityTab orgId={org.id} />}
        </div>
    );
}
