'use client';

import { Suspense, useActionState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setPatientPortalPassword } from '@/app/patient/setup-password/actions';

const initialState = { success: false, error: '' };

function PatientSetupPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tokenFromUrl = searchParams.get('token') || '';
    const [state, action, pending] = useActionState(setPatientPortalPassword, initialState);

    useEffect(() => {
        if (state.success) {
            router.push('/patient/login?setup=success');
        }
    }, [router, state.success]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <h1 className="text-2xl font-black text-gray-900">Set Patient Portal Password</h1>
                <p className="text-sm text-gray-500 mt-2">Create a secure password to activate patient portal access.</p>

                <form action={action} className="mt-6 space-y-4">
                    <input type="hidden" name="token" value={tokenFromUrl} />

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">New Password</label>
                        <input
                            type="password"
                            name="password"
                            required
                            minLength={8}
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                            placeholder="Enter secure password"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Confirm Password</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            required
                            minLength={8}
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                            placeholder="Re-enter password"
                        />
                    </div>

                    {state.error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            {state.error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={pending || !tokenFromUrl}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition"
                    >
                        {pending ? 'Saving...' : 'Set Password'}
                    </button>
                </form>

                {!tokenFromUrl && (
                    <p className="text-xs text-red-500 mt-4">Invalid setup link. Request a new setup link from reception.</p>
                )}
            </div>
        </div>
    );
}

export default function PatientSetupPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
            <PatientSetupPasswordForm />
        </Suspense>
    );
}
