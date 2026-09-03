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
                <header className="sticky top-0 z-50 bg-white dark:bg-[#0f172a] backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm px-6 py-3.5 flex items-center justify-between print:hidden transition-colors">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20 ring-2 ring-orange-500/20">
                            <Building2 className="w-5 h-5 font-bold" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Axten</span>
                                <span className="text-orange-600 dark:text-orange-400 font-black text-xl">OS<sup>+</sup></span>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 uppercase tracking-widest flex items-center gap-1">
                                    <Activity className="w-3 h-3 text-orange-600 dark:text-orange-400 animate-pulse" />
                                    Hospital Suite
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Multi-Unit Operational & Financial Audit Intelligence</p>
                        </div>
                    </div>

                    {/* Active Hospital Units Dynamic Badges */}
                    <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs shadow-inner">
                        <span className="text-slate-400 dark:text-slate-400 font-extrabold uppercase tracking-wider text-[10px] mr-1">Active Units:</span>
                        {unitSummaries.map((unit) => {
                            const badgeStyle = unit.code === 'axten'
                                ? 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30'
                                : unit.code === 'avise'
                                ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                                : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
                            return (
                                <span
                                    key={unit.code}
                                    className={`px-3 py-1 rounded-xl border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${badgeStyle}`}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-orange-400" />
                                    {unit.shortName} <span className="opacity-75">({unit.beds} Beds)</span>
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
