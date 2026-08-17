'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { investorLogin } from '@/app/actions/investor-auth-actions';
import { ShieldCheck, Lock, User, Eye, EyeOff, Building2, ArrowRight, Activity, TrendingUp, DollarSign } from 'lucide-react';

export default function InvestorLoginPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
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
                setError(res?.error || 'Invalid investor credentials.');
            }
        });
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] relative overflow-hidden font-sans flex flex-col justify-between">
            {/* Subtle Premium Background Blur Gradients */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-60 pointer-events-none" />
            <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-60 pointer-events-none" />

            {/* Header */}
            <header className="relative z-10 px-8 md:px-16 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#0f172a] text-white flex items-center justify-center shadow-md">
                        <Building2 className="w-5 h-5 font-bold text-emerald-400" />
                    </div>
                    <div>
                        <div className="flex items-center text-2xl font-black tracking-tight select-none">
                            <span className="text-[#0f172a]">Avani</span>
                            <span className="text-emerald-600 font-black inline-flex items-start">
                                OS<sup className="text-xs font-bold relative top-[-0.15em] ml-0.5">+</sup>
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Investor & Promoter Suite</p>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs font-bold text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>256-Bit Encrypted Executive Portal</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 w-full max-w-[1200px] mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Left Side: Professional Executive Information */}
                <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider">
                        <Activity className="w-3.5 h-3.5 text-emerald-600" />
                        Confidential Promoter Suite
                    </div>

                    <h1 className="text-4xl lg:text-5xl font-black text-[#0f172a] tracking-tight leading-tight">
                        Executive <br />
                        <span className="text-emerald-600">Promoter & Investor Suite</span>
                    </h1>

                    <p className="text-base text-slate-600 font-medium leading-relaxed max-w-lg">
                        Real-time consolidated analytics, unit revenue yield, bed capacity utilization, and multi-hospital performance metrics for board members and investors.
                    </p>

                    <div className="grid grid-cols-3 gap-4 max-w-lg pt-4 border-t border-slate-200/80">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                            <div className="flex items-center justify-between text-slate-400 mb-1">
                                <Building2 className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="text-2xl font-black text-[#0f172a]">4 Units</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Multi-Hospital Network</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                            <div className="flex items-center justify-between text-slate-400 mb-1">
                                <TrendingUp className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="text-2xl font-black text-emerald-600">125 Beds</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Capacity Yield</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                            <div className="flex items-center justify-between text-slate-400 mb-1">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="text-2xl font-black text-[#0f172a]">Live</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Revenue Audit</div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Professional Login Form */}
                <div className="flex justify-center">
                    <div className="bg-white rounded-[28px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.07)] w-full max-w-[440px] overflow-hidden border border-slate-200/80 p-8 md:p-10">
                        <div className="mb-6 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 mb-3">
                                <Lock className="w-6 h-6" />
                            </div>
                            <h2 className="text-2xl font-black text-[#0f172a] tracking-tight">Investor Login</h2>
                            <p className="text-slate-500 text-xs font-medium mt-1">Enter your assigned executive portal credentials</p>
                        </div>

                        {error && (
                            <div className="mb-5 p-3.5 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-600" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Username
                                </label>
                                <div className="relative">
                                    <User className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter username (e.g. investor)"
                                        required
                                        autoComplete="username"
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-sm text-[#0f172a] font-semibold tracking-wide placeholder-slate-400 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        autoComplete="current-password"
                                        className="w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-sm text-[#0f172a] font-semibold tracking-wide placeholder-slate-400 transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-3.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl shadow-lg shadow-emerald-600/20 hover:shadow-xl transition-all disabled:opacity-70 flex items-center justify-center gap-2 text-sm cursor-pointer"
                            >
                                {isPending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Authenticating Session...
                                    </>
                                ) : (
                                    <>
                                        <span>Sign In to Executive Suite</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 px-8 py-6 text-center text-xs font-bold text-slate-400 border-t border-slate-200/60">
                AvaniOS Hospital Systems © {new Date().getFullYear()} — Confidential Investor & Promoter Suite.
            </footer>
        </div>
    );
}
