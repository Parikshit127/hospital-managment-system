import React from 'react';
import { getInvestorSession } from '@/app/actions/investor-auth-actions';
import { getInvestorUnitSummaries } from '@/app/actions/investor-actions';
import { redirect } from 'next/navigation';
import { Building2, Activity } from 'lucide-react';
import { InvestorThemeProvider } from './investor-theme-context';
import { InvestorHeaderControls } from './investor-header-controls';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
    const session = await getInvestorSession();
    if (!session) {
        redirect('/login/investor');
    }

    const unitSummaries = await getInvestorUnitSummaries();

    return (
        <InvestorThemeProvider>
            <div className="min-h-screen font-sans antialiased selection:bg-orange-500/30 selection:text-orange-900 transition-colors duration-200">
                {/* Top Executive Header Bar */}
                <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#090d16]/90 backdrop-blur-md border-b border-orange-200/80 dark:border-slate-800/80 shadow-md shadow-orange-500/5 px-6 py-3 flex items-center justify-between print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20 ring-2 ring-orange-400/30">
                            <Building2 className="w-5 h-5 font-bold" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Axten</span>
                                <span className="text-orange-600 dark:text-orange-400 font-black text-xl">OS<sup>+</sup></span>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/30 uppercase tracking-widest flex items-center gap-1">
                                    <Activity className="w-3 h-3 text-orange-600 dark:text-orange-400 animate-pulse" />
                                    Hospital Suite
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Multi-Unit Operational & Financial Audit Intelligence</p>
                        </div>
                    </div>

                    {/* Active Hospital Units Dynamic Badges */}
                    <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-orange-50/60 dark:bg-slate-900/80 border border-orange-200/80 dark:border-slate-800/80 text-xs shadow-inner">
                        <span className="text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider text-[10px] mr-1">Active Units:</span>
                        {unitSummaries.map((unit) => {
                            const badgeStyle = unit.code === 'axten'
                                ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30'
                                : unit.code === 'avise'
                                ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700';
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

                    {/* Header Controls (Theme Switcher, User Session, Settings, Logout) */}
                    <InvestorHeaderControls userName={session.name || 'Promoter'} />
                </header>

                {/* Main Dashboard Container */}
                <main className="p-6 max-w-[1680px] mx-auto print:p-0 print:max-w-none">
                    {children}
                </main>
            </div>
        </InvestorThemeProvider>
    );
}
