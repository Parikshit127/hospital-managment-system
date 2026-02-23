'use client';

import { useActionState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { login } from './actions';
import { HeartPulse, Shield, Eye, EyeOff, Loader2, Zap, Lock, User, Clock } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';

function LoginForm() {
    const [state, loginAction, isPending] = useActionState(login, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get('reason') === 'timeout';
    const router = useRouter();

    // Redirect to MFA page when MFA is required
    useEffect(() => {
        if (state?.success && (state as any).mfa_required) {
            router.push('/login/mfa');
        }
    }, [state, router]);

    return (
        <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center relative overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-teal-500/3 to-violet-500/3 rounded-full blur-3xl" />
                {/* Grid pattern overlay */}
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />
            </div>

            <div className="relative w-full max-w-md mx-4">
                {/* Hospital branding */}
                <div className="text-center mb-10">
                    <div className="inline-block relative mb-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-2xl blur-xl opacity-40 scale-125" />
                        <div className="relative bg-gradient-to-br from-teal-400 to-emerald-600 p-4 rounded-2xl shadow-2xl shadow-teal-500/20">
                            <HeartPulse className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-white mb-1">
                        Avani Hospital OS
                    </h1>
                    <p className="text-xs font-bold text-teal-400 uppercase tracking-[0.25em]">
                        Intelligence Platform
                    </p>
                </div>

                {/* Login card */}
                <div className="bg-gradient-to-br from-[#131A2E]/80 to-[#0F1425]/80 backdrop-blur-xl rounded-3xl border border-white/5 p-8 shadow-2xl">
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="h-4 w-4 text-violet-400" />
                        <h2 className="text-sm font-black text-white/60 uppercase tracking-wider">Secure Access</h2>
                    </div>

                    {isTimeout && (
                        <div className="flex items-center gap-2 p-3 mb-5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="text-xs font-bold text-amber-300">Your session expired due to inactivity. Please sign in again.</span>
                        </div>
                    )}

                    <form action={loginAction} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                <input
                                    id="login-username"
                                    name="username"
                                    type="text"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                    placeholder="Enter your username"
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                <input
                                    id="login-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-12 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {state?.error && (
                            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-in">
                                <Shield className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                <span className="text-xs font-bold text-rose-300">{state.error}</span>
                            </div>
                        )}

                        <button
                            id="login-submit"
                            type="submit"
                            disabled={isPending}
                            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isPending ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Authenticating...</>
                            ) : (
                                <><Zap className="h-4 w-4" /> Sign In</>
                            )}
                        </button>
                    </form>

                    {/* Role info */}
                    <div className="mt-6 pt-5 border-t border-white/5">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-wider mb-3 text-center">Authorized Roles</p>
                        <div className="flex flex-wrap justify-center gap-1.5">
                            {['Admin', 'Doctor', 'Receptionist', 'Lab Tech', 'Pharmacist'].map(role => (
                                <span key={role} className="px-2.5 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-bold text-white/25">
                                    {role}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-8">
                    <p className="text-[10px] text-white/15 font-medium">
                        256-bit encrypted · HIPAA-compliant · Audit-logged
                    </p>
                    <p className="text-[10px] text-white/10 font-medium mt-1">
                        Avani Hospital OS v2.0
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0B0F1A]" />}>
            <LoginForm />
        </Suspense>
    );
}
