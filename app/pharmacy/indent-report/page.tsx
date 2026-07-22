'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { ClipboardList, Search, Download, Loader2, AlertTriangle } from 'lucide-react';
import { getIndentReport } from '@/app/actions/indent-report-actions';

const STATUSES = ['Pending', 'Verified', 'Completed', 'Dispensed', 'Cancelled'];

function fmtMoney(n: number) {
    return Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function ageLabel(hours: number) {
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export default function IndentReportPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const res = await getIndentReport({ search, status, from, to });
        if (res.success && res.data) {
            setRows(res.data.rows);
            setSummary(res.data.summary);
        } else {
            setError(res.error || 'Failed to load indent report');
        }
        setLoading(false);
    }, [search, status, from, to]);

    useEffect(() => {
        const t = setTimeout(load, 300);
        return () => clearTimeout(t);
    }, [load]);

    function exportCsv() {
        const head = ['Indent No', 'Date', 'Patient', 'UHID', 'Raised By', 'Status', 'Lines', 'Qty Requested', 'Qty Dispensed', 'Short', 'Value'];
        const body = rows.map(r => [
            r.indent_number,
            new Date(r.created_at).toLocaleString('en-IN'),
            r.patient_name ?? '',
            r.patient_id ?? '',
            r.requested_by ?? '',
            r.status ?? '',
            r.line_count,
            r.qty_requested,
            r.qty_dispensed,
            r.qty_short,
            r.value,
        ]);
        const csv = [head, ...body]
            .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `indent-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <AppShell pageTitle="Indent Report" pageIcon={<ClipboardList className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        ['Total Indents', summary?.total ?? 0, 'text-gray-900'],
                        ['Pending', summary?.pending ?? 0, 'text-amber-600'],
                        ['Completed', summary?.completed ?? 0, 'text-emerald-600'],
                        ['Short Supplied', summary?.short_supplied ?? 0, 'text-rose-600'],
                        ['Value', fmtMoney(summary?.total_value ?? 0), 'text-gray-900'],
                    ].map(([label, value, cls]) => (
                        <div key={String(label)} className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                            <p className={`text-xl font-black mt-1 ${cls}`}>{value}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search indent no, UHID or nurse…"
                            className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400/20" />
                    </div>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white" />
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white" />
                    <select value={status} onChange={e => setStatus(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white">
                        <option value="">All statuses</option>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={exportCsv} disabled={!rows.length}
                        className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40">
                        <Download className="h-3.5 w-3.5" /> Export CSV
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" /> {error}
                    </div>
                )}

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                    <th className="px-4 py-3">Indent No</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Patient</th>
                                    <th className="px-4 py-3">Raised By</th>
                                    <th className="px-4 py-3 text-center">Lines</th>
                                    <th className="px-4 py-3 text-right">Req</th>
                                    <th className="px-4 py-3 text-right">Disp</th>
                                    <th className="px-4 py-3 text-right">Short</th>
                                    <th className="px-4 py-3 text-right">Value</th>
                                    <th className="px-4 py-3 text-center">Age</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && (
                                    <tr><td colSpan={11} className="py-16 text-center text-gray-400">
                                        <Loader2 className="h-5 w-5 animate-spin inline" /> Loading indents…
                                    </td></tr>
                                )}
                                {!loading && rows.length === 0 && (
                                    <tr><td colSpan={11} className="py-16 text-center text-gray-400">No indents match these filters.</td></tr>
                                )}
                                {!loading && rows.map(r => (
                                    <React.Fragment key={r.id}>
                                        <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                            className="hover:bg-gray-50 cursor-pointer">
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{r.indent_number}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                {new Date(r.created_at).toLocaleString('en-IN', {
                                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                                })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs font-bold text-gray-900">{r.patient_name || '—'}</div>
                                                <div className="text-[10px] text-gray-500 font-mono">{r.patient_id}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{r.requested_by}</td>
                                            <td className="px-4 py-3 text-center text-xs">{r.line_count}</td>
                                            <td className="px-4 py-3 text-right text-xs">{r.qty_requested}</td>
                                            <td className="px-4 py-3 text-right text-xs">{r.qty_dispensed}</td>
                                            <td className={`px-4 py-3 text-right text-xs font-bold ${r.qty_short > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                                                {r.qty_short || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-bold">{fmtMoney(r.value)}</td>
                                            <td className={`px-4 py-3 text-center text-xs ${r.age_hours > 48 && String(r.status).toLowerCase() === 'pending' ? 'text-rose-600 font-bold' : 'text-gray-500'}`}>
                                                {ageLabel(r.age_hours)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    String(r.status).toLowerCase() === 'pending'
                                                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                                                        : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                }`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                        </tr>
                                        {expanded === r.id && (
                                            <tr className="bg-gray-50/70">
                                                <td colSpan={11} className="px-8 py-3">
                                                    <table className="w-full text-[11px]">
                                                        <thead className="text-gray-400 uppercase font-bold">
                                                            <tr>
                                                                <th className="text-left py-1">Medicine</th>
                                                                <th className="text-right py-1">Requested</th>
                                                                <th className="text-right py-1">Dispensed</th>
                                                                <th className="text-left py-1 pl-6">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {r.items.map((it: any, idx: number) => (
                                                                <tr key={idx} className="border-t border-gray-200">
                                                                    <td className="py-1.5 font-medium text-gray-700">{it.medicine_name}</td>
                                                                    <td className="py-1.5 text-right">{it.quantity_requested}</td>
                                                                    <td className="py-1.5 text-right">{it.quantity_dispensed ?? 0}</td>
                                                                    <td className="py-1.5 pl-6 text-gray-500">{it.status}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
