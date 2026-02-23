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

const colorMap: Record<KPIColor, { bg: string; iconBg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
    teal: { bg: 'bg-teal-50', iconBg: 'bg-teal-100 text-teal-600', text: 'text-teal-600' },
    violet: { bg: 'bg-violet-50', iconBg: 'bg-violet-100 text-violet-600', text: 'text-violet-600' },
    amber: { bg: 'bg-amber-50', iconBg: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
    rose: { bg: 'bg-rose-50', iconBg: 'bg-rose-100 text-rose-600', text: 'text-rose-600' },
};

export function KPICard({ label, value, icon, color = 'blue', subtitle, trend, className = '' }: KPICardProps) {
    const colors = colorMap[color];

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-black text-gray-900">{value}</p>
                    {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
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
