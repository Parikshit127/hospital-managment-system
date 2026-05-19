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
        <div className="min-h-screen bg-[#fafaf8] font-sans flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-[var(--shadow-lg)] border border-gray-200/60 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1e3a6e] to-[#162d57] p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 translate-x-8 -translate-y-8 w-32 h-32 bg-[#1e3a6e] rounded-full opacity-30 blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 -translate-x-6 translate-y-6 w-24 h-24 bg-[#f97316] rounded-full opacity-20 blur-2xl"></div>
                    <div className="relative z-10">
                        {/* Inline SVG logo — white version for dark header */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" style={{ height: '48px', width: 'auto', margin: '0 auto 10px', display: 'block' }} aria-label="Axten Hospitals">
                            <text x="10" y="72" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="68" fill="white" letterSpacing="-2">Axten</text>
                            <rect x="10" y="80" width="60" height="8" fill="#f97316" rx="2"/>
                            <rect x="130" y="80" width="120" height="8" fill="#f97316" rx="2"/>
                            <text x="75" y="89" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="16" fill="white" letterSpacing="6">HOSPITALS</text>
                            <text x="10" y="110" fontFamily="Arial, sans-serif" fontWeight="400" fontSize="12" fill="rgba(255,255,255,0.7)">A Unit of TAH Global Healthcare Pvt. Ltd.</text>
                            <circle cx="360" cy="55" r="48" fill="none" stroke="white" strokeWidth="3"/>
                            <circle cx="360" cy="55" r="42" fill="none" stroke="white" strokeWidth="1"/>
                            <rect x="350" y="35" width="20" height="40" fill="none" stroke="#f97316" strokeWidth="3" rx="3"/>
                            <rect x="340" y="45" width="40" height="20" fill="none" stroke="#f97316" strokeWidth="3" rx="3"/>
                        </svg>
                        <h1 className="text-xl font-bold text-white mb-1 tracking-tight">Patient Portal</h1>
                        <p className="text-blue-200 text-sm">Access your health records securely</p>
                    </div>
                </div>

                {/* Form Section */}
                <div className="p-8">
                    {setupSuccess && (
                        <div className="mb-6 bg-teal-50 border border-teal-100 text-teal-700 rounded-xl p-4 text-sm font-medium">
                            Password setup complete. You can now sign in.
                        </div>
                    )}
                    {state?.error && (
                        <div className="mb-6 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl p-4 text-sm flex items-start gap-3 font-medium">
                            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">!</div>
                            {state.error}
                        </div>
                    )}

                    <form action={loginAction} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Patient ID or Email</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                    <UserCircle className="h-5 w-5" />
                                </span>
                                <input
                                    name="patientId"
                                    type="text"
                                    required
                                    placeholder="e.g. AVN-2024-00001 or email"
                                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all outline-none text-sm shadow-sm hover:border-gray-300"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Portal Password</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                    <KeyRound className="h-5 w-5" />
                                </span>
                                <input
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="Enter your portal password"
                                    className="w-full pl-11 pr-14 py-3 bg-white border border-gray-200 rounded-xl focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all outline-none text-sm shadow-sm hover:border-gray-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-teal-600 transition-colors text-[10px] font-bold uppercase tracking-wide"
                                >
                                    {showPassword ? 'HIDE' : 'SHOW'}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md shadow-teal-600/20 hover:shadow-lg hover:shadow-teal-600/25 disabled:opacity-70 disabled:cursor-not-allowed mt-1"
                        >
                            {isPending ? 'Verifying...' : 'Access My Portal'}
                        </button>
                    </form>

                    <div className="mt-6 text-center space-y-3">
                        <Link
                            href="/patient/forgot-password"
                            className="block text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                        >
                            Forgot Password?
                        </Link>
                        <div className="border-t border-gray-100 pt-3">
                            <p className="text-sm text-gray-500">
                                New patient?{' '}
                                <Link href="/patient/register" className="text-emerald-600 font-bold hover:underline">
                                    Register here
                                </Link>
                                {' '}or{' '}
                                <Link href="/patient/organisations" className="text-emerald-600 font-bold hover:underline">
                                    Find a hospital
                                </Link>
                            </p>
                        </div>
                    </div>

                    <p className="mt-4 text-center text-xs text-gray-500 leading-relaxed">
                        Check your welcome email from the hospital for your setup link and login details.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function PatientLoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#fafaf8]" />}>
            <PatientLoginForm />
        </Suspense>
    );
}
