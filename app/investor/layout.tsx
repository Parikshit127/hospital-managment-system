import React from 'react';
import { getInvestorSession, investorLogout } from '@/app/actions/investor-auth-actions';
import { redirect } from 'next/navigation';
import { Building2, LogOut, ShieldCheck, Activity, BarChart3, TrendingUp, DollarSign } from 'lucide-react';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
    const session = await getInvestorSession();
    if (!session) {
        redirect('/login/investor');
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Building2 className="w-5 h-5 text-slate-950 font-bold" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-extrabold tracking-tight text-white">AXTEN HEALTHCARE</h1>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase tracking-wide">
                                Promoter Portal
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">Consolidated Executive Dashboard of All Units</p>
                    </div>
                </div>

                {/* Unit Badges Pill */}
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <span className="text-slate-400 font-medium mr-1">Active Units:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-emerald-400 border border-emerald-500/20 font-semibold">EOK (20B)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-amber-500/20 font-semibold">HQ (0B)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-indigo-400 border border-indigo-500/20 font-semibold">Gurugram (50B)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-cyan-500/20 font-semibold">Nehru Enclave (55B)</span>
                </div>

                {/* User Session & Logout */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-right">
                        <div>
                            <p className="text-xs font-bold text-slate-100">{session.name || 'Promoter'}</p>
                            <p className="text-[10px] text-emerald-400 font-mono">inv@123 • Executive Session</p>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                            IN
                        </div>
                    </div>

                    <form action={investorLogout}>
                        <button
                            type="submit"
                            title="Sign Out"
                            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </header>

            {/* Page Content */}
            <main className="p-6">
                {children}
            </main>
        </div>
    );
}
