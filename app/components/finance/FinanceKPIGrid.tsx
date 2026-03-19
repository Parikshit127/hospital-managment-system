'use client';

import { ReactNode } from 'react';

interface KPICard {
    label: string;
    value: string;
    subtitle: string;
    icon: ReactNode;
    color: string; // e.g. 'emerald', 'teal', 'red', 'amber', 'violet', 'cyan'
}

export function FinanceKPIGrid({ cards }: { cards: KPICard[] }) {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${Math.min(cards.length, 6)} gap-4`}>
            {cards.map((card, i) => (
                <div key={i} className={`group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-${card.color}-500/30 transition-all overflow-hidden`}>
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-${card.color}-500/5 rounded-full blur-2xl`} />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">{card.label}</span>
                        <div className={`p-1.5 bg-${card.color}-500/10 rounded-lg`}>{card.icon}</div>
                    </div>
                    <p className="text-3xl font-black text-gray-900 tracking-tight">{card.value}</p>
                    <p className={`flex items-center gap-1 mt-2 text-xs font-bold text-${card.color}-400`}>{card.subtitle}</p>
                </div>
            ))}
        </div>
    );
}
