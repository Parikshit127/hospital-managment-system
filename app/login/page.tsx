'use client';

import { useActionState, useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { login } from './actions';

function LoginForm({ isTimeout }: { isTimeout: boolean }) {
    const [state, loginAction, isPending] = useActionState(login, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (state?.success && (state as any).mfa_required) {
            router.push('/login/mfa');
        }
    }, [state, router]);

    return (
        <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] w-full overflow-hidden relative border border-gray-100">
            <div className="p-8 md:p-10">
                <h2 className="text-2xl font-bold text-[#0f172a] mb-2">Sign in to Axten</h2>
                <p className="text-gray-500 text-sm mb-8">Enter your details to access your workspace.</p>
                
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

                <form action={loginAction} className="space-y-5">
                    <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Username</label>
                        <input type="text" name="username" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]/20 focus:border-[#f97316] transition-all text-sm" placeholder="Enter username" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Password</label>
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} name="password" required className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]/20 focus:border-[#f97316] transition-all text-sm" placeholder="••••••••" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors">
                                {showPassword ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                            </button>
                        </div>
                    </div>
                    <button type="submit" disabled={isPending} className="w-full py-3.5 px-4 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold rounded-xl shadow-lg shadow-[#f97316]/20 transition-all disabled:opacity-70 mt-4 flex justify-center items-center gap-2 text-sm hover:-translate-y-0.5">
                        {isPending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Authenticating...
                            </>
                        ) : 'Sign In'}
                    </button>
                </form>
                
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Authorized Roles</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {['Admin', 'Doctor', 'Receptionist', 'Lab Tech'].map(role => (
                            <span key={role} className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 text-[11px] font-bold rounded-full">{role}</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LandingPage() {
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get('reason') === 'timeout';

    return (
        <div className="min-h-screen bg-white relative overflow-hidden font-sans flex flex-col">
            {/* Subtle Grid Background */}
            <div className="absolute inset-0 pointer-events-none z-0" style={{
                backgroundImage: `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
            }} />

            {/* Top Navigation */}
            <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    {/* Axten Logo */}
                    <div className="flex items-center">
                        <span className="text-2xl font-black text-[#1e3a6e] tracking-tight mr-1">Axten</span>
                        <div className="flex flex-col gap-[2px]">
                            <div className="w-4 h-1 bg-[#f97316] rounded-full" />
                            <div className="w-6 h-1 bg-[#f97316] rounded-full" />
                        </div>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-8 text-sm font-semibold text-[#1e3a6e]">
                    <a href="#" className="hover:text-[#f97316] transition-colors">Staff Directory</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Departments</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Help Desk</a>
                </div>
                
                {/* Empty div to maintain space-between flex layout since we removed the button */}
                <div className="w-[120px] hidden lg:block"></div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 py-12 lg:py-0 flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-20 items-center">
                {/* Left Side: Copy */}
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-3 px-1 py-1 pr-4 bg-white border border-gray-200 rounded-full mb-8 shadow-sm">
                        <span className="px-3 py-1 bg-[#fff7ed] text-[#f97316] text-[11px] font-bold rounded-full uppercase tracking-wider">SECURE</span>
                        <span className="text-sm font-medium text-gray-600">Authorized Personnel Only</span>
                    </div>

                    <h1 className="text-[56px] lg:text-[72px] leading-[1.05] font-extrabold text-[#0a1e42] tracking-[-0.03em] mb-8" style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
                        Welcome to<br />the Hospital<br />Staff Portal
                    </h1>

                    <div className="w-2.5 h-2.5 bg-[#0a1e42] rounded-full mb-8" />

                    <p className="text-[19px] text-gray-600 leading-[1.6] font-medium max-w-[500px]">
                        Access your personalized dashboard to manage patient records, appointments, billing, and clinical operations efficiently and securely.
                    </p>
                </div>

                {/* Right Side: Login Form */}
                <div className="relative flex justify-center lg:justify-end w-full">
                    {/* Floating shadow behind form for extra depth */}
                    <div className="absolute inset-0 bg-[#0f172a]/5 blur-[60px] transform rotate-2 scale-105 rounded-[3rem] pointer-events-none" />
                    
                    <div className="w-full max-w-[440px] relative z-10">
                        <LoginForm isTimeout={isTimeout} />
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white" />}>
            <LandingPage />
        </Suspense>
    );
}
