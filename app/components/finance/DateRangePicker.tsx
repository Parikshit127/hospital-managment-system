'use client';

import { Calendar } from 'lucide-react';
import { DateField } from '@/app/components/ui/DateField';

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
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <DateField value={from} max={to} onChange={e => onChange(e.target.value, to)}
                    className="text-sm text-gray-700 border-none focus:ring-0 p-0 w-[130px]" />
                <span className="text-gray-300">to</span>
                <DateField value={to} min={from} onChange={e => onChange(from, e.target.value)}
                    className="text-sm text-gray-700 border-none focus:ring-0 p-0 w-[130px]" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {presets.map(p => {
                    const [f, t] = p.getRange();
                    const active = f === from && t === to;
                    return (
                        <button key={p.label} onClick={() => onChange(f, t)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg transition ${
                                active
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                            }`}>
                            {p.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
