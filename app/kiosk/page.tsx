'use client';

import React, { useState } from 'react';
import { Phone, Hash, CheckCircle2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { selfCheckInByPhone } from '@/app/actions/reception-actions';

type Step = 'input' | 'success' | 'error';

export default function KioskPage() {
    const [step, setStep] = useState<Step>('input');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ tokenNumber: number; position: number; estimatedWait: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    async function handleCheckIn() {
        if (phone.trim().length < 10) return;
        setLoading(true);
        const res = await selfCheckInByPhone(phone.trim());
        setLoading(false);
        const d = 'data' in res ? (res.data as { tokenNumber: number; position: number; estimatedWait: number }) : null;
        if (res.success && d) {
            setResult(d);
            setStep('success');
            // Auto-reset after 30s
            setTimeout(() => reset(), 30000);
        } else {
            setErrorMsg(('error' in res ? res.error : undefined) || 'Check-in failed');
            setStep('error');
        }
    }

    function reset() {
        setStep('input');
        setPhone('');
        setResult(null);
        setErrorMsg('');
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter') handleCheckIn();
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                {/* Logo / Title */}
                <div className="text-center mb-10">
                    <div className="h-20 w-20 bg-white/20 rounded-3xl mx-auto mb-4 flex items-center justify-center">
                        <Hash className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">Self Check-in</h1>
                    <p className="text-teal-100 text-lg mt-2">Enter your registered mobile number</p>
                </div>

                {step === 'input' && (
                    <div className="bg-white rounded-3xl p-8 shadow-2xl space-y-6">
                        <div>
                            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-2">Mobile Number</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    onKeyDown={handleKey}
                                    placeholder="e.g. 9876543210"
                                    autoFocus
                                    className="w-full pl-12 pr-4 py-5 text-2xl font-bold border-2 border-gray-200 rounded-2xl outline-none focus:border-teal-500 tracking-widest"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleCheckIn}
                            disabled={loading || phone.length < 10}
                            className="w-full py-5 bg-teal-600 text-white text-xl font-black rounded-2xl hover:bg-teal-700 disabled:opacity-40 flex items-center justify-center gap-3 transition-all"
                        >
                            {loading ? (
                                <><Loader2 className="h-6 w-6 animate-spin" /> Checking in...</>
                            ) : (
                                <><CheckCircle2 className="h-6 w-6" /> Check In</>
                            )}
                        </button>

                        <p className="text-center text-xs text-gray-400">
                            Use the same number registered at reception
                        </p>
                    </div>
                )}

                {step === 'success' && result && (
                    <div className="bg-white rounded-3xl p-8 shadow-2xl text-center space-y-6">
                        <div className="h-20 w-20 bg-emerald-100 rounded-full mx-auto flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-2">Your Token Number</p>
                            <p className="text-8xl font-black text-teal-600 leading-none">#{result.tokenNumber}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-2xl p-4">
                                <p className="text-xs font-bold text-gray-400 uppercase">Queue Position</p>
                                <p className="text-3xl font-black text-gray-800 mt-1">{result.position}</p>
                            </div>
                            <div className="bg-teal-50 rounded-2xl p-4">
                                <p className="text-xs font-bold text-teal-500 uppercase">Est. Wait</p>
                                <p className="text-3xl font-black text-teal-700 mt-1">~{result.estimatedWait}m</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400">Please take a seat. You will be called when it&apos;s your turn.</p>
                        <button onClick={reset} className="flex items-center gap-2 mx-auto text-sm font-bold text-gray-400 hover:text-gray-600">
                            <RotateCcw className="h-4 w-4" /> New Check-in
                        </button>
                    </div>
                )}

                {step === 'error' && (
                    <div className="bg-white rounded-3xl p-8 shadow-2xl text-center space-y-6">
                        <div className="h-20 w-20 bg-red-100 rounded-full mx-auto flex items-center justify-center">
                            <AlertTriangle className="h-10 w-10 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Check-in Failed</h2>
                            <p className="text-gray-500 mt-2">{errorMsg}</p>
                        </div>
                        <p className="text-sm text-gray-400 bg-amber-50 border border-amber-200 rounded-xl p-3">
                            Please visit the reception desk for assistance.
                        </p>
                        <button
                            onClick={reset}
                            className="w-full py-4 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 flex items-center justify-center gap-2"
                        >
                            <RotateCcw className="h-5 w-5" /> Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
