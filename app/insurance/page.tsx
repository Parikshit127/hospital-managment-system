'use client';

import { useState, useEffect } from 'react';
import {
    Shield, FileText, Clock, Loader2, ChevronRight,
    Plus, Eye, CheckCircle, AlertTriangle, ArrowUpRight,
    Building2, Wallet,
    ShieldCheck, ShieldAlert, ShieldX, ClipboardCheck
} from 'lucide-react';
import {
    getInsuranceProviders, getInsuranceClaims, getInsuranceStats,
    getAllPolicies, addInsuranceProvider,
    submitInsuranceClaim, updateClaimStatus, getRevenueLeakage, getClaimableInvoices,
    getProviderPerformance, autoSubmitClaim,
} from '@/app/actions/insurance-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';

export default function InsuranceDashboard() {
    const toast = useToast();
    const [stats, setStats] = useState<any>(null);
    const [providers, setProviders] = useState<any[]>([]);
    const [claims, setClaims] = useState<any[]>([]);
    const [policies, setPolicies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [claimFilter, setClaimFilter] = useState('');

    // Provider modal
    const [providerModal, setProviderModal] = useState(false);
    const [providerForm, setProviderForm] = useState({ provider_name: '', provider_code: '', contact_email: '', contact_phone: '' });

    // Claim update modal
    const [claimModal, setClaimModal] = useState<any>(null);
    const [claimUpdateForm, setClaimUpdateForm] = useState({ status: '', approved_amount: '', rejection_reason: '' });

    // New claim submission modal
    const [newClaimModal, setNewClaimModal] = useState(false);
    const [newClaimPolicyId, setNewClaimPolicyId] = useState('');
    const [newClaimInvoices, setNewClaimInvoices] = useState<any[]>([]);
    const [newClaimInvoiceId, setNewClaimInvoiceId] = useState('');
    const [newClaimAmount, setNewClaimAmount] = useState('');
    const [newClaimLoading, setNewClaimLoading] = useState(false);

    // Revenue leakage
    const [leakage, setLeakage] = useState<any[]>([]);
    const [autoSubmitting, setAutoSubmitting] = useState<number | null>(null);

    // Provider performance
    const [providerPerf, setProviderPerf] = useState<any[]>([]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, p, c, pol, leak, perf] = await Promise.all([
                getInsuranceStats(),
                getInsuranceProviders(),
                getInsuranceClaims({ status: claimFilter || undefined }),
                getAllPolicies(),
                getRevenueLeakage(),
                getProviderPerformance(),
            ]);
            if (s.success) setStats(s.data);
            if (p.success) setProviders(p.data || []);
            if (c.success) setClaims(c.data || []);
            if (pol.success) setPolicies(pol.data || []);
            if (leak.success) setLeakage(leak.data || []);
            if (perf.success) setProviderPerf(perf.data || []);
        } catch (err) { console.error('Insurance load error:', err); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [claimFilter]);

    const handleAddProvider = async () => {
        if (!providerForm.provider_name || !providerForm.provider_code) return;
        await addInsuranceProvider(providerForm);
        setProviderModal(false);
        setProviderForm({ provider_name: '', provider_code: '', contact_email: '', contact_phone: '' });
        loadData();
    };

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
    };

    const handleUpdateClaim = async () => {
        if (!claimModal || !claimUpdateForm.status) return;
        await updateClaimStatus(claimModal.id, {
            status: claimUpdateForm.status,
            approved_amount: claimUpdateForm.approved_amount ? parseFloat(claimUpdateForm.approved_amount) : undefined,
            rejection_reason: claimUpdateForm.rejection_reason || undefined,
        });
        setClaimModal(null);
        setClaimUpdateForm({ status: '', approved_amount: '', rejection_reason: '' });
        loadData();
    };

    const handleAutoSubmit = async (invoiceId: number) => {
        setAutoSubmitting(invoiceId);
        const res = await autoSubmitClaim(invoiceId);
        if (res.success) {
            loadData();
        } else {
            toast.error(res.error || 'Failed to auto-submit claim');
        }
        setAutoSubmitting(null);
    };

    const getClaimStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Submitted: 'text-blue-400 bg-blue-500/10',
            UnderReview: 'text-amber-400 bg-amber-500/10',
            Approved: 'text-emerald-400 bg-emerald-500/10',
            Rejected: 'text-rose-400 bg-rose-500/10',
            PartiallyApproved: 'text-orange-400 bg-orange-500/10',
            Settled: 'text-teal-400 bg-teal-500/10',
        };
        return map[status] || 'text-gray-500 bg-gray-100';
    };

    const getClaimStatusIcon = (status: string) => {
        const map: Record<string, any> = {
            Submitted: ShieldAlert,
            UnderReview: Clock,
            Approved: ShieldCheck,
            Rejected: ShieldX,
            PartiallyApproved: Shield,
            Settled: CheckCircle,
        };
        const Icon = map[status] || Shield;
        return <Icon className="h-3.5 w-3.5" />;
    };

    const headerActions = (
        <>
            <button onClick={handleOpenNewClaim} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                <Plus className="h-3.5 w-3.5" /> Submit Claim
            </button>
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
                    <div className="flex gap-2">
                        {['overview', 'claims', 'policies', 'providers', 'leakage'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize ${activeTab === tab ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-900'}`}>
                                {tab}
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
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Active Policies</span>
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg"><FileText className="h-3.5 w-3.5 text-emerald-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.activePolicies || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <CheckCircle className="h-3 w-3" /> Covered patients
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

                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Approved Total</span>
                                    <div className="p-1.5 bg-teal-500/10 rounded-lg"><Wallet className="h-3.5 w-3.5 text-teal-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">
                                    {'\u20B9'}{((stats?.approvedTotal || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                                    <ArrowUpRight className="h-3 w-3" /> {'\u20B9'}{((stats?.claimedTotal || 0) / 1000).toFixed(1)}K claimed
                                </div>
                            </div>
                        </div>

                        {/* OVERVIEW */}
                        {activeTab === 'overview' && (<>
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
                                    <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                        <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                            <ClipboardCheck className="h-4 w-4 text-amber-400" /> Recent Claims
                                        </h3>
                                        <button onClick={() => setActiveTab('claims')} className="text-[10px] font-black text-blue-400 uppercase tracking-wider hover:text-blue-300 flex items-center gap-1">
                                            View All <ChevronRight className="h-3 w-3" />
                                        </button>
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
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${getClaimStatusColor(claim.status)}`}>
                                                            {claim.status}
                                                        </span>
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

                        {/* CLAIMS TAB */}
                        {activeTab === 'claims' && (
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    {['', 'Submitted', 'UnderReview', 'Approved', 'Rejected', 'Settled'].map(f => (
                                        <button key={f} onClick={() => setClaimFilter(f)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${claimFilter === f ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                            {f || 'All'}
                                        </button>
                                    ))}
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Claim #</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Patient</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Provider</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Claimed</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Approved</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {claims.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-5 py-16 text-center text-gray-300">
                                                            <Shield className="h-8 w-8 mx-auto mb-2" />
                                                            <p className="text-xs font-bold">No claims found</p>
                                                        </td>
                                                    </tr>
                                                ) : claims.map((claim: any) => (
                                                    <tr key={claim.id} className="border-b border-gray-200 hover:bg-gray-50">
                                                        <td className="px-5 py-3.5 text-xs font-mono font-bold text-gray-700">{claim.claim_number}</td>
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-xs font-bold text-gray-700">{claim.policy?.patient?.full_name || '-'}</p>
                                                            <p className="text-[10px] text-gray-400">{claim.policy?.patient?.patient_id}</p>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-xs text-gray-500">{claim.policy?.provider?.provider_name || '-'}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-gray-700">{'\u20B9'}{Number(claim.claimed_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-emerald-400">
                                                            {claim.approved_amount ? `\u20B9${Number(claim.approved_amount).toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${getClaimStatusColor(claim.status)}`}>
                                                                {getClaimStatusIcon(claim.status)} {claim.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            {!['Settled', 'Rejected'].includes(claim.status) && (
                                                                <button onClick={() => { setClaimModal(claim); setClaimUpdateForm({ status: '', approved_amount: '', rejection_reason: '' }); }}
                                                                    className="p-1.5 hover:bg-blue-500/10 rounded-lg transition-all" title="Update Status">
                                                                    <Eye className="h-3.5 w-3.5 text-blue-400/60 hover:text-blue-400" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* POLICIES TAB */}
                        {activeTab === 'policies' && (
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <FileText className="h-4 w-4 text-emerald-400" /> Patient Insurance Policies
                                    </h3>
                                    <span className="text-xs font-bold text-gray-400">{policies.length} policies</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Patient</th>
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Provider</th>
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Policy #</th>
                                                <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Coverage</th>
                                                <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Remaining</th>
                                                <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                                                <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Valid Until</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {policies.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-5 py-16 text-center text-gray-300">
                                                        <FileText className="h-8 w-8 mx-auto mb-2" />
                                                        <p className="text-xs font-bold">No policies registered</p>
                                                    </td>
                                                </tr>
                                            ) : policies.map((pol: any) => (
                                                <tr key={pol.id} className="border-b border-gray-200 hover:bg-gray-50">
                                                    <td className="px-5 py-3.5">
                                                        <p className="text-xs font-bold text-gray-700">{pol.patient?.full_name}</p>
                                                        <p className="text-[10px] text-gray-400">{pol.patient?.patient_id}</p>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs text-gray-500">{pol.provider?.provider_name}</td>
                                                    <td className="px-5 py-3.5 text-xs font-mono text-gray-500">{pol.policy_number}</td>
                                                    <td className="px-5 py-3.5 text-right text-xs font-bold text-gray-700">{'\u20B9'}{Number(pol.coverage_limit || 0).toLocaleString()}</td>
                                                    <td className="px-5 py-3.5 text-right text-xs font-bold text-emerald-400">{'\u20B9'}{Number(pol.remaining_limit || 0).toLocaleString()}</td>
                                                    <td className="px-5 py-3.5 text-center">
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${pol.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                            {pol.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-center text-[10px] text-gray-500">
                                                        {pol.valid_until ? new Date(pol.valid_until).toLocaleDateString('en-IN') : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* REVENUE LEAKAGE TAB */}
                        {activeTab === 'leakage' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                                    <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-rose-400">Revenue Leakage Alert</p>
                                        <p className="text-xs text-gray-500">Finalized invoices for insured patients with no insurance claim filed. {leakage.length} invoice(s) found.</p>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Invoice #</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Patient</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Type</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Net Amount</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Date</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leakage.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-5 py-16 text-center text-gray-300">
                                                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400/40" />
                                                            <p className="text-xs font-bold text-emerald-400/60">No revenue leakage detected</p>
                                                        </td>
                                                    </tr>
                                                ) : leakage.map((inv: any) => (
                                                    <tr key={inv.id} className="border-b border-gray-200 hover:bg-rose-50">
                                                        <td className="px-5 py-3.5 text-xs font-mono font-bold text-gray-700">{inv.invoice_number}</td>
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-xs font-bold text-gray-700">{inv.patient?.full_name || '-'}</p>
                                                            <p className="text-[10px] text-gray-400">{inv.patient?.patient_id}</p>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-xs text-gray-500">{inv.invoice_type}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-rose-400">{'\u20B9'}{Number(inv.net_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gray-100 text-gray-500">{inv.status}</span>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center text-[10px] text-gray-500">
                                                            {new Date(inv.created_at).toLocaleDateString('en-IN')}
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <button onClick={() => handleAutoSubmit(inv.id)} disabled={autoSubmitting === inv.id}
                                                                className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50 inline-flex items-center gap-1">
                                                                {autoSubmitting === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                                                                Auto-Submit
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PROVIDERS TAB */}
                        {activeTab === 'providers' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {providers.map((p: any) => (
                                    <div key={p.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-500/20 transition-all">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 bg-blue-500/10 rounded-xl">
                                                <Building2 className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-gray-700">{p.provider_name}</h4>
                                                <p className="text-[10px] font-mono text-gray-400">{p.provider_code}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 text-xs">
                                            {p.contact_email && <p className="text-gray-500">{p.contact_email}</p>}
                                            {p.contact_phone && <p className="text-gray-500">{p.contact_phone}</p>}
                                            {p.address && <p className="text-gray-400 text-[10px]">{p.address}</p>}
                                        </div>
                                    </div>
                                ))}
                                {providers.length === 0 && (
                                    <div className="col-span-full py-20 text-center text-gray-300">
                                        <Building2 className="h-12 w-12 mx-auto mb-3" />
                                        <p className="text-sm font-bold">No insurance providers</p>
                                        <p className="text-xs mt-1">Click &quot;Add Provider&quot; or run seed script</p>
                                    </div>
                                )}
                            </div>
                        )}
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
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Provider Code</label>
                                <input type="text" value={providerForm.provider_code} onChange={e => setProviderForm({ ...providerForm, provider_code: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-blue-500/50 focus:outline-none" placeholder="e.g., STAR" />
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
                        <button onClick={handleAddProvider} disabled={!providerForm.provider_name || !providerForm.provider_code}
                            className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            <Plus className="h-4 w-4" /> Add Provider
                        </button>
                    </div>
                </div>
            )}

            {/* CLAIM UPDATE MODAL */}
            {claimModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <ClipboardCheck className="h-5 w-5 text-amber-400" /> Update Claim
                            </h3>
                            <button onClick={() => setClaimModal(null)} className="text-gray-400 hover:text-gray-900 text-xl">&times;</button>
                        </div>
                        <div className="bg-gray-100 rounded-xl p-3 text-xs space-y-1">
                            <p className="font-mono font-bold text-gray-500">{claimModal.claim_number}</p>
                            <p className="text-gray-400">
                                Claimed: {'\u20B9'}{Number(claimModal.claimed_amount).toLocaleString()} &bull;
                                Current: <span className={getClaimStatusColor(claimModal.status).split(' ')[0]}>{claimModal.status}</span>
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">New Status</label>
                                <select value={claimUpdateForm.status} onChange={e => setClaimUpdateForm({ ...claimUpdateForm, status: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none">
                                    <option value="">Select Status</option>
                                    {['UnderReview', 'Approved', 'PartiallyApproved', 'Rejected', 'Settled'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            {['Approved', 'PartiallyApproved', 'Settled'].includes(claimUpdateForm.status) && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Approved Amount</label>
                                    <input type="number" value={claimUpdateForm.approved_amount} onChange={e => setClaimUpdateForm({ ...claimUpdateForm, approved_amount: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none" />
                                </div>
                            )}
                            {claimUpdateForm.status === 'Rejected' && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Rejection Reason</label>
                                    <input type="text" value={claimUpdateForm.rejection_reason} onChange={e => setClaimUpdateForm({ ...claimUpdateForm, rejection_reason: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none" />
                                </div>
                            )}
                        </div>
                        <button onClick={handleUpdateClaim} disabled={!claimUpdateForm.status}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            <CheckCircle className="h-4 w-4" /> Update Claim
                        </button>
                    </div>
                </div>
            )}

            {/* NEW CLAIM SUBMISSION MODAL */}
            {newClaimModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <FileText className="h-5 w-5 text-emerald-400" /> Submit Insurance Claim
                            </h3>
                            <button onClick={() => setNewClaimModal(false)} className="text-gray-400 hover:text-gray-900 text-xl">&times;</button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Select Policy</label>
                                <select value={newClaimPolicyId} onChange={e => handlePolicyChange(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none">
                                    <option value="" className="bg-white text-gray-900">Choose a policy...</option>
                                    {policies.filter((p: any) => p.status === 'Active').map((pol: any) => (
                                        <option key={pol.id} value={pol.id} className="bg-white text-gray-900">
                                            {pol.patient?.full_name} — {pol.provider?.provider_name} ({pol.policy_number})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {newClaimPolicyId && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Select Invoice</label>
                                    {newClaimInvoices.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-2">No claimable invoices for this patient</p>
                                    ) : (
                                        <select value={newClaimInvoiceId} onChange={e => {
                                            setNewClaimInvoiceId(e.target.value);
                                            const inv = newClaimInvoices.find((i: any) => i.id === parseInt(e.target.value));
                                            if (inv) setNewClaimAmount(String(inv.net_amount));
                                        }}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none">
                                            <option value="" className="bg-white text-gray-900">Choose invoice...</option>
                                            {newClaimInvoices.map((inv: any) => (
                                                <option key={inv.id} value={inv.id} className="bg-white text-gray-900">
                                                    {inv.invoice_number} — {'\u20B9'}{Number(inv.net_amount).toLocaleString()} ({inv.status})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                            {newClaimInvoiceId && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Claim Amount</label>
                                    <input type="number" value={newClaimAmount} onChange={e => setNewClaimAmount(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none"
                                        placeholder="Amount to claim" />
                                </div>
                            )}
                        </div>
                        <button onClick={handleSubmitNewClaim} disabled={!newClaimPolicyId || !newClaimInvoiceId || !newClaimAmount || newClaimLoading}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {newClaimLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Submit Claim
                        </button>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
