'use client';

import React from 'react';
import Link from 'next/link';
import { useInvestorTheme } from './investor-theme-context';
import { Sun, Moon, Settings, LogOut, ShieldCheck, User } from 'lucide-react';
import { investorLogout } from '@/app/actions/investor-auth-actions';

interface InvestorHeaderControlsProps {
    userName: string;
}

export function InvestorHeaderControls({ userName }: InvestorHeaderControlsProps) {
    const { theme, toggleTheme } = useInvestorTheme();
    const isDark = theme === 'dark';

    return (
        <div className="flex items-center gap-3">
            {/* Theme Toggle Button (White Theme / Dark Theme) */}
            <button
                type="button"
                onClick={toggleTheme}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all border cursor-pointer shadow-sm ${
                    isDark
                        ? 'bg-slate-800 border-slate-700 text-orange-400 hover:bg-slate-700 hover:border-orange-500/50'
                        : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600'
                }`}
                title={`Switch to ${isDark ? 'White Theme' : 'Dark Theme'}`}
            >
                {isDark ? (
                    <>
                        <Sun className="w-4 h-4 text-orange-400 animate-spin-slow" />
                        <span className="font-mono uppercase tracking-wider text-[11px]">White Theme</span>
                    </>
                ) : (
                    <>
                        <Moon className="w-4 h-4 text-slate-600" />
                        <span className="font-mono uppercase tracking-wider text-[11px] text-slate-700">Dark Theme</span>
                    </>
                )}
            </button>

            {/* Session Info */}
            <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border ${
                isDark
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-slate-100/70 border-slate-200 shadow-sm'
            }`}>
                <div className="w-7 h-7 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    <User className="w-4 h-4" />
                </div>
                <div className="text-left hidden sm:block">
                    <p className={`text-xs font-black leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>{userName || 'Promoter'}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 flex items-center gap-1 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                        <ShieldCheck className="w-3 h-3" />
                        Executive Session
                    </p>
                </div>
            </div>

            {/* Settings Link */}
            <Link
                href="/investor/settings"
                title="Portal Access Settings"
                className={`p-2 rounded-2xl border transition-all cursor-pointer ${
                    isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-orange-600 hover:bg-orange-50'
                }`}
            >
                <Settings className="w-4 h-4" />
            </Link>

            {/* Sign Out Button */}
            <form action={investorLogout}>
                <button
                    type="submit"
                    title="Sign Out"
                    className={`p-2 rounded-2xl border transition-all cursor-pointer ${
                        isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 hover:border-rose-900/50'
                            : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200'
                    }`}
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
}
