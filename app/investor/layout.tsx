import React from 'react';
import { getInvestorSession, investorLogout } from '@/app/actions/investor-auth-actions';
import { redirect } from 'next/navigation';
import { Building2, LogOut, User } from 'lucide-react';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
    const session = await getInvestorSession();
    if (!session) {
        redirect('/login/investor');
    }

    return (
        <div className="min-h-screen bg-[#faf9f6] text-[#0a1e42] font-sans">
            {/* Top HIMS Header Bar */}
            <header className="sticky top-0 z-50 bg-white border-b border-[#ede9e2] shadow-sm px-6 py-3.5 flex items-center justify-between print:hidden">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0a1e42] text-white flex items-center justify-center shadow-sm">
                        <Building2 className="w-5 h-5 font-bold text-emerald-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black tracking-tight text-[#0a1e42]">Axten</span>
                            <span className="text-emerald-600 font-black text-xl">OS<sup>+</sup></span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                                Promoter Suite
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">Consolidated Executive Dashboard of All Hospital Units</p>
                    </div>
                </div>

                {/* Active Hospital Units Badges */}
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#faf9f6] border border-[#ede9e2] text-xs">
                    <span className="text-slate-500 font-bold mr-1">Active Units:</span>
                    <span className="px-2.5 py-0.5 rounded bg-white text-emerald-800 border border-emerald-300 font-extrabold">Axten (20B)</span>
                    <span className="px-2.5 py-0.5 rounded bg-white text-indigo-800 border border-indigo-300 font-extrabold">Avise (50B)</span>
                    <span className="px-2.5 py-0.5 rounded bg-white text-amber-800 border border-amber-300 font-extrabold">Axten HQ (0B)</span>
                </div>

                {/* User Session & Logout */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2.5 text-right">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                            <User className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-[#0a1e42]">{session.name || 'Promoter'}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{session.user || 'investor'} • Executive Session</p>
                        </div>
                    </div>

                    <form action={investorLogout}>
                        <button
                            type="submit"
                            title="Sign Out"
                            className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </header>

            {/* Main Dashboard Container */}
            <main className="p-6 max-w-[1600px] mx-auto print:p-0 print:max-w-none">
                {children}
            </main>
        </div>
    );
}
