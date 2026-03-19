'use client';

import { useActionState } from 'react';
import { patientLogin } from './actions';
import { Suspense, useState } from 'react';
import { Activity, KeyRound, UserCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function PatientLoginForm() {
    const [state, loginAction, isPending] = useActionState(patientLogin, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const searchParams = useSearchParams();
    const setupSuccess = searchParams.get('setup') === 'success';

    return (
        <div className="min-h-screen bg-[#f8fbf9] font-sans flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-green-100 overflow-hidden">
                {/* Header */}
                <div className="bg-emerald-500 p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 -tralslate-y-12 translate-x-12 w-32 h-32 bg-emerald-400 rounded-full opacity-50 blur-xl"></div>
                    <div className="relative z-10">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center mb-4 backdrop-blur-sm border border-white/30 text-white">
                            <Activity className="h-8 w-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">Patient Portal</h1>
                        <p className="text-emerald-100 text-sm">Access your health records securely</p>
                    </div>
                </div>

                {/* Form Section */}
                <div className="p-8">
                    {setupSuccess && (
                        <div className="mb-6 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-4 text-sm">
                            Password setup complete. You can now sign in.
                        </div>
                    )}
                    {state?.error && (
                        <div className="mb-6 bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 text-sm flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">!</div>
                            {state.error}
                        </div>
                    )}

                    <form action={loginAction} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Patient ID</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <UserCircle className="h-5 w-5" />
                                </span>
                                <input
                                    name="patientId"
                                    type="text"
                                    required
                                    placeholder="e.g. AVN-2024-00001"
                                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Portal Password</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <KeyRound className="h-5 w-5" />
                                </span>
                                <input
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="Enter your portal password"
                                    className="w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors text-xs font-semibold"
                                >
                                    {showPassword ? 'HIDE' : 'SHOW'}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                            {isPending ? 'Verifying...' : 'Access My Portal'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            href="/patient/forgot-password"
                            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <p className="mt-4 text-center text-sm text-gray-500">
                        Check your welcome email from the hospital for your setup link and login details.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function PatientLoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#f8fbf9]" />}>
            <PatientLoginForm />
        </Suspense>
    );
}
