'use client';

import { useActionState, useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { login } from './actions';

function LoginModal({ onClose, isTimeout }: { onClose: () => void, isTimeout: boolean }) {
    const [state, loginAction, isPending] = useActionState(login, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (state?.success && (state as any).mfa_required) {
            router.push('/login/mfa');
        }
    }, [state, router]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div className="p-8">
                    <h2 className="text-2xl font-bold text-[#0f172a] mb-2">Sign in to Axten</h2>
                    <p className="text-gray-500 text-sm mb-6">Enter your details to access your workspace.</p>
                    
                    {isTimeout && (
                        <div className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg border border-amber-200 flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Session expired. Please sign in again.
                        </div>
                    )}
                    {state?.error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200 flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            {state.error}
                        </div>
                    )}

                    <form action={loginAction} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Username</label>
                            <input type="text" name="username" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]/20 focus:border-[#f97316] transition-all" placeholder="Enter username" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Password</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} name="password" required className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]/20 focus:border-[#f97316] transition-all" placeholder="••••••••" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    {showPassword ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={isPending} className="w-full py-3 px-4 bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold rounded-xl shadow-lg shadow-[#f97316]/20 transition-all disabled:opacity-70 mt-2 flex justify-center items-center gap-2">
                            {isPending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Authenticating...
                                </>
                            ) : 'Sign In'}
                        </button>
                    </form>
                    
                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Authorized Roles</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {['Admin', 'Doctor', 'Receptionist', 'Lab Tech'].map(role => (
                                <span key={role} className="px-3 py-1 bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium rounded-full">{role}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LandingPage() {
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get('reason') === 'timeout';
    const [showLoginModal, setShowLoginModal] = useState(isTimeout);

    return (
        <div className="min-h-screen bg-white relative overflow-hidden font-sans">
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
                    <a href="#" className="hover:text-[#f97316] transition-colors">Platform</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Modules</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Billing & RCM</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Customers</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Pricing</a>
                    <a href="#" className="hover:text-[#f97316] transition-colors">Docs</a>
                </div>

                <div className="flex items-center gap-6">
                    <button onClick={() => setShowLoginModal(true)} className="text-sm font-bold text-[#1e3a6e] hover:text-[#f97316] transition-colors">
                        Sign in
                    </button>
                    <button className="flex items-center gap-2 px-5 py-2.5 bg-[#f97316] hover:bg-[#ea580c] text-white text-sm font-bold rounded-lg shadow-md shadow-[#f97316]/20 transition-all hover:-translate-y-0.5">
                        Book a demo
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 pt-16 pb-24 grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-12 xl:gap-20 items-center">
                {/* Left Side: Copy */}
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-3 px-1 py-1 pr-4 bg-white border border-gray-200 rounded-full mb-8 shadow-sm">
                        <span className="px-3 py-1 bg-[#fff7ed] text-[#f97316] text-[11px] font-bold rounded-full uppercase tracking-wider">NEW</span>
                        <span className="text-sm font-medium text-gray-600">Axten 4.0 — Integrated RCM & ABDM-ready</span>
                    </div>

                    <h1 className="text-[56px] lg:text-[72px] leading-[1.05] font-extrabold text-[#0a1e42] tracking-[-0.03em] mb-8" style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
                        A modern<br />operating system<br />for the<br />connected<br />hospital
                    </h1>

                    <div className="w-2.5 h-2.5 bg-[#0a1e42] rounded-full mb-8" />

                    <p className="text-[19px] text-gray-600 leading-[1.6] font-medium max-w-[500px]">
                        Axten unifies OPD, IPD, pharmacy, lab, OT, billing and finance on one clinically-aware platform — built for India's multi-specialty hospitals, with the polish of a modern tool.
                    </p>
                </div>

                {/* Right Side: Mockup Graphic */}
                <div className="relative mt-8 xl:mt-0">
                    {/* Floating shadow behind mockup */}
                    <div className="absolute inset-0 bg-[#0f172a]/5 blur-[60px] transform -rotate-3 scale-105 rounded-[3rem]" />
                    
                    {/* Mockup Container */}
                    <div className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden transform transition-transform hover:scale-[1.01] duration-500 flex flex-col h-[600px] border-b-0 rounded-b-none xl:rounded-2xl xl:border-b xl:h-[580px]">
                        {/* Mockup Header */}
                        <div className="flex items-center px-5 py-3 border-b border-gray-100 bg-white">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-rose-400" />
                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                            </div>
                            <div className="mx-auto px-6 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-[11px] text-gray-500 font-medium flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                app.axtenhospitals.com / dashboard
                            </div>
                        </div>

                        {/* Mockup Body */}
                        <div className="flex flex-1 overflow-hidden bg-[#0b1527]">
                            {/* Mockup Sidebar */}
                            <div className="w-[220px] bg-[#0b1527] p-5 flex flex-col gap-8 shrink-0 border-r border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 bg-[#f97316] rounded-md flex items-center justify-center text-white text-[13px] font-bold">A</div>
                                    <span className="text-white font-bold text-[15px] tracking-wide">Axten</span>
                                </div>
                                
                                <div className="space-y-6">
                                    <div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Clinical</div>
                                        <div className="flex items-center gap-3 px-3 py-2 bg-[#ffffff]/10 rounded-lg text-white text-sm font-medium">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#f97316]" />
                                            Dashboard
                                        </div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> OPD
                                        </div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> IPD
                                        </div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> Emergency
                                        </div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> Operating Theatre
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Revenue</div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> Billing & RCM
                                        </div>
                                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400 text-sm font-medium hover:text-white transition-colors">
                                            <div className="w-1 h-1 rounded-full bg-gray-500" /> Insurance / TPA
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mockup Content Area */}
                            <div className="flex-1 bg-white rounded-tl-xl overflow-hidden p-6 shadow-inner">
                                <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                                    <h3 className="font-bold text-[#0f172a] text-lg">Today · Operations overview</h3>
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    </div>
                                </div>

                                {/* KPI Cards */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">OPD Visits</div>
                                        <div className="text-3xl font-extrabold text-[#0f172a] tracking-tight mb-2">428</div>
                                        <div className="text-xs text-emerald-600 flex items-center gap-1 font-semibold"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 15-6-6-6 6"/></svg> 12.4% vs avg</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">IPD Occupancy</div>
                                        <div className="text-3xl font-extrabold text-[#0f172a] tracking-tight mb-2">86%</div>
                                        <div className="text-xs text-emerald-600 flex items-center gap-1 font-semibold"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 15-6-6-6 6"/></svg> 3 beds opened</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Today's Revenue</div>
                                        <div className="text-3xl font-extrabold text-[#0f172a] tracking-tight mb-2">₹18.4L</div>
                                        <div className="text-xs text-rose-500 flex items-center gap-1 font-semibold"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6"/></svg> 4.1% vs Tue</div>
                                    </div>
                                </div>

                                {/* Bottom row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-sm font-bold text-[#0f172a] mb-5">Revenue · last 14 days</div>
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500"><div className="w-2 h-2 rounded bg-[#1e3a8a]" /> OPD</div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500"><div className="w-2 h-2 rounded bg-[#f97316]" /> IPD</div>
                                        </div>
                                        <div className="h-24 w-full bg-gray-50 rounded-lg border border-gray-100 relative overflow-hidden">
                                            <div className="absolute inset-0">
                                              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full stroke-[#1e3a8a] stroke-[1.5] fill-blue-500/10">
                                                <path d="M0,40 L0,30 L10,25 L20,35 L30,20 L40,15 L50,25 L60,10 L70,15 L80,5 L90,15 L100,5 L100,40 Z" />
                                              </svg>
                                              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full stroke-[#f97316] stroke-[1.5] fill-orange-500/10 absolute bottom-0">
                                                <path d="M0,40 L0,35 L10,30 L20,38 L30,28 L40,20 L50,30 L60,25 L70,28 L80,15 L90,20 L100,10 L100,40 Z" />
                                              </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-bold text-[#0f172a]">Live admissions</div>
                                            <div className="text-xs font-semibold text-orange-500">3 pending</div>
                                        </div>
                                        <div className="text-[11px] text-gray-500 font-medium mb-1">12 active admissions</div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">RP</div>
                                            <div>
                                                <div className="text-xs font-bold text-[#0f172a]">Ravi Pawar</div>
                                                <div className="text-[10px] font-medium text-gray-500">Cardiology · Room 304</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-[10px] font-bold">AS</div>
                                            <div>
                                                <div className="text-xs font-bold text-[#0f172a]">Anita Sharma</div>
                                                <div className="text-[10px] font-medium text-gray-500">ER · Triage Yellow</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Login Modal */}
            {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} isTimeout={isTimeout} />}
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
