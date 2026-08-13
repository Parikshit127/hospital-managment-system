'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { investorLogin } from '@/app/actions/investor-auth-actions';
import { ShieldCheck, Lock, User, Eye, EyeOff, Building2, ArrowRight } from 'lucide-react';

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
        <div className="min-h-screen bg-[#faf9f6] text-[#0a1e42] relative overflow-hidden font-sans flex flex-col justify-between">
            {/* Subtle Grid Background */}
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: `linear-gradient(to right, rgba(230, 220, 205, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(230, 220, 205, 0.35) 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                }}
            />

            {/* Top Navigation Bar */}
            <header className="relative z-10 px-8 md:px-16 lg:px-20 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                        <Building2 className="w-5 h-5 font-bold" />
                    </div>
                    <div>
                        <div className="flex items-center text-xl font-extrabold tracking-tight select-none">
                            <span className="text-[#0a1e42] font-black text-2xl">Axten</span>
                            <span className="text-emerald-600 font-black text-2xl inline-flex items-start">
                                OS<sup className="text-xs font-bold relative top-[-0.15em] ml-0.5">+</sup>
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold">Promoter & Investor Portal</p>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#ede9e2] rounded-full shadow-sm text-xs font-bold text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>256-Bit Encrypted Investor Access</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 w-full max-w-[1200px] mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Left Side: Branding & Info */}
                <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider">
                        Executive Suite
                    </div>

                    <h1 className="text-4xl lg:text-5xl font-black text-[#0a1e42] tracking-tight leading-tight">
                        Consolidated <br />
                        <span className="text-emerald-600">Promoter Dashboard</span>
                    </h1>

                    <p className="text-base text-slate-600 font-medium leading-relaxed max-w-lg">
                        Real-time operational, clinical, and financial insights across all hospital units (EOK, HQ, Gurugram, and Nehru Enclave).
                    </p>

                    <div className="grid grid-cols-2 gap-4 max-w-md pt-4 border-t border-slate-200/80">
                        <div className="bg-white p-4 rounded-2xl border border-[#ede9e2] shadow-sm">
                            <div className="text-2xl font-black text-[#0a1e42]">4 Units</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Consolidated Operations</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-[#ede9e2] shadow-sm">
                            <div className="text-2xl font-black text-emerald-600">125 Beds</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Operational Capacity</div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Login Card */}
                <div className="flex justify-center">
                    <div className="bg-white rounded-[28px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] w-full max-w-[440px] overflow-hidden border border-[#ede9e2] p-8 md:p-10">
                        <div className="mb-6 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 mb-3">
                                <Lock className="w-6 h-6" />
                            </div>
                            <h2 className="text-2xl font-black text-[#0a1e42] tracking-tight">Investor Login</h2>
                            <p className="text-slate-500 text-xs font-medium mt-1">Sign in to view executive multi-unit analytics</p>
                        </div>

                        {error && (
                            <div className="mb-5 p-3.5 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
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
                                        placeholder="inv@123"
                                        required
                                        className="w-full pl-11 pr-4 py-3.5 bg-[#faf9f6] border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-sm text-[#0a1e42] font-semibold tracking-wide placeholder-slate-400"
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
                                        className="w-full pl-11 pr-11 py-3.5 bg-[#faf9f6] border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-sm text-[#0a1e42] font-semibold tracking-wide placeholder-slate-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-3.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Credentials Hint Box */}
                            <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs flex items-center justify-between">
                                <span className="text-slate-600 font-medium">Default Credentials:</span>
                                <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                    inv@123 / inv123
                                </span>
                            </div>

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-full shadow-md shadow-emerald-600/20 hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2 text-sm cursor-pointer"
                            >
                                {isPending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        <span>Sign In to Promoter Suite</span>
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
                Axten Healthcare Systems © {new Date().getFullYear()} — Confidential Investor Data.
            </footer>
        </div>
    );
}
