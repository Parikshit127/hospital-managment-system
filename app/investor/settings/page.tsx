'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
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
    ArrowLeft,
} from 'lucide-react';
import {
    getInvestorCredentialsList,
    createTemporaryInvestorCredential,
    setupPermanentInvestorCredential,
    deleteInvestorCredential,
} from '@/app/actions/investor-auth-actions';

export default function InvestorSettingsPage() {
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
                'investor-portal'
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
        <div className="max-w-5xl mx-auto space-y-8 pb-12 print:hidden">
            <div className="flex items-center gap-3">
                <Link
                    href="/investor/dashboard"
                    className="p-2.5 bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-2xl transition-all cursor-pointer shadow-md"
                    title="Back to Executive Dashboard"
                >
                    <ArrowLeft className="w-4 h-4 text-emerald-400" />
                </Link>
                <div>
                    <h1 className="text-xl font-black text-white tracking-tight">Portal Access Controls</h1>
                    <p className="text-xs text-slate-400 font-medium">Manage investor logins, security keys, and 24h temporary guest access</p>
                </div>
            </div>

            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-[#0b162f] to-slate-950 text-white rounded-3xl p-8 shadow-2xl border border-slate-800/80 relative overflow-hidden">
                <div className="relative z-10 space-y-3 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                        <KeyRound className="w-3.5 h-3.5" />
                        Investor Access Management
                    </div>
                    <h1 className="text-3xl font-black tracking-tight">Investor Credentials & 24h Access Keys</h1>
                    <p className="text-sm text-slate-300 font-medium leading-relaxed">
                        Manage permanent access keys for promoters or generate 24-hour temporary login credentials for external audit reviews.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-3 items-center text-xs">
                        <a
                            href="/login/investor"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                        >
                            <span>Open Investor Login</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                            onClick={handleSetupPermanent}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-extrabold rounded-2xl border border-slate-700 backdrop-blur-md transition-all cursor-pointer"
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Reset Standard Creds (investor / inv@4321)</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Credentials Info Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-xl flex flex-col justify-between backdrop-blur-md">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Standard Login</span>
                            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold rounded-full border border-emerald-500/30">
                                Permanent Credential
                            </span>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-bold text-slate-200">Username: <code className="bg-slate-950 px-2.5 py-1 rounded-xl font-mono text-emerald-400 border border-slate-800">investor</code></div>
                            <div className="text-sm font-bold text-slate-200">Password: <code className="bg-slate-950 px-2.5 py-1 rounded-xl font-mono text-emerald-400 border border-slate-800">inv@4321</code></div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-4 border-t border-slate-800/80 pt-3">
                        Direct URL: <code className="text-indigo-400 font-mono">/login/investor</code> (no main admin login required).
                    </p>
                </div>

                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-xl flex flex-col justify-between backdrop-blur-md">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">24-Hour Temporary Login</span>
                            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 font-mono text-[11px] font-bold rounded-full border border-amber-500/30">
                                Auto-Expires in 24h
                            </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">
                            Create one-time or time-bounded credentials for external investors. Access automatically revokes after 24 hours.
                        </p>
                    </div>
                    <div className="mt-4 border-t border-slate-800/80 pt-3 flex gap-2">
                        <button
                            onClick={() => handleCreateTemp(false)}
                            disabled={isPending}
                            className="flex-1 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-emerald-500/20"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Generate 24h Access Key</span>
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            disabled={isPending}
                            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs border border-slate-700 transition-all cursor-pointer"
                        >
                            Custom
                        </button>
                    </div>
                </div>
            </div>

            {/* Latest Generated Credential Alert Banner */}
            {latestCreated && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 p-6 rounded-3xl shadow-xl space-y-4 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-300 font-black text-base">
                            <UserCheck className="w-5 h-5 text-emerald-400" />
                            New 24-Hour Temporary Access Key Created!
                        </div>
                        <button
                            onClick={() => setLatestCreated(null)}
                            className="text-xs font-bold text-slate-400 hover:text-slate-200"
                        >
                            Dismiss
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/80 p-4 rounded-2xl border border-emerald-500/30 text-sm font-mono">
                        <div>
                            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Username</span>
                            <code className="text-emerald-400 text-base font-black">{latestCreated.username}</code>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Password</span>
                            <code className="text-emerald-400 text-base font-black">{latestCreated.password}</code>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Valid Until</span>
                            <span className="text-slate-200 text-xs">{new Date(latestCreated.expires_at).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-emerald-300 font-semibold">
                            Share these credentials with the investor. Direct URL: <span className="underline font-mono">/login/investor</span>
                        </p>
                        <button
                            onClick={() =>
                                copyToClipboard(
                                    `Investor Portal Credentials (Valid for 24 Hours):\nURL: ${window.location.origin}/login/investor\nUsername: ${latestCreated.username}\nPassword: ${latestCreated.password}\nExpires: ${new Date(latestCreated.expires_at).toLocaleString()}`
                                )
                            }
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-2xl shadow flex items-center gap-1.5 cursor-pointer shadow-emerald-500/20"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copied Details!' : 'Copy Full Details'}
                        </button>
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="p-4 bg-rose-950/40 text-rose-300 font-semibold text-xs rounded-2xl border border-rose-900/60 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    {errorMsg}
                </div>
            )}

            {/* Credentials List Table */}
            <div className="bg-slate-900/60 rounded-3xl border border-slate-800/80 shadow-xl overflow-hidden backdrop-blur-md">
                <div className="bg-slate-950/60 border-b border-slate-800 p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-white">Active & Historical Access Credentials</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Key Store Ledger</p>
                    </div>
                    <button
                        onClick={loadCredentials}
                        className="p-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-2xl transition-all cursor-pointer"
                        title="Refresh List"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                                <th className="py-3.5 px-6">Username</th>
                                <th className="py-3.5 px-6">Password</th>
                                <th className="py-3.5 px-6">Type</th>
                                <th className="py-3.5 px-6">Expiration</th>
                                <th className="py-3.5 px-6">Created</th>
                                <th className="py-3.5 px-6 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-medium">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                                        Loading investor credentials...
                                    </td>
                                </tr>
                            ) : credentials.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                                        No database credentials found. Click "Reset Standard Creds" above to seed.
                                    </td>
                                </tr>
                            ) : (
                                credentials.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                        <td className="py-4 px-6 font-bold text-slate-200 font-mono">
                                            {item.username}
                                        </td>
                                        <td className="py-4 px-6 font-mono text-slate-400">
                                            {item.password}
                                        </td>
                                        <td className="py-4 px-6">
                                            {item.is_temporary ? (
                                                <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 font-bold text-[10px] rounded-full border border-amber-500/30 inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> 24h Temporary
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-[10px] rounded-full border border-emerald-500/30 inline-flex items-center gap-1">
                                                    <Lock className="w-3 h-3" /> Permanent
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-xs font-bold">
                                            {item.is_expired ? (
                                                <span className="text-rose-400 font-bold bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-900">Expired</span>
                                            ) : item.is_temporary ? (
                                                <span className="text-amber-300 font-bold font-mono">{formatRemaining(item.expires_at)}</span>
                                            ) : (
                                                <span className="text-slate-500">Never</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-xs text-slate-400 font-mono">
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id, item.username)}
                                                className="p-2 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 rounded-xl transition-all border border-rose-900/50 cursor-pointer"
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

            {/* Custom Temp Credential Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-[#0b1329] border border-slate-700/80 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 ring-1 ring-white/10">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <h3 className="text-lg font-black text-white">Custom 24h Investor Login</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white font-bold text-sm">
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs uppercase font-bold text-slate-400 tracking-wider mb-1">
                                    Username (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. investor_john"
                                    value={customUsername}
                                    onChange={(e) => setCustomUsername(e.target.value)}
                                    className="w-full p-3 bg-slate-950 border border-slate-800 text-slate-200 rounded-2xl text-sm font-mono focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-slate-400 tracking-wider mb-1">
                                    Password (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. inv@9876"
                                    value={customPassword}
                                    onChange={(e) => setCustomPassword(e.target.value)}
                                    className="w-full p-3 bg-slate-950 border border-slate-800 text-slate-200 rounded-2xl text-sm font-mono focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 py-3 text-slate-400 hover:text-white font-bold text-xs hover:bg-slate-900 rounded-2xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateTemp(true)}
                                disabled={isPending}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-2xl shadow transition-all flex items-center justify-center gap-2 cursor-pointer shadow-emerald-500/20"
                            >
                                {isPending ? 'Generating...' : 'Create 24h Access Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
