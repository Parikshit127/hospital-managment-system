'use client';

import React from 'react';

type KPIColor = 'blue' | 'teal' | 'violet' | 'amber' | 'emerald' | 'rose';

interface KPICardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color?: KPIColor;
    subtitle?: string;
    trend?: { value: string; positive: boolean };
    className?: string;
}

const colorMap: Record<KPIColor, { iconBg: string; accent: string }> = {
    blue: { iconBg: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100', accent: 'text-sky-600' },
    teal: { iconBg: 'bg-teal-50 text-teal-600 ring-1 ring-teal-100', accent: 'text-teal-600' },
    violet: { iconBg: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100', accent: 'text-violet-600' },
    amber: { iconBg: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100', accent: 'text-amber-600' },
    emerald: { iconBg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100', accent: 'text-emerald-600' },
    rose: { iconBg: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100', accent: 'text-rose-600' },
};

export function KPICard({ label, value, icon, color = 'blue', subtitle, trend, className = '' }: KPICardProps) {
    const colors = colorMap[color];

    return (
        <div className={`bg-white rounded-2xl border border-gray-200/60 shadow-[var(--shadow-card)] p-5 hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 ${className}`}>
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
                    <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</p>
                    {subtitle && <p className="text-xs text-gray-400 leading-relaxed">{subtitle}</p>}
                    {trend && (
                        <p className={`text-xs font-semibold ${trend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {trend.positive ? '+' : ''}{trend.value}
                        </p>
                    )}
                </div>
                <div className={`p-2.5 rounded-xl ${colors.iconBg}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
