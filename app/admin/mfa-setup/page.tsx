'use client';

import React, { useState, useEffect } from 'react';
import { Shield, ArrowLeft, Loader2, CheckCircle, KeyRound, Copy, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { setupMFA, enableMFA, getMFAStatus } from '@/app/actions/mfa-actions';

export default function MFASetupPage() {
    const [step, setStep] = useState<'loading' | 'status' | 'setup' | 'verify' | 'done'>('loading');
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [userId, setUserId] = useState('');

    useEffect(() => {
        async function init() {
            try {
                const res = await fetch('/api/session');
                const session = await res.json();
                if (session?.id) {
                    setUserId(session.id);
                    const status = await getMFAStatus(session.id);
                    setMfaEnabled(status.enabled);
                    setStep('status');
                }
            } catch {
                setStep('status');
            }
        }
        init();
    }, []);

    const handleSetup = async () => {
        if (!userId) return;
        setLoading(true);
        const res = await setupMFA(userId);
        if (res.success) {
            setQrCode(res.qrCode || '');
            setSecret(res.secret || '');
            setBackupCodes(res.backupCodes || []);
            setStep('setup');
        } else {
            setError(res.error || 'Setup failed');
        }
        setLoading(false);
    };

    const handleVerify = async () => {
        if (!token || !userId) return;
        setLoading(true);
        setError('');
        const res = await enableMFA(userId, token);
        if (res.success) {
            setMfaEnabled(true);
            setStep('done');
        } else {
            setError(res.error || 'Verification failed');
        }
        setLoading(false);
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
    };

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[800px] mx-auto flex items-center gap-4">
                    <Link href="/admin/dashboard" className="p-2 hover:bg-white/5 rounded-lg transition-all">
                        <ArrowLeft className="h-4 w-4 text-white/40" />
                    </Link>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-400 to-indigo-600 rounded-xl blur-md opacity-50" />
                        <div className="relative bg-gradient-to-br from-violet-400 to-indigo-600 p-2 rounded-xl shadow-lg shadow-violet-500/20">
                            <Shield className="h-5 w-5 text-white" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-sm font-black tracking-tight">MFA Setup</h1>
                        <p className="text-[10px] text-white/30 font-medium">Two-Factor Authentication</p>
                    </div>
                </div>
            </header>

            <main className="max-w-[800px] mx-auto p-6 space-y-6">
                {step === 'loading' && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                    </div>
                )}

                {step === 'status' && (
                    <div className="bg-[#131A2E] border border-white/5 rounded-2xl p-8 text-center space-y-6">
                        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ${mfaEnabled ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 border border-white/10'}`}>
                            {mfaEnabled ? <CheckCircle className="h-10 w-10 text-emerald-400" /> : <Shield className="h-10 w-10 text-white/30" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black">{mfaEnabled ? 'MFA is Enabled' : 'MFA is Not Set Up'}</h2>
                            <p className="text-sm text-white/40 mt-2">
                                {mfaEnabled
                                    ? 'Your account is protected with two-factor authentication.'
                                    : 'Add an extra layer of security to your account with TOTP-based authentication.'
                                }
                            </p>
                        </div>
                        {!mfaEnabled && (
                            <button onClick={handleSetup} disabled={loading}
                                className="px-8 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 mx-auto disabled:opacity-50">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                Set Up MFA
                            </button>
                        )}
                    </div>
                )}

                {step === 'setup' && (
                    <div className="space-y-6">
                        <div className="bg-[#131A2E] border border-white/5 rounded-2xl p-8 space-y-6">
                            <h2 className="text-lg font-black">Step 1: Scan QR Code</h2>
                            <p className="text-sm text-white/40">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                            {qrCode && (
                                <div className="flex justify-center">
                                    <div className="bg-white p-4 rounded-xl">
                                        <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
                                    </div>
                                </div>
                            )}
                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-wider mb-2">Manual Entry Key</p>
                                <p className="font-mono text-sm text-white/70 break-all">{secret}</p>
                            </div>
                        </div>

                        <div className="bg-[#131A2E] border border-white/5 rounded-2xl p-8 space-y-6">
                            <h2 className="text-lg font-black">Step 2: Save Backup Codes</h2>
                            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-300 font-medium">Save these codes in a safe place. Each can only be used once if you lose your device.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {backupCodes.map((code, i) => (
                                    <div key={i} className="bg-white/5 rounded-lg px-3 py-2 font-mono text-sm text-white/60 text-center">
                                        {code}
                                    </div>
                                ))}
                            </div>
                            <button onClick={copyBackupCodes} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:bg-white/10 transition-all mx-auto">
                                <Copy className="h-3 w-3" /> Copy All Codes
                            </button>
                        </div>

                        <div className="bg-[#131A2E] border border-white/5 rounded-2xl p-8 space-y-4">
                            <h2 className="text-lg font-black">Step 3: Verify Setup</h2>
                            <p className="text-sm text-white/40">Enter the 6-digit code from your authenticator app to confirm setup.</p>
                            {error && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-400">{error}</div>
                            )}
                            <input
                                type="text"
                                value={token}
                                onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-lg font-mono tracking-[0.3em] focus:border-violet-500/50 focus:outline-none"
                                placeholder="000000"
                                maxLength={6}
                            />
                            <button onClick={handleVerify} disabled={loading || token.length < 6}
                                className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Verify & Enable MFA
                            </button>
                        </div>
                    </div>
                )}

                {step === 'done' && (
                    <div className="bg-[#131A2E] border border-emerald-500/20 rounded-2xl p-8 text-center space-y-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 rounded-2xl">
                            <CheckCircle className="h-10 w-10 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-emerald-400">MFA Enabled Successfully</h2>
                            <p className="text-sm text-white/40 mt-2">Your account is now protected with two-factor authentication. You will be prompted for a code on each login.</p>
                        </div>
                        <Link href="/admin/dashboard"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white/60 hover:bg-white/10 transition-all">
                            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                        </Link>
                    </div>
                )}
            </main>
        </div>
    );
}
