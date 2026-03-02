'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOrganizationDetail, toggleOrganization, updateOrganizationPlan } from '@/app/actions/superadmin-actions';
import { Building2, Power, Settings, ShieldAlert, Cpu, Crown, Activity, Users, Database } from 'lucide-react';

export default function TenantDetail() {
    const { id } = useParams();
    const router = useRouter();
    const [org, setOrg] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);

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
        if (res.success) {
            alert('Tenant lifecycle state changed.');
            loadData();
        } else alert(res.error);
    };

    const handlePlan = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const res = await updateOrganizationPlan(org.id, e.target.value);
        if (res.success) {
            alert('Tenant Subscription Level updated.');
            loadData();
        } else alert(res.error);
    };

    if (loading) return <div className="p-10 text-center text-gray-400">Loading Tenant Profile...</div>;

    return (
        <div className="space-y-8 pb-12">
            {/* Header Block */}
            <header className={`bg-white rounded-3xl border border-gray-200 shadow-sm p-8 relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 w-2 h-full ${org.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6">
                    <div className="flex items-start gap-4">
                        <div className="p-4 bg-violet-50 text-violet-700 rounded-2xl border border-violet-100 flex-shrink-0">
                            <Building2 className="h-8 w-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                                {org.name}
                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest rounded text-white ${org.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                    {org.is_active ? 'Active' : 'Suspended'}
                                </span>
                            </h1>
                            <div className="flex gap-4 mt-2">
                                <p className="text-sm font-bold text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{org.slug}</p>
                                <p className="text-sm font-bold text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100">C:{org.code}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <select
                            value={org.plan}
                            onChange={handlePlan}
                            className="bg-white border border-gray-200 text-gray-700 hover:border-violet-300 rounded-xl px-4 py-3 font-black text-sm outline-none transition-colors shadow-sm appearance-none cursor-pointer flex-1 sm:flex-none uppercase tracking-widest"
                        >
                            <option value="free">Free Tier</option>
                            <option value="starter">Starter</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                        <button
                            disabled={toggling}
                            onClick={handleToggle}
                            className={`flex items-center gap-2 px-6 py-3 font-black text-sm rounded-xl shadow-lg transition-all active:scale-95 text-white ${org.is_active ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'} flex-1 sm:flex-none`}
                        >
                            <Power className="h-4 w-4" /> {org.is_active ? 'Suspend Tenant' : 'Reactivate Tenant'}
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                            <Activity className="h-5 w-5 text-gray-400" />
                            <h2 className="text-lg font-black text-gray-900">Health & Metrics</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100 text-center">
                            <div className="p-6 hover:bg-gray-50 transition-colors">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Human Capital</p>
                                <p className="text-3xl font-black text-indigo-600">{org._count.users}</p>
                            </div>
                            <div className="p-6 hover:bg-gray-50 transition-colors">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Registered Patients</p>
                                <p className="text-3xl font-black text-emerald-600">{org._count.patients}</p>
                            </div>
                            <div className="p-6 hover:bg-gray-50 transition-colors">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Admissions (IPD)</p>
                                <p className="text-3xl font-black text-rose-600">{org._count.admissions}</p>
                            </div>
                            <div className="p-6 hover:bg-gray-50 transition-colors">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Invoices Issued</p>
                                <p className="text-3xl font-black text-blue-600">{org._count.invoices}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                            <Database className="h-5 w-5 text-gray-400" />
                            <div>
                                <h2 className="text-lg font-black text-gray-900">System Integrations</h2>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Tenant Sub-Systems</p>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {org.config ? (
                                <>
                                    <div className={`p-4 rounded-xl border ${org.config.enable_ai_triage ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="font-bold text-gray-900">OpenAI Triage Engine</p>
                                            {org.config.enable_ai_triage && <span className="bg-emerald-200 text-emerald-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Enabled</span>}
                                        </div>
                                        <p className="text-xs font-medium text-gray-500">Auto SOAP note generation</p>
                                    </div>
                                    <div className={`p-4 rounded-xl border ${org.config.enable_whatsapp ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="font-bold text-gray-900">Meta API Push (WA)</p>
                                            {org.config.enable_whatsapp && <span className="bg-emerald-200 text-emerald-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Enabled</span>}
                                        </div>
                                        <p className="text-xs font-medium text-gray-500">Patient notification layer</p>
                                    </div>
                                    <div className={`p-4 rounded-xl border ${org.config.enable_razorpay ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="font-bold text-gray-900">Razorpay Payment Gateway</p>
                                            {org.config.enable_razorpay && <span className="bg-emerald-200 text-emerald-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Enabled</span>}
                                        </div>
                                        <p className="text-xs font-medium text-gray-500">Online revenue settlement</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="font-bold text-gray-900">Regional Locales</p>
                                            <span className="bg-indigo-100 text-indigo-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">{org.config.currency}</span>
                                        </div>
                                        <p className="text-xs font-medium text-gray-500">{org.config.timezone}</p>
                                    </div>
                                </>
                            ) : (
                                <div className="col-span-full p-4 text-center text-gray-400 text-sm font-medium">No configuration profile established for this tenant.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 relative overflow-hidden">
                        <ShieldAlert className="absolute top-4 right-4 h-24 w-24 text-gray-50 opacity-10" />
                        <h3 className="text-sm uppercase tracking-widest font-black text-gray-400 mb-6">Tenant Identifiers</h3>

                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-1">Globally Unique ID</p>
                                <p className="text-xs font-mono font-medium text-gray-900 break-all bg-gray-50 p-2 rounded border border-gray-100">{org.id}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-1">Provision Date</p>
                                <p className="text-sm font-bold text-gray-900">{new Date(org.created_at).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-1">Contact Details</p>
                                <p className="text-sm font-bold text-gray-900">{org.email || 'N/A'}</p>
                                <p className="text-sm font-medium text-gray-600 mt-0.5">{org.phone || 'N/A'}</p>
                            </div>
                            {org.license_no && (
                                <div>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-1">Medical License</p>
                                    <p className="text-sm font-black text-gray-900">{org.license_no}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
