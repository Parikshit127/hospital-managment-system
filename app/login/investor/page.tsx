'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { investorLogin } from '@/app/actions/investor-auth-actions';
import { ShieldCheck, Lock, User, Building2, ChevronRight, Eye, EyeOff } from 'lucide-react';

export default function InvestorLoginPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [username, setUsername] = useState('inv@123');
    const [password, setPassword] = useState('inv123');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const res = await investorLogin(null, formData);
            if (res?.success) {
                router.push('/investor/dashboard');
            } else {
                setError(res?.error || 'Login failed. Please check credentials.');
            }
        });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans">
            {/* Ambient Background Gradient Effects */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                        <Building2 className="w-5 h-5 text-slate-950 font-bold" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                            AXTEN HEALTHCARE <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">INVESTOR PORTAL</span>
                        </h1>
                        <p className="text-xs text-slate-400">Consolidated Promoter & Executive Suite</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>256-Bit Encrypted Portal Access</span>
                </div>
            </header>

            {/* Main Login Body */}
            <main className="relative z-10 flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl shadow-slate-950/80">
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4 text-emerald-400 shadow-inner">
                                <Lock className="w-7 h-7" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-white tracking-tight">Investor Login</h2>
                            <p className="text-xs text-slate-400 mt-1">Enter executive credentials to access multi-unit metrics</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-fadeIn">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                    Investor Username / ID
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="inv@123"
                                        required
                                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Demo Credentials Helper Pill */}
                            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300 flex items-center justify-between">
                                <span className="text-slate-400">Default Credentials:</span>
                                <span className="font-mono font-bold text-emerald-400">inv@123 / inv123</span>
                            </div>

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-sm hover:from-emerald-400 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer"
                            >
                                {isPending ? (
                                    <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>Sign In to Investor Suite</span>
                                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 px-8 py-4 border-t border-slate-900 bg-slate-950/60 text-center text-xs text-slate-500">
                Axten Healthcare Systems © {new Date().getFullYear()} — Executive Promoter Suite. Confidential Financial Data.
            </footer>
        </div>
    );
}
