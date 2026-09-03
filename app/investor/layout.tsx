import React from 'react';
import Link from 'next/link';
import { getInvestorSession, investorLogout } from '@/app/actions/investor-auth-actions';
import { getInvestorUnitSummaries } from '@/app/actions/investor-actions';
import { redirect } from 'next/navigation';
import { Building2, LogOut, Settings, User, Activity, ShieldCheck } from 'lucide-react';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
    const session = await getInvestorSession();
    if (!session) {
        redirect('/login/investor');
    }

    const unitSummaries = await getInvestorUnitSummaries();

    return (
        <div className="min-h-screen bg-[#070d19] text-slate-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
            {/* Top Executive Header Bar */}
            <header className="sticky top-0 z-50 bg-[#0b1329]/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg px-6 py-3 flex items-center justify-between print:hidden">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-950/40 ring-1 ring-white/10">
                        <Building2 className="w-5 h-5 font-bold" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black tracking-tight text-white">Axten</span>
                            <span className="text-emerald-400 font-black text-xl">OS<sup>+</sup></span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                                Executive Suite
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">Multi-Unit Operational & Financial Audit Intelligence</p>
                    </div>
                </div>

                {/* Active Hospital Units Dynamic Badges */}
                <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-xs shadow-inner">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[10px] mr-1">Active Units:</span>
                    {unitSummaries.map((unit) => {
                        const badgeStyle = unit.code === 'axten'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : unit.code === 'avise'
                            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30';
                        return (
                            <span
                                key={unit.code}
                                className={`px-3 py-1 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${badgeStyle}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {unit.shortName} <span className="opacity-80">({unit.beds} Beds)</span>
                            </span>
                        );
                    })}
                </div>

                {/* User Session & Logout */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-2xl">
                        <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
                            <User className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-black text-white leading-none">{session.name || 'Promoter'}</p>
                            <p className="text-[10px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                Executive Session
                            </p>
                        </div>
                    </div>

                    <Link
                        href="/investor/settings"
                        title="Portal Access Settings"
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                    >
                        <Settings className="w-4 h-4" />
                    </Link>

                    <form action={investorLogout}>
                        <button
                            type="submit"
                            title="Sign Out"
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/30 hover:border-red-900/50 transition-all cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </header>

            {/* Main Dashboard Container */}
            <main className="p-6 max-w-[1680px] mx-auto print:p-0 print:max-w-none">
                {children}
            </main>
        </div>
    );
}
