'use client';

import React from 'react';

/** Status -> pill colours, shared by the employee portal and the HR screens. */
const STATUS_STYLES: Record<string, string> = {
    Present: 'bg-green-100 text-green-700',
    'Half-Day': 'bg-yellow-100 text-yellow-700',
    Absent: 'bg-red-100 text-red-700',
    Leave: 'bg-blue-100 text-blue-700',
    Holiday: 'bg-purple-100 text-purple-700',
    'Week-Off': 'bg-gray-100 text-gray-500',
    'Not Marked': 'bg-orange-100 text-orange-700',
    Upcoming: 'bg-gray-50 text-gray-400',
    'N/A': 'bg-gray-50 text-gray-300',
    Pending: 'bg-yellow-100 text-yellow-700',
    Approved: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-700',
    Cancelled: 'bg-gray-100 text-gray-500',
};

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'} ${className}`}>
            {status}
        </span>
    );
}

/** Calendar-cell colours (a bit stronger than the pills). */
export const CELL_STYLES: Record<string, string> = {
    Present: 'bg-green-50 border-green-200 text-green-800',
    'Half-Day': 'bg-yellow-50 border-yellow-200 text-yellow-800',
    Absent: 'bg-red-50 border-red-200 text-red-800',
    Leave: 'bg-blue-50 border-blue-200 text-blue-800',
    Holiday: 'bg-purple-50 border-purple-200 text-purple-800',
    'Week-Off': 'bg-gray-50 border-gray-200 text-gray-400',
    'Not Marked': 'bg-orange-50 border-orange-200 text-orange-700',
    Upcoming: 'bg-white border-gray-100 text-gray-300',
    'N/A': 'bg-white border-gray-100 text-gray-200',
};

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-white border border-gray-200 shadow-sm rounded-2xl ${className}`}>{children}</div>;
}

export function StatTile({ label, value, tone = 'text-gray-900', hint }: {
    label: string; value: React.ReactNode; tone?: string; hint?: string;
}) {
    return (
        <Card className="p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
            {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
        </Card>
    );
}

export const inputCls =
    'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white';

export const labelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1';

export const primaryBtn =
    'inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed';

export const ghostBtn =
    'inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-white text-gray-600 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50';

/** "3h 20m" from milliseconds. */
export function fmtDuration(ms: number): string {
    const m = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function fmtHours(h: number | null | undefined): string {
    if (h === null || h === undefined) return '—';
    const m = Math.round(h * 60);
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
}
