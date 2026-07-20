'use client';

import { useActionState, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { login, getPatientCount } from './actions';
import HeartbeatLine from '@/app/components/ui/HeartbeatLine';
import type { PortalBranding } from '@/app/lib/get-portal-branding';

function LoginForm({ isTimeout, brandHead }: { isTimeout: boolean; brandHead: string }) {
    const [state, loginAction, isPending] = useActionState(login, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (state?.success && (state as any).mfa_required) {
            router.push('/login/mfa');
        }
    }, [state, router]);

    return (
        <div className="bg-white rounded-[28px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.03)] w-full overflow-hidden border border-[#ede9e2]">
            <div className="p-8 md:p-10">
                <h2 className="text-3xl font-extrabold text-[#0a1e42] tracking-tight mb-2">Sign in to {brandHead}</h2>
                <p className="text-[#64748b] text-[14px] font-medium mb-8">Enter your details to access your workspace.</p>

                {isTimeout && (
                    <div className="mb-6 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Session expired. Please sign in again.
                    </div>
                )}
                {state?.error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {state.error}
                    </div>
                )}

                <form action={loginAction} className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Username</label>
                        <input
                            type="text"
                            name="username"
                            required
                            className="w-full px-5 py-4 bg-[#faf9f6] border border-slate-200/80 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/10 focus:border-[var(--brand)] transition-all text-sm text-[#0a1e42] placeholder-slate-400 font-medium"
                            placeholder="Enter username"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                required
                                className="w-full pl-5 pr-12 py-4 bg-[#faf9f6] border border-slate-200/80 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/10 focus:border-[var(--brand)] transition-all text-sm text-[#0a1e42] placeholder-slate-400 font-medium tracking-wide"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[var(--brand)] rounded-md transition-colors"
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full py-4 px-4 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white font-extrabold rounded-full shadow-md shadow-[var(--brand)]/10 hover:shadow-lg transition-all disabled:opacity-70 mt-8 flex justify-center items-center gap-2 text-sm hover:-translate-y-0.5"
                    >
                        {isPending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Authenticating...
                            </>
                        ) : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function LoginLanding({ branding }: { branding: PortalBranding }) {
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get('reason') === 'timeout';
    const [patientCount, setPatientCount] = useState<number | null>(null);

    const brandHead = (branding.orgName || 'Hospital').trim().split(/\s+/)[0];

    // Palette: for the default (Axten) branding, reproduce the ORIGINAL hardcoded
    // colors EXACTLY so the live hospital's login is pixel-identical. Only a
    // non-default org (the demo/Avani) uses its own brand colors.
    const isDefault = (branding.primaryColor || '').toLowerCase() === '#f97316';
    const brand = branding.primaryColor;
    const strong = isDefault ? '#ea580c' : (branding.accentColor || branding.primaryColor);
    const deep = isDefault ? '#c2410c' : (branding.accentColor || branding.primaryColor);
    const badgeBg = isDefault ? '#ffedd5' : `color-mix(in srgb, ${branding.primaryColor} 16%, transparent)`;
    const footerText = isDefault ? '© 2026 Axten. All rights reserved.' : (branding.footerText || `© 2026 ${branding.orgName}. All rights reserved.`);

    useEffect(() => {
        getPatientCount().then((count) => {
            if (!count || count <= 0) {
                setPatientCount(0);
                return;
            }
            let start = 0;
            const end = count;
            const duration = 1000;
            const increment = Math.ceil(end / (duration / 16));
            const timer = setInterval(() => {
                start += increment;
                if (start >= end) {
                    clearInterval(timer);
                    setPatientCount(end);
                } else {
                    setPatientCount(start);
                }
            }, 16);
            return () => clearInterval(timer);
        });
    }, []);

    return (
        <div
            className="min-h-screen bg-[#faf9f6] relative overflow-hidden font-sans flex flex-col justify-between"
            style={{
                ['--brand' as any]: brand,
                ['--brand-strong' as any]: strong,
            }}
        >
            {/* Subtle Grid Background */}
            <div className="absolute inset-0 pointer-events-none z-0" style={{
                backgroundImage: `linear-gradient(to right, rgba(230, 220, 205, 0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(230, 220, 205, 0.3) 1px, transparent 1px)`,
                backgroundSize: '48px 48px',
            }} />

            {/* Top Navigation */}
            <nav className="relative z-10 flex items-center justify-between px-8 md:px-16 lg:px-20 py-6">
                <div className="flex items-center gap-2">
                    {/* Brand logo */}
                    <div className="flex items-center text-xl font-extrabold tracking-tight select-none">
                        <span className="text-[#0a1e42] font-black text-[22px]">{brandHead}</span>
                        <span className="text-[var(--brand-strong)] font-black text-[22px] inline-flex items-start">
                            OS<sup className="text-xs font-bold relative top-[-0.15em] ml-0.5">+</sup>
                        </span>
                    </div>
                </div>
                <div className="w-[120px] hidden lg:block"></div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 w-full max-w-[1400px] mx-auto px-8 md:px-16 lg:px-20 py-12 lg:py-0 flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-20 items-center lg:items-stretch">
                {/* Left Side: Copy & Stats */}
                <div className="max-w-2xl flex flex-col justify-between lg:h-full lg:py-6">
                    {/* Top Group */}
                    <div>
                        <div className="inline-flex items-center gap-2.5 px-1 py-1 pr-4 bg-white/40 border border-[#ede9e2] rounded-full mb-6 shadow-sm">
                            <span
                                className="px-3 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider"
                                style={{ backgroundColor: badgeBg, color: deep }}
                            >SECURE</span>
                            <span className="text-sm font-semibold text-[#64748b]">Authorized personnel only</span>
                        </div>

                        <h1 className="text-[44px] lg:text-[56px] leading-[1.08] font-extrabold text-[#0a1e42] tracking-tight mb-5">
                            Welcome to<br />the {brandHead} <span className="text-[var(--brand-strong)] inline-flex items-start">OS<sup className="text-[0.55em] font-extrabold relative top-[-0.2em] ml-0.5">+</sup></span>
                        </h1>

                        <p className="text-[15px] text-[#64748b] leading-[1.65] font-semibold max-w-[480px]">
                            Access your personalized dashboard to manage patient records, appointments, billing, and clinical operations efficiently and securely.
                        </p>
                    </div>

                    {/* Animated Heartbeat EKG UI */}
                    <div className="w-full max-w-[480px] my-6 overflow-hidden">
                        <HeartbeatLine color={strong} speed={3.2} className="w-full h-12" />
                    </div>

                    {/* Stats columns */}
                    <div className="grid grid-cols-3 gap-6 max-w-[500px]">
                        <div>
                            <div className="text-[26px] font-black text-[#0a1e42] tracking-tight mb-1">
                                {patientCount !== null ? patientCount.toLocaleString() : '0'}+
                            </div>
                            <div className="text-[10px] font-extrabold text-slate-400 leading-tight uppercase tracking-wider">
                                Patient Records<br />Managed
                            </div>
                        </div>
                        <div>
                            <div className="text-[26px] font-black text-[#0a1e42] tracking-tight mb-1">
                                98.9%
                            </div>
                            <div className="text-[10px] font-extrabold text-slate-400 leading-tight uppercase tracking-wider">
                                Uptime Last 12<br />Months
                            </div>
                        </div>
                        <div>
                            <div className="text-[26px] font-black text-[#0a1e42] tracking-tight mb-1">
                                24/7
                            </div>
                            <div className="text-[10px] font-extrabold text-slate-400 leading-tight uppercase tracking-wider">
                                Clinical Operations<br />Support
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Login Form */}
                <div className="relative flex justify-center lg:justify-center w-full">
                    {/* Floating shadow behind form for extra depth */}
                    <div className="absolute inset-0 bg-[#0f172a]/2 blur-[50px] transform rotate-1 scale-105 rounded-[3rem] pointer-events-none" />

                    <div className="w-full max-w-[450px] relative z-10 mt-8 lg:mt-12">
                        <LoginForm isTimeout={isTimeout} brandHead={brandHead} />
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 w-full max-w-[1400px] mx-auto px-8 md:px-16 lg:px-20 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-400">
                <div className="flex gap-6">
                    <a href="#" className="hover:text-[var(--brand-strong)] transition-colors">Terms &amp; Conditions</a>
                    <a href="#" className="hover:text-[var(--brand-strong)] transition-colors">Privacy Policy</a>
                </div>
                <div>
                    {footerText}
                </div>
            </footer>
        </div>
    );
}
