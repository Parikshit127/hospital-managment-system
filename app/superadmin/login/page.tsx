'use client';

import { useActionState } from 'react';
import { superAdminLogin } from '@/app/actions/superadmin-actions';
import { ShieldCheck, Loader2 } from 'lucide-react';

export default function SuperAdminLoginPage() {
    const [state, formAction, pending] = useActionState(superAdminLogin, null);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0e1a] via-[#111827] to-[#0a0e1a] p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 mb-4">
                        <ShieldCheck className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
                    <p className="text-sm text-gray-400 mt-1">Hospital OS Super Administration</p>
                </div>

                {/* Form */}
                <form action={formAction} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-5">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                            {state.error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
                            placeholder="superadmin@hospitalos.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl transition disabled:opacity-50"
                    >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {pending ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-xs text-gray-600 mt-6">
                    This is a restricted area. Unauthorized access is prohibited.
                </p>
            </div>
        </div>
    );
}
