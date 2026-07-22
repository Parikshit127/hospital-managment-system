'use client';

import { useState, useEffect } from 'react';
import {
    Shield, FileText, Clock, Loader2, ChevronRight,
    Plus, CheckCircle, AlertTriangle, ArrowUpRight,
    Building2, Wallet, Users,
    ShieldCheck, ClipboardCheck
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    getInsuranceProviders, getInsuranceClaims, getInsuranceStats,
    getAllPolicies, addInsuranceProvider, updateInsuranceProvider,
<<<<<<< Updated upstream
    submitInsuranceClaim, getClaimableInvoices,
    getProviderPerformance
=======
    getRevenueLeakage, getProviderPerformance, autoSubmitClaim
>>>>>>> Stashed changes
} from '@/app/actions/insurance-actions';
import { isSemiDischarged } from '@/app/lib/admission-status';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import {
    ReceivablesDashboard, OutstandingAging, InsuranceReceipts, BillWiseSanction,
} from '@/app/components/insurance/finance-receivables';

export default function InsuranceDashboard() {
    const toast = useToast();
    const pathname = usePathname();
    // Clicking a provider opens a dedicated page (not a popup); keep the user in
    // whichever portal they came from (admin finance vs. insurance).
    const providerHref = (id: number) => pathname?.startsWith('/admin/finance/tpa-insurance')
        ? `/admin/finance/tpa-insurance/${id}`
        : `/insurance/provider/${id}`;
    const [stats, setStats] = useState<any>(null);
    const [providers, setProviders] = useState<any[]>([]);
    const [claims, setClaims] = useState<any[]>([]);
    const [policies, setPolicies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Provider modal
    const [providerModal, setProviderModal] = useState(false);
    const [providerForm, setProviderForm] = useState({ provider_name: '', provider_code: '', contact_email: '', contact_phone: '' });
    const [editProvider, setEditProvider] = useState<any>(null);
    const [editProviderForm, setEditProviderForm] = useState({ provider_name: '', contact_email: '', contact_phone: '', address: '', pre_auth_required: false, default_discount_percentage: 0, is_active: true });

<<<<<<< Updated upstream
    // New claim submission modal
    const [newClaimModal, setNewClaimModal] = useState(false);
    const [newClaimPolicyId, setNewClaimPolicyId] = useState('');
    const [newClaimInvoices, setNewClaimInvoices] = useState<any[]>([]);
    const [newClaimInvoiceId, setNewClaimInvoiceId] = useState('');
    const [newClaimAmount, setNewClaimAmount] = useState('');
    const [newClaimLoading, setNewClaimLoading] = useState(false);
=======
    // Revenue leakage
    const [leakage, setLeakage] = useState<any[]>([]);
    const [autoSubmitting, setAutoSubmitting] = useState<number | null>(null);
>>>>>>> Stashed changes

    // Provider performance
    const [providerPerf, setProviderPerf] = useState<any[]>([]);

    // Recent Claims (Overview tab) provider filter
    const [claimsProviderFilter, setClaimsProviderFilter] = useState('');
    // Providers tab name filter
    const [providerSearch, setProviderSearch] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, p, c, pol, perf] = await Promise.all([
                getInsuranceStats(),
                getInsuranceProviders(),
                getInsuranceClaims(),
                getAllPolicies(),
                getProviderPerformance(),
            ]);
            if (s.success) setStats(s.data);
            if (p.success) setProviders(p.data || []);
            if (c.success) setClaims(c.data || []);
            if (pol.success) setPolicies(pol.data || []);
            if (perf.success) setProviderPerf(perf.data || []);
        } catch (err) { console.error('Insurance load error:', err); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    // Re-fetch claims when the Overview tab's provider filter changes.
    useEffect(() => {
        getInsuranceClaims({ provider_id: claimsProviderFilter ? Number(claimsProviderFilter) : undefined })
            .then((c: any) => { if (c.success) setClaims(c.data || []); });
    }, [claimsProviderFilter]);

    const handleAddProvider = async () => {
        if (!providerForm.provider_name) return;
        await addInsuranceProvider(providerForm);
        setProviderModal(false);
        setProviderForm({ provider_name: '', provider_code: '', contact_email: '', contact_phone: '' });
        loadData();
    };

    const openEditProvider = (p: any) => {
        setEditProvider(p);
        setEditProviderForm({
            provider_name: p.provider_name || '',
            contact_email: p.contact_email || '',
            contact_phone: p.contact_phone || '',
            address: p.address || '',
            pre_auth_required: p.pre_auth_required || false,
            default_discount_percentage: Number(p.default_discount_percentage || 0),
            is_active: p.is_active ?? true,
        });
    };

    const handleUpdateProvider = async () => {
        if (!editProvider) return;
        const res = await updateInsuranceProvider(editProvider.id, editProviderForm);
        if (res.success) {
            setEditProvider(null);
            loadData();
        } else {
            toast.error(res.error || 'Failed to update provider');
        }
    };

<<<<<<< Updated upstream
    const handleOpenNewClaim = () => {
        setNewClaimModal(true);
        setNewClaimPolicyId('');
        setNewClaimInvoices([]);
        setNewClaimInvoiceId('');
        setNewClaimAmount('');
    };

    const handlePolicyChange = async (policyId: string) => {
        setNewClaimPolicyId(policyId);
        setNewClaimInvoiceId('');
        setNewClaimAmount('');
        if (!policyId) { setNewClaimInvoices([]); return; }
        const pol = policies.find((p: any) => p.id === parseInt(policyId));
        if (pol?.patient?.patient_id) {
            const res = await getClaimableInvoices(pol.patient.patient_id);
            if (res.success) setNewClaimInvoices(res.data || []);
        }
    };

    const handleSubmitNewClaim = async () => {
        if (!newClaimPolicyId || !newClaimInvoiceId || !newClaimAmount) return;
        setNewClaimLoading(true);
        const res = await submitInsuranceClaim({
            policy_id: parseInt(newClaimPolicyId),
            invoice_id: parseInt(newClaimInvoiceId),
            claimed_amount: parseFloat(newClaimAmount),
        });
        setNewClaimLoading(false);
        if (res.success) {
            setNewClaimModal(false);
            loadData();
        } else {
            toast.error(res.error || 'Failed to submit claim');
        }
=======
    const handleAutoSubmit = async (invoiceId: number) => {
        setAutoSubmitting(invoiceId);
        const res = await autoSubmitClaim(invoiceId);
        if (res.success) {
            loadData();
        } else {
            toast.error(res.error || 'Failed to auto-submit claim');
        }
        setAutoSubmitting(null);
>>>>>>> Stashed changes
    };

    const getClaimStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Submitted: 'text-blue-400 bg-blue-500/10',
            UnderReview: 'text-amber-400 bg-amber-500/10',
            Approved: 'text-emerald-400 bg-emerald-500/10',
            Rejected: 'text-rose-400 bg-rose-500/10',
            PartiallyApproved: 'text-orange-400 bg-orange-500/10',
            Settled: 'text-teal-400 bg-orange-500/10',
            Disputed: 'text-purple-400 bg-purple-500/10',
        };
        return map[status] || 'text-gray-500 bg-gray-100';
    };

    const headerActions = (
        <>
            <button onClick={() => setProviderModal(true)} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-blue-500/20 flex items-center gap-2">
                <Plus className="h-3.5 w-3.5" /> Add Provider
            </button>
        </>
    );

    return (
        <AppShell pageTitle="Insurance & Claims" pageIcon={<Shield className="h-5 w-5" />} onRefresh={loadData} refreshing={loading} headerActions={headerActions}>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight text-gray-900">Insurance Dashboard</h2>
                        <p className="text-gray-500 mt-1 font-medium">Providers, policies, and claims lifecycle</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { k: 'overview', l: 'Overview' },
                            { k: 'providers', l: 'Providers' },
                            { k: 'receivables', l: 'Receivables' },
                            { k: 'receipts', l: 'Receipts' },
                            { k: 'outstanding', l: 'Outstanding' },
                            { k: 'sanction', l: 'Bill Sanction' },
                        ].map(t => (
                            <button key={t.k} onClick={() => setActiveTab(t.k)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === t.k ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-900'}`}>
                                {t.l}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
                            <p className="text-gray-400 font-bold text-sm">Loading insurance data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* OVERVIEW */}
                        {activeTab === 'overview' && (<>
                            {/* KPIs */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-500/30 transition-all overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Providers</span>
                                        <div className="p-1.5 bg-blue-500/10 rounded-lg"><Building2 className="h-3.5 w-3.5 text-blue-400" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.totalProviders || 0}</p>
                                    <div className="flex items-center gap-1 mt-2 text-xs font-bold text-blue-400">
                                        <Shield className="h-3 w-3" /> Active TPAs
                                    </div>
                                </div>

                                <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-amber-500/30 transition-all overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Pending Claims</span>
                                        <div className="p-1.5 bg-amber-500/10 rounded-lg"><Clock className="h-3.5 w-3.5 text-amber-400" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.pendingClaims || 0}</p>
                                    <div className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-400">
                                        <AlertTriangle className="h-3 w-3" /> of {stats?.totalClaims || 0} total
                                    </div>
                                </div>

                                <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-orange-500/30 transition-all overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Approved Total</span>
                                        <div className="p-1.5 bg-orange-500/10 rounded-lg"><Wallet className="h-3.5 w-3.5 text-teal-400" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900 tracking-tight">
                                        {'\u20B9'}{((stats?.approvedTotal || 0) / 1000).toFixed(1)}K
                                    </p>
                                    <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                                        <ArrowUpRight className="h-3 w-3" /> {'\u20B9'}{((stats?.claimedTotal || 0) / 1000).toFixed(1)}K claimed
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Providers */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                        <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                            <Building2 className="h-4 w-4 text-blue-400" /> Insurance Providers
                                        </h3>
                                        <span className="text-[10px] font-black text-gray-300">{providers.length} active</span>
                                    </div>
                                    <div className="p-5 space-y-2.5 max-h-[320px] overflow-auto">
                                        {providers.length === 0 ? (
                                            <div className="py-8 flex flex-col items-center text-gray-300">
                                                <Building2 className="h-8 w-8 mb-2" />
                                                <span className="text-xs font-bold">No providers. Run seed or add manually.</span>
                                            </div>
                                        ) : providers.map((p: any) => (
                                            <div key={p.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-700">{p.provider_name}</p>
                                                    <p className="text-[10px] text-gray-400">{p.provider_code} &bull; {p.contact_email || 'No email'}</p>
                                                </div>
                                                <ShieldCheck className="h-4 w-4 text-emerald-400/50" />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Recent Claims */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="p-5 border-b border-gray-200 flex items-center justify-between gap-3">
                                        <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm shrink-0">
                                            <ClipboardCheck className="h-4 w-4 text-amber-400" /> Recent Claims
                                        </h3>
                                        <select value={claimsProviderFilter} onChange={(e) => setClaimsProviderFilter(e.target.value)}
                                            className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-500">
                                            <option value="">All payers</option>
                                            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
                                        </select>
                                        <span className="text-[10px] font-black text-gray-300 shrink-0">{claims.length} total</span>
                                    </div>
                                    <div className="max-h-[320px] overflow-auto">
                                        {claims.length === 0 ? (
                                            <div className="py-12 flex flex-col items-center text-gray-300">
                                                <FileText className="h-8 w-8 mb-2" />
                                                <span className="text-xs font-bold">No claims submitted yet</span>
                                            </div>
                                        ) : claims.slice(0, 8).map((claim: any) => (
                                            <div key={claim.id} className="px-5 py-3.5 border-b border-gray-200 hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-700">{claim.claim_number}</p>
                                                        <p className="text-[10px] text-gray-400">
                                                            {claim.policy?.patient?.full_name} &bull; {claim.policy?.provider?.provider_name}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isSemiDischarged(claim.invoice?.admission) && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                                                    Semi Discharged
                                                                </span>
                                                            )}
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${getClaimStatusColor(claim.status)}`}>
                                                                {claim.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] font-bold text-gray-500 mt-1">
                                                            {'\u20B9'}{Number(claim.claimed_amount).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Provider Performance */}
                            {providerPerf.length > 0 && (
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="p-5 border-b border-gray-200">
                                        <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                            <Building2 className="h-4 w-4 text-teal-400" /> Provider Performance
                                        </h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Provider</th>
                                                    <th className="text-center px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Claims</th>
                                                    <th className="text-center px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Approval Rate</th>
                                                    <th className="text-center px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Avg Days</th>
                                                    <th className="text-right px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Total Settled</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {providerPerf.map((p: any, i: number) => (
                                                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                                                        <td className="px-5 py-3">
                                                            <p className="text-xs font-bold text-gray-700">{p.provider_name}</p>
                                                            <p className="text-[10px] text-gray-400">{p.provider_code}</p>
                                                        </td>
                                                        <td className="px-5 py-3 text-center text-xs font-bold text-gray-600">{p.totalClaims}</td>
                                                        <td className="px-5 py-3 text-center">
                                                            <span className={`text-xs font-black ${Number(p.approvalRate) >= 70 ? 'text-emerald-400' : Number(p.approvalRate) >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                                {p.approvalRate}%
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3 text-center text-xs font-bold text-gray-500">{p.avgSettlementDays}d</td>
                                                        <td className="px-5 py-3 text-right text-xs font-black text-teal-400">{'\u20B9'}{p.totalSettled.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>)}

                        {/* PROVIDERS TAB */}
                        {activeTab === 'providers' && (
                            <div className="space-y-4">
                                <input
                                    type="text"
                                    value={providerSearch}
                                    onChange={(e) => setProviderSearch(e.target.value)}
                                    placeholder="Search providers by name or code…"
                                    className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {providers.filter((p: any) => {
                                    const q = providerSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return p.provider_name?.toLowerCase().includes(q) || p.provider_code?.toLowerCase().includes(q);
                                }).map((p: any) => (
                                    <Link key={p.id} href={providerHref(p.id)}
                                        className="text-left bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-500/40 hover:shadow-md transition-all group">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 bg-blue-500/10 rounded-xl">
                                                <Building2 className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-black text-gray-700 truncate">{p.provider_name}</h4>
                                                <p className="text-[10px] font-mono text-gray-400">{p.provider_code}</p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-gray-300 ml-auto group-hover:text-blue-400 transition-colors" />
                                        </div>
                                        <div className="space-y-1.5 text-xs">
                                            {p.contact_email && <p className="text-gray-500 truncate">{p.contact_email}</p>}
                                            {p.contact_phone && <p className="text-gray-500">{p.contact_phone}</p>}
                                            {p.address && <p className="text-gray-400 text-[10px]">{p.address}</p>}
                                        </div>
                                        <p className="mt-3 text-[10px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1">
                                            <Users className="h-3 w-3" /> View patients
                                        </p>
                                    </Link>
                                ))}
                                {providers.length === 0 && (
                                    <div className="col-span-full py-20 text-center text-gray-300">
                                        <Building2 className="h-12 w-12 mx-auto mb-3" />
                                        <p className="text-sm font-bold">No insurance providers</p>
                                        <p className="text-xs mt-1">Click &quot;Add Provider&quot; or run seed script</p>
                                    </div>
                                )}
                                </div>
                            </div>
                        )}

                        {/* ── FINANCE / RECEIVABLES (unified TPA & Insurance) ── */}
                        {activeTab === 'receivables' && <ReceivablesDashboard providers={providers} />}
                        {activeTab === 'receipts' && <InsuranceReceipts providers={providers} />}
                        {activeTab === 'outstanding' && <OutstandingAging providers={providers} />}
                        {activeTab === 'sanction' && <BillWiseSanction providers={providers} />}
                    </>
                )}
            </div>

            {/* ADD PROVIDER MODAL */}
            {providerModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-blue-400" /> Add Insurance Provider
                            </h3>
                            <button onClick={() => setProviderModal(false)} className="text-gray-400 hover:text-gray-900 text-xl">&times;</button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Provider Name</label>
                                <input type="text" value={providerForm.provider_name} onChange={e => setProviderForm({ ...providerForm, provider_name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-blue-500/50 focus:outline-none" placeholder="e.g., Star Health" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Provider Code <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                                <input type="text" value={providerForm.provider_code} onChange={e => setProviderForm({ ...providerForm, provider_code: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-blue-500/50 focus:outline-none" placeholder="Auto-generated if blank" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Email</label>
                                    <input type="email" value={providerForm.contact_email} onChange={e => setProviderForm({ ...providerForm, contact_email: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none" placeholder="Optional" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Phone</label>
                                    <input type="text" value={providerForm.contact_phone} onChange={e => setProviderForm({ ...providerForm, contact_phone: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none" placeholder="Optional" />
                                </div>
                            </div>
                        </div>
                        <button onClick={handleAddProvider} disabled={!providerForm.provider_name}
                            className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            <Plus className="h-4 w-4" /> Add Provider
                        </button>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
