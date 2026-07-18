'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { Printer, ArrowLeft, Calendar, CalendarRange, CalendarClock } from 'lucide-react';
import { getUsersList } from '@/app/actions/admin-actions';

type Mode = 'today' | 'single' | 'range';

function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CollectionReportPage() {
    const today = ymd(new Date());
    const [mode, setMode] = useState<Mode>('today');
    const [singleDate, setSingleDate] = useState(today);
    const [fromDate, setFromDate] = useState(today);
    const [toDate, setToDate] = useState(today);
    const [cashier, setCashier] = useState('all');
    const [cashierUsers, setCashierUsers] = useState<{ username: string; name: string }[]>([]);
    // Default ON: the front-desk report shouldn't carry pharmacy collection
    // (pharmacy bills at its own counter). Finance's report is unaffected.
    const [excludePharmacy, setExcludePharmacy] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getUsersList({ is_active: true, limit: 500 }).then((res: any) => {
            if (res?.success && res.data?.users) {
                // Test-only accounts that must never appear as selectable cashiers.
                const EXCLUDED_USERNAMES = new Set(['test.devadmin', 'test.developer']);
                setCashierUsers(res.data.users
                    // Doctors (role === 'doctor') are never cash-counter cashiers — exclude them
                    // so they cannot populate this dropdown. Case-insensitive for safety.
                    // Also drop the seeded dev/test accounts by username.
                    .filter((u: any) =>
                        u.username &&
                        String(u.role).toLowerCase() !== 'doctor' &&
                        !EXCLUDED_USERNAMES.has(String(u.username).toLowerCase()))
                    .map((u: any) => ({ username: u.username, name: u.name || u.username })));
            }
        });
    }, []);

    function resolveRange(): { from: string; to: string } | null {
        if (mode === 'today') return { from: today, to: today };
        if (mode === 'single') return singleDate ? { from: singleDate, to: singleDate } : null;
        // range
        if (!fromDate || !toDate) return null;
        if (fromDate > toDate) { setError('“From” date cannot be after “To” date.'); return null; }
        return { from: fromDate, to: toDate };
    }

    function generate() {
        setError('');
        const r = resolveRange();
        if (!r) { setError('Please select a valid date.'); return; }
        const cashierParam = cashier && cashier !== 'all' ? `&cashier=${encodeURIComponent(cashier)}` : '';
        const pharmaParam = excludePharmacy ? '&excludePharmacy=1' : '';
        window.open(`/api/reports/collections/pdf?from=${r.from}&to=${r.to}${cashierParam}${pharmaParam}`, '_blank');
    }

    const modeCards: { id: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
        { id: 'today', label: "Today", hint: "Current date's collection", icon: <CalendarClock className="h-4 w-4" /> },
        { id: 'single', label: 'Specific / Back Date', hint: 'Any single past date', icon: <Calendar className="h-4 w-4" /> },
        { id: 'range', label: 'Date Range', hint: 'From – To period', icon: <CalendarRange className="h-4 w-4" /> },
    ];

    const inputCls = 'w-40 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-400';

    return (
        <AppShell pageTitle="Collection Report" pageIcon={<Printer className="h-5 w-5" />}>
            <div className="max-w-3xl mx-auto space-y-6">
                <Link href="/reception/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Reception
                </Link>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Daily Collection Report</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Print the cash-counter collection report for a date, a back-date, or a range — optionally for a single cashier.</p>
                    </div>

                    {/* Mode selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {modeCards.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => { setMode(m.id); setError(''); }}
                                className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                                    mode === m.id ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20' : 'border-gray-200 hover:bg-gray-50'
                                }`}>
                                <span className={`flex items-center gap-1.5 text-xs font-black ${mode === m.id ? 'text-teal-700' : 'text-gray-700'}`}>
                                    {m.icon} {m.label}
                                </span>
                                <span className="text-[10px] text-gray-400">{m.hint}</span>
                            </button>
                        ))}
                    </div>

                    {/* Date inputs */}
                    <div className="flex flex-wrap items-end gap-4">
                        {mode === 'single' && (
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Date</label>
                                <DateField value={singleDate} max={today} onChange={(e) => setSingleDate(e.target.value)} className={inputCls} />
                            </div>
                        )}
                        {mode === 'range' && (
                            <>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">From</label>
                                    <DateField value={fromDate} max={today} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">To</label>
                                    <DateField value={toDate} max={today} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
                                </div>
                            </>
                        )}
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Cashier</label>
                            <select value={cashier} onChange={(e) => setCashier(e.target.value)} className={inputCls}>
                                <option value="all">All cashiers</option>
                                {cashierUsers.map((u) => <option key={u.username} value={u.username}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                        <input
                            type="checkbox"
                            checked={excludePharmacy}
                            onChange={(e) => setExcludePharmacy(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-400"
                        />
                        <span className="text-xs font-bold text-gray-600">Reception only — exclude Pharmacy collection</span>
                    </label>

                    {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

                    <div className="pt-2 border-t border-gray-100">
                        <button
                            onClick={generate}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all">
                            <Printer className="h-4 w-4" /> Generate &amp; Print Report
                        </button>
                        <p className="text-[10px] text-gray-400 mt-2">Opens the report in a new tab, ready to print.</p>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
