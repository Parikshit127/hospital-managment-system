'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
    from: string;
    to: string;
    onChange: (from: string, to: string) => void;
}

const presets = [
    { label: 'Today', getRange: () => { const d = new Date().toISOString().slice(0, 10); return [d, d]; } },
    { label: 'This Week', getRange: () => {
        const now = new Date(); const day = now.getDay();
        const start = new Date(now); start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        return [start.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    }},
    { label: 'This Month', getRange: () => {
        const now = new Date();
        return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    }},
    { label: 'This Quarter', getRange: () => {
        const now = new Date(); const q = Math.floor(now.getMonth() / 3);
        return [new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    }},
    { label: 'This Year', getRange: () => {
        const now = new Date();
        return [new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    }},
];

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
    const [showPresets, setShowPresets] = useState(false);

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input type="date" value={from} onChange={e => onChange(e.target.value, to)}
                    className="text-sm text-gray-700 border-none focus:ring-0 p-0 w-[130px]" />
                <span className="text-gray-300">to</span>
                <input type="date" value={to} onChange={e => onChange(from, e.target.value)}
                    className="text-sm text-gray-700 border-none focus:ring-0 p-0 w-[130px]" />
            </div>
            <div className="relative">
                <button onClick={() => setShowPresets(!showPresets)}
                    className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                    Presets
                </button>
                {showPresets && (
                    <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36 z-10">
                        {presets.map(p => (
                            <button key={p.label} onClick={() => {
                                const [f, t] = p.getRange();
                                onChange(f, t);
                                setShowPresets(false);
                            }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700">
                                {p.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
