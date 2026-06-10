'use client';

import React, { useState } from 'react';
import { KeyRound, X, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { changeMyPassword } from '@/app/actions/account-actions';

interface ChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
}

const RULES = [
    { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
    { test: (v: string) => /[A-Z]/.test(v), label: 'One uppercase letter' },
    { test: (v: string) => /[0-9]/.test(v), label: 'One number' },
    { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: 'One special character' },
];

const inputCls =
    'w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500';

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    if (!open) return null;

    const reset = () => {
        setCurrent(''); setNext(''); setConfirm('');
        setShowCurrent(false); setShowNext(false);
        setError(''); setDone(false); setSubmitting(false);
    };

    const close = () => { reset(); onClose(); };

    const handleSubmit = async () => {
        setError('');
        if (!current || !next) { setError('Please fill in all fields'); return; }
        if (!RULES.every(r => r.test(next))) { setError('New password does not meet all requirements'); return; }
        if (next !== confirm) { setError('New password and confirmation do not match'); return; }

        setSubmitting(true);
        const res = await changeMyPassword(current, next);
        setSubmitting(false);

        if (res.success) {
            setDone(true);
            setTimeout(close, 1600);
        } else {
            setError(res.error || 'Failed to change password');
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
            <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-orange-500" /> Change Password
                    </h2>
                    <button onClick={close} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {done ? (
                    <div className="p-8 flex flex-col items-center text-center">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                        <p className="text-sm font-semibold text-gray-900">Password updated</p>
                        <p className="text-xs text-gray-500 mt-1">Use your new password the next time you log in.</p>
                    </div>
                ) : (
                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">{error}</div>
                        )}

                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Current Password</label>
                            <div className="relative">
                                <input type={showCurrent ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} className={inputCls + ' pr-10'} placeholder="Enter current password" autoComplete="current-password" />
                                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Password</label>
                            <div className="relative">
                                <input type={showNext ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)} className={inputCls + ' pr-10'} placeholder="Enter new password" autoComplete="new-password" />
                                <button type="button" onClick={() => setShowNext(!showNext)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                            </div>
                            {next.length > 0 && (
                                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                                    {RULES.map(r => {
                                        const ok = r.test(next);
                                        return (
                                            <span key={r.label} className={`flex items-center gap-1 text-[10px] font-medium ${ok ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                                {r.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Confirm New Password</label>
                            <input type={showNext ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} placeholder="Re-enter new password" autoComplete="new-password" />
                            {confirm.length > 0 && confirm !== next && (
                                <p className="text-[10px] text-rose-500 mt-1 font-medium">Passwords do not match</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-1">
                            <button onClick={close} className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
                            <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
                                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                Update Password
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
