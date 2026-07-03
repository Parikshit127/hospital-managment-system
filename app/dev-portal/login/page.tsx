'use client';

import { useActionState, useState } from 'react';
import { devPortalLogin, type DevPortalLoginState } from './actions';

const initialState: DevPortalLoginState = { success: false, error: '' };

export default function DevPortalLoginPage() {
    const [state, action, isPending] = useActionState(devPortalLogin, initialState);
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="min-h-screen bg-[#0b1120] text-slate-200 font-mono flex items-center justify-center p-6 relative overflow-hidden">
            {/* Grid backdrop — signals "internal tooling", distinct from the light hospital login */}
            <div
                className="absolute inset-0 pointer-events-none z-0 opacity-60"
                style={{
                    backgroundImage:
                        'linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                    maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
                }}
            />

            <div className="relative z-10 w-full max-w-[420px]">
                {/* Header / brand */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg font-bold">
                        {'</>'}
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">Developer Portal</h1>
                        <p className="text-[11px] text-emerald-400/80 uppercase tracking-[0.2em]">HospitalOS · Internal</p>
                    </div>
                </div>

                {/* Restricted-access warning banner */}
                <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12px] text-amber-300/90">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>
                        Restricted to provisioned Developer / Dev Admin accounts. This is <strong>not</strong> the hospital
                        staff login.
                    </span>
                </div>

                {/* Login card */}
                <div className="rounded-2xl border border-slate-800 bg-[#0f172a]/80 backdrop-blur shadow-2xl shadow-black/40 p-7">
                    {state?.error && (
                        <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-300">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {state.error}
                        </div>
                    )}

                    <form action={action} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                name="username"
                                required
                                autoComplete="username"
                                className="w-full px-3.5 py-2.5 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                                placeholder="dev.username"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    autoComplete="current-password"
                                    className="w-full pl-3.5 pr-11 py-2.5 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 rounded-md transition-colors"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-[#0b1120] font-bold rounded-lg transition-all disabled:opacity-60 flex justify-center items-center gap-2 text-sm mt-2"
                        >
                            {isPending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-[#0b1120]/30 border-t-[#0b1120] rounded-full animate-spin" />
                                    Authenticating…
                                </>
                            ) : (
                                'Access Portal'
                            )}
                        </button>
                    </form>
                </div>

                <p className="mt-5 text-center text-[11px] text-slate-600">
                    Hospital staff? Use the <a href="/login" className="text-slate-400 hover:text-emerald-400 underline underline-offset-2">staff login</a> instead.
                </p>
            </div>
        </div>
    );
}
