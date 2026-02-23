'use client';

import React, { useState } from 'react';
import { Shield, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import { completeMfaLogin } from '@/app/login/actions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function MFAVerifyPage() {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token.trim()) return;

        setLoading(true);
        setError('');

        const result = await completeMfaLogin(token.trim());

        if (result.success && result.role) {
            const routes: Record<string, string> = {
                receptionist: '/reception/triage',
                doctor: '/doctor/dashboard',
                lab_technician: '/lab/technician',
                pharmacist: '/pharmacy/billing',
                admin: '/admin/dashboard',
                finance: '/finance/dashboard',
                ipd_manager: '/ipd',
            };
            router.push(routes[result.role] || '/');
        } else {
            setError(result.error || 'Verification failed');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl shadow-lg shadow-violet-500/30 mb-4">
                        <Shield className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-white">Two-Factor Authentication</h1>
                    <p className="text-sm text-white/40 mt-2">Enter the 6-digit code from your authenticator app</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-[#131A2E] border border-white/10 rounded-2xl p-6 space-y-5">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-400 text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-wider block mb-2">
                            Verification Code
                        </label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                            <input
                                type="text"
                                value={token}
                                onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-lg font-mono tracking-[0.3em] focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                placeholder="000000"
                                autoFocus
                                maxLength={8}
                            />
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 text-center">You can also enter a backup code</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || token.length < 6}
                        className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                        Verify & Login
                    </button>

                    <Link href="/login" className="flex items-center justify-center gap-2 text-xs font-bold text-white/30 hover:text-white/50 transition-colors">
                        <ArrowLeft className="h-3 w-3" /> Back to Login
                    </Link>
                </form>
            </div>
        </div>
    );
}
