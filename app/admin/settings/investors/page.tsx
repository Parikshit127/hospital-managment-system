'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    ShieldCheck,
    KeyRound,
    Clock,
    Plus,
    Copy,
    Check,
    Trash2,
    RefreshCw,
    ExternalLink,
    Lock,
    UserCheck,
    AlertCircle,
} from 'lucide-react';
import {
    getInvestorCredentialsList,
    createTemporaryInvestorCredential,
    setupPermanentInvestorCredential,
    deleteInvestorCredential,
} from '@/app/actions/investor-auth-actions';

export default function InvestorCredentialsPage() {
    const [credentials, setCredentials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    // Modal state for custom temp credential
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [customUsername, setCustomUsername] = useState('');
    const [customPassword, setCustomPassword] = useState('');

    // Generated credential highlight modal
    const [latestCreated, setLatestCreated] = useState<any | null>(null);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const loadCredentials = async () => {
        setLoading(true);
        const res = await getInvestorCredentialsList();
        if (res.success) {
            setCredentials(res.credentials || []);
        } else {
            setErrorMsg(res.error || 'Failed to load credentials');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadCredentials();
    }, []);

    const handleCreateTemp = (useCustom: boolean = false) => {
        setErrorMsg(null);
        startTransition(async () => {
            const res = await createTemporaryInvestorCredential(
                useCustom ? customUsername : undefined,
                useCustom ? customPassword : undefined,
                'admin'
            );

            if (res.success && res.credential) {
                setLatestCreated(res.credential);
                setShowCreateModal(false);
                setCustomUsername('');
                setCustomPassword('');
                await loadCredentials();
            } else {
                setErrorMsg(res.error || 'Failed to create temporary credential');
            }
        });
    };

    const handleSetupPermanent = () => {
        startTransition(async () => {
            const res = await setupPermanentInvestorCredential();
            if (res.success) {
                await loadCredentials();
                alert(`Permanent investor credentials set to: ${res.username} / ${res.password}`);
            } else {
                alert(`Error: ${res.error}`);
            }
        });
    };

    const handleDelete = async (id: string, username: string) => {
        if (!confirm(`Are you sure you want to delete credential for "${username}"?`)) return;
        startTransition(async () => {
            const res = await deleteInvestorCredential(id);
            if (res.success) {
                await loadCredentials();
            } else {
                alert(`Error: ${res.error}`);
            }
        });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatRemaining = (expiresAtStr: string | null) => {
        if (!expiresAtStr) return 'Permanent';
        const diffMs = new Date(expiresAtStr).getTime() - Date.now();
        if (diffMs <= 0) return 'Expired';
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${mins}m remaining`;
    };

    return (
        <AdminPage
            pageTitle="Investor Portal Credentials"
            pageIcon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
        >
            <div className="max-w-5xl mx-auto space-y-8 pb-12">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
                    <div className="relative z-10 space-y-3 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                            <KeyRound className="w-3.5 h-3.5" />
                            Investor Portal Access Control
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">Investor Credentials & 24h Temp Access</h1>
                        <p className="text-sm text-slate-300 font-medium leading-relaxed">
                            Manage access keys for investors and promoters. Generate 24-hour temporary login credentials for quick external reviews.
                        </p>
                        <div className="pt-2 flex flex-wrap gap-3 items-center text-xs">
                            <a
                                href="/login/investor"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                            >
                                <span>Open Investor Portal</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                                onClick={handleSetupPermanent}
                                disabled={isPending}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl backdrop-blur-md transition-all cursor-pointer"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Reset Standard Creds (investor / inv@4321)</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Credentials Info Box */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Standard Login</span>
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-extrabold text-[11px] rounded-full border border-emerald-200">
                                    Permanent
                                </span>
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-bold text-gray-900">Username: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-emerald-700">investor</code></div>
                                <div className="text-sm font-bold text-gray-900">Password: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-emerald-700">inv@4321</code></div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-4 border-t border-gray-100 pt-3">
                            Direct URL: <code className="text-indigo-600 font-mono">/login/investor</code> (no admin login required).
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">24-Hour Temporary Login</span>
                                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-extrabold text-[11px] rounded-full border border-amber-200">
                                    Expires in 24 Hours
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                Create one-time or time-bounded credentials for external investors. Access automatically revokes after 24 hours.
                            </p>
                        </div>
                        <div className="mt-4 border-t border-gray-100 pt-3 flex gap-2">
                            <button
                                onClick={() => handleCreateTemp(false)}
                                disabled={isPending}
                                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Quick Auto-Generate 24h Creds</span>
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                disabled={isPending}
                                className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                            >
                                Custom
                            </button>
                        </div>
                    </div>
                </div>

                {/* Latest Generated Credential Alert Banner */}
                {latestCreated && (
                    <div className="bg-emerald-50 border-2 border-emerald-500 p-6 rounded-2xl shadow-md space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-900 font-black text-base">
                                <UserCheck className="w-5 h-5 text-emerald-600" />
                                New 24-Hour Temporary Investor Credential Created!
                            </div>
                            <button
                                onClick={() => setLatestCreated(null)}
                                className="text-xs font-bold text-gray-400 hover:text-gray-600"
                            >
                                Dismiss
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-emerald-200 text-sm font-bold">
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-gray-400">Username</span>
                                <code className="text-emerald-700 text-base">{latestCreated.username}</code>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-gray-400">Password</span>
                                <code className="text-emerald-700 text-base">{latestCreated.password}</code>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-wider text-gray-400">Valid Until</span>
                                <span className="text-gray-800 text-xs">{new Date(latestCreated.expires_at).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-emerald-800 font-semibold">
                                Share these credentials with the investor. Direct URL: <span className="underline font-mono">/login/investor</span>
                            </p>
                            <button
                                onClick={() =>
                                    copyToClipboard(
                                        `Investor Portal Credentials (Valid for 24 Hours):\nURL: ${window.location.origin}/login/investor\nUsername: ${latestCreated.username}\nPassword: ${latestCreated.password}\nExpires: ${new Date(latestCreated.expires_at).toLocaleString()}`
                                    )
                                }
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 cursor-pointer"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied Full Details!' : 'Copy Details'}
                            </button>
                        </div>
                    </div>
                )}

                {errorMsg && (
                    <div className="p-4 bg-red-50 text-red-700 font-semibold text-xs rounded-xl border border-red-200 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        {errorMsg}
                    </div>
                )}

                {/* Credentials List Table */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 p-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Active & Historical Investor Credentials</h2>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Credentials Stored in Database</p>
                        </div>
                        <button
                            onClick={loadCredentials}
                            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all cursor-pointer"
                            title="Refresh List"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-200 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                                    <th className="py-3.5 px-6">Username</th>
                                    <th className="py-3.5 px-6">Password</th>
                                    <th className="py-3.5 px-6">Type</th>
                                    <th className="py-3.5 px-6">Expiration</th>
                                    <th className="py-3.5 px-6">Created</th>
                                    <th className="py-3.5 px-6 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-gray-400 text-xs">
                                            Loading investor credentials...
                                        </td>
                                    </tr>
                                ) : credentials.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-gray-400 text-xs">
                                            No database credentials found. Click "Reset Standard Creds" above to seed.
                                        </td>
                                    </tr>
                                ) : (
                                    credentials.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="py-4 px-6 font-bold text-gray-900 font-mono">
                                                {item.username}
                                            </td>
                                            <td className="py-4 px-6 font-mono text-gray-600">
                                                {item.password}
                                            </td>
                                            <td className="py-4 px-6">
                                                {item.is_temporary ? (
                                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-extrabold text-[10px] rounded-full border border-amber-200 inline-flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> 24h Temporary
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-extrabold text-[10px] rounded-full border border-emerald-200 inline-flex items-center gap-1">
                                                        <Lock className="w-3 h-3" /> Permanent
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-xs font-bold">
                                                {item.is_expired ? (
                                                    <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">Expired</span>
                                                ) : item.is_temporary ? (
                                                    <span className="text-amber-700 font-bold">{formatRemaining(item.expires_at)}</span>
                                                ) : (
                                                    <span className="text-gray-400">Never</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-xs text-gray-500">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <button
                                                    onClick={() => handleDelete(item.id, item.username)}
                                                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all cursor-pointer"
                                                    title="Revoke / Delete Credential"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Custom Temp Credential Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-gray-100 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-black text-gray-900">Custom 24h Investor Login</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-sm">
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 tracking-wider mb-1">
                                    Username (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. investor_john"
                                    value={customUsername}
                                    onChange={(e) => setCustomUsername(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 tracking-wider mb-1">
                                    Password (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. inv@9876"
                                    value={customPassword}
                                    onChange={(e) => setCustomPassword(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 py-3 text-gray-600 font-bold text-xs hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateTemp(true)}
                                disabled={isPending}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isPending ? 'Generating...' : 'Create 24h Credential'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
