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
import { useInvestorTheme } from '../investor-theme-context';

export default function InvestorSettingsPage() {
    const { theme } = useInvestorTheme();
    const isDark = theme === 'dark';

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
                    className={`p-2.5 rounded-2xl transition-all cursor-pointer shadow-sm border ${
                        isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                            : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-orange-50'
                    }`}
                    title="Back to Executive Dashboard"
                >
                    <ArrowLeft className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                </Link>
                <div>
                    <h1 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Portal Access Controls</h1>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage investor logins, security keys, and 24h temporary guest access</p>
                </div>
            </div>

            {/* Header Banner */}
            <div className={`rounded-3xl p-8 shadow-xl border relative overflow-hidden text-white ${
                isDark
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-slate-900 border-slate-800'
            }`}>
                <div className="relative z-10 space-y-3 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/30">
                        <KeyRound className="w-3.5 h-3.5" />
                        Investor Access Management
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-white">Investor Credentials & 24h Access Keys</h1>
                    <p className="text-sm font-medium leading-relaxed text-slate-300">
                        Manage permanent access keys for promoters or generate 24-hour temporary login credentials for external audit reviews.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-3 items-center text-xs">
                        <a
                            href="/login/investor"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl shadow-md transition-all cursor-pointer"
                        >
                            <span>Open Investor Login</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                            onClick={handleSetupPermanent}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold rounded-2xl border border-slate-700 backdrop-blur-md transition-all cursor-pointer"
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                            <span>Reset Standard Creds (investor / inv@4321)</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Credentials Info Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`p-6 rounded-3xl border shadow-sm flex flex-col justify-between ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                }`}>
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Standard Login</span>
                            <span className={`px-3 py-1 font-mono text-[11px] font-bold rounded-full border ${
                                isDark
                                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                    : 'bg-orange-50 text-orange-800 border-orange-200'
                            }`}>
                                Permanent Credential
                            </span>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-bold">Username: <code className={`px-2.5 py-1 rounded-xl font-mono border ${
                                isDark ? 'bg-slate-950 text-orange-400 border-slate-800' : 'bg-slate-100 text-slate-900 border-slate-200'
                            }`}>investor</code></div>
                            <div className="text-sm font-bold">Password: <code className={`px-2.5 py-1 rounded-xl font-mono border ${
                                isDark ? 'bg-slate-950 text-orange-400 border-slate-800' : 'bg-slate-100 text-slate-900 border-slate-200'
                            }`}>inv@4321</code></div>
                        </div>
                    </div>
                    <p className={`text-xs font-medium mt-4 border-t pt-3 ${
                        isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-100'
                    }`}>
                        Direct URL: <code className="text-orange-600 dark:text-orange-400 font-mono">/login/investor</code> (no main admin login required).
                    </p>
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm flex flex-col justify-between ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                }`}>
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>24-Hour Temporary Login</span>
                            <span className={`px-3 py-1 font-mono text-[11px] font-bold rounded-full border ${
                                isDark
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                                Auto-Expires in 24h
                            </span>
                        </div>
                        <p className={`text-xs font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Create one-time or time-bounded credentials for external investors. Access automatically revokes after 24 hours.
                        </p>
                    </div>
                    <div className={`mt-4 border-t pt-3 flex gap-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                        <button
                            onClick={() => handleCreateTemp(false)}
                            disabled={isPending}
                            className="flex-1 py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Generate 24h Access Key</span>
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            disabled={isPending}
                            className={`py-2.5 px-4 font-bold rounded-2xl text-xs border transition-all cursor-pointer ${
                                isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                            }`}
                        >
                            Custom
                        </button>
                    </div>
                </div>
            </div>

            {/* Latest Generated Credential Alert Banner */}
            {latestCreated && (
                <div className={`p-6 rounded-3xl shadow-xl space-y-4 border ${
                    isDark
                        ? 'bg-orange-950/40 border-orange-500/40 text-orange-200 backdrop-blur-md'
                        : 'bg-orange-50 border-orange-200 text-orange-950 shadow-sm'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className={`flex items-center gap-2 font-black text-base ${isDark ? 'text-orange-300' : 'text-orange-900'}`}>
                            <UserCheck className="w-5 h-5 text-orange-500" />
                            New 24-Hour Temporary Access Key Created!
                        </div>
                        <button
                            onClick={() => setLatestCreated(null)}
                            className={`text-xs font-bold ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Dismiss
                        </button>
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl border text-sm font-mono ${
                        isDark ? 'bg-slate-950/80 border-orange-500/30' : 'bg-white border-orange-200 text-slate-900 shadow-sm'
                    }`}>
                        <div>
                            <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Username</span>
                            <code className="text-orange-600 dark:text-orange-400 text-base font-black">{latestCreated.username}</code>
                        </div>
                        <div>
                            <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Password</span>
                            <code className="text-orange-600 dark:text-orange-400 text-base font-black">{latestCreated.password}</code>
                        </div>
                        <div>
                            <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Valid Until</span>
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{new Date(latestCreated.expires_at).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <p className={`text-xs font-semibold ${isDark ? 'text-orange-300' : 'text-orange-900'}`}>
                            Share these credentials with the investor. Direct URL: <span className="underline font-mono">/login/investor</span>
                        </p>
                        <button
                            onClick={() =>
                                copyToClipboard(
                                    `Investor Portal Credentials (Valid for 24 Hours):\nURL: ${window.location.origin}/login/investor\nUsername: ${latestCreated.username}\nPassword: ${latestCreated.password}\nExpires: ${new Date(latestCreated.expires_at).toLocaleString()}`
                                )
                            }
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-2xl shadow flex items-center gap-1.5 cursor-pointer"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copied Details!' : 'Copy Full Details'}
                        </button>
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className={`p-4 font-semibold text-xs rounded-2xl border flex items-center gap-2 ${
                    isDark ? 'bg-rose-950/40 text-rose-300 border-rose-900/60' : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    {errorMsg}
                </div>
            )}

            {/* Credentials List Table */}
            <div className={`rounded-3xl border shadow-sm overflow-hidden ${
                isDark
                    ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                    : 'bg-white border-slate-200 shadow-slate-200/50'
            }`}>
                <div className={`border-b p-6 flex items-center justify-between ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                    <div>
                        <h2 className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Active & Historical Access Credentials</h2>
                        <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Key Store Ledger</p>
                    </div>
                    <button
                        onClick={loadCredentials}
                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                            isDark
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                        title="Refresh List"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className={`border-b text-[11px] font-black uppercase tracking-wider ${
                                isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}>
                                <th className="py-3.5 px-6">Username</th>
                                <th className="py-3.5 px-6">Password</th>
                                <th className="py-3.5 px-6">Type</th>
                                <th className="py-3.5 px-6">Expiration</th>
                                <th className="py-3.5 px-6">Created</th>
                                <th className="py-3.5 px-6 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y font-medium ${isDark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className={`py-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        Loading investor credentials...
                                    </td>
                                </tr>
                            ) : credentials.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className={`py-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        No database credentials found. Click "Reset Standard Creds" above to seed.
                                    </td>
                                </tr>
                            ) : (
                                credentials.map((item) => (
                                    <tr key={item.id} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                                        <td className={`py-4 px-6 font-bold font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                            {item.username}
                                        </td>
                                        <td className={`py-4 px-6 font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {item.password}
                                        </td>
                                        <td className="py-4 px-6">
                                            {item.is_temporary ? (
                                                <span className={`px-2.5 py-1 font-bold text-[10px] rounded-full border inline-flex items-center gap-1 ${
                                                    isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                }`}>
                                                    <Clock className="w-3 h-3" /> 24h Temporary
                                                </span>
                                            ) : (
                                                <span className={`px-2.5 py-1 font-bold text-[10px] rounded-full border inline-flex items-center gap-1 ${
                                                    isDark ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-800 border-orange-200'
                                                }`}>
                                                    <Lock className="w-3 h-3" /> Permanent
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-xs font-bold">
                                            {item.is_expired ? (
                                                <span className={`px-2.5 py-0.5 rounded-full border ${isDark ? 'text-rose-400 bg-rose-950/40 border-rose-900' : 'text-rose-700 bg-rose-50 border-rose-200'}`}>Expired</span>
                                            ) : item.is_temporary ? (
                                                <span className="text-amber-600 dark:text-amber-300 font-bold font-mono">{formatRemaining(item.expires_at)}</span>
                                            ) : (
                                                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Never</span>
                                            )}
                                        </td>
                                        <td className={`py-4 px-6 text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id, item.username)}
                                                className={`p-2 rounded-xl transition-all border cursor-pointer ${
                                                    isDark
                                                        ? 'bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border-rose-900/50'
                                                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                                }`}
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
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${
                    isDark ? 'bg-slate-950/80' : 'bg-slate-900/50'
                }`}>
                    <div className={`rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 border ring-1 ${
                        isDark
                            ? 'bg-[#0b1329] border-slate-700/80 ring-white/10 text-white'
                            : 'bg-white border-slate-200 text-slate-900 shadow-xl'
                    }`}>
                        <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                            <h3 className="text-lg font-black">Custom 24h Investor Login</h3>
                            <button onClick={() => setShowCreateModal(false)} className={`font-bold text-sm ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className={`block text-xs uppercase font-bold tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Username (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. investor_john"
                                    value={customUsername}
                                    onChange={(e) => setCustomUsername(e.target.value)}
                                    className={`w-full p-3 rounded-2xl text-sm font-mono border focus:outline-none ${
                                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-orange-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-orange-500'
                                    }`}
                                />
                            </div>

                            <div>
                                <label className={`block text-xs uppercase font-bold tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Password (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. inv@9876"
                                    value={customPassword}
                                    onChange={(e) => setCustomPassword(e.target.value)}
                                    className={`w-full p-3 rounded-2xl text-sm font-mono border focus:outline-none ${
                                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-orange-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-orange-500'
                                    }`}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className={`flex-1 py-3 font-bold text-xs rounded-2xl transition-colors ${
                                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateTemp(true)}
                                disabled={isPending}
                                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-2xl shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
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
