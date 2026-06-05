'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';
import { getDrillDownData, DrillDownType } from '@/app/actions/finance-actions';
import Link from 'next/link';

interface DrillDownModalProps {
    type: DrillDownType;
    filters: Record<string, any>;
    onClose: () => void;
}

export function DrillDownModal({ type, filters, onClose }: DrillDownModalProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ title: string; columns: string[]; rows: Record<string, any>[] } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setLoading(true);
        setError('');
        getDrillDownData(type, filters)
            .then(res => {
                if (res.success) setData((res as any).data);
                else setError((res as any).error || 'Failed to load');
            })
            .catch(() => setError('Network error — please try again'))
            .finally(() => setLoading(false));
    }, [type, JSON.stringify(filters)]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const exportCsv = () => {
        if (!data) return;
        const rowKeys = data.rows[0] ? Object.keys(data.rows[0]).filter(k => k !== 'invoiceId') : [];
        const headers = data.columns.join(',');
        const rows = data.rows.map(r => rowKeys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${type}-drilldown.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-3xl bg-white shadow-2xl flex flex-col h-full transition-transform duration-300 translate-x-0">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-base font-black text-gray-900">{data?.title || 'Loading...'}</h2>
                    <div className="flex items-center gap-2">
                        {data && data.rows.length > 0 && (
                            <button onClick={exportCsv}
                                className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                                Export CSV
                            </button>
                        )}
                        <button onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                            <p className="text-xs font-bold text-gray-400">Loading detail...</p>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="p-6 text-center text-rose-500 text-sm font-medium">{error}</div>
                    )}
                    {!loading && data && data.rows.length === 0 && (
                        <div className="p-12 text-center text-gray-400 text-sm">No data found.</div>
                    )}
                    {!loading && data && data.rows.length > 0 && (
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                                <tr>
                                    {data.columns.map(col => (
                                        <th key={col} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.rows.map((row, i) => {
                                    const rowKeys = Object.keys(row).filter(k => k !== 'invoiceId');
                                    return (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                            {rowKeys.map((key, j) => (
                                                <td key={key} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                                    {j === 0 && row.invoiceId ? (
                                                        <Link href={`/finance/invoices/${row.invoiceId}`}
                                                            className="font-mono text-emerald-600 hover:text-emerald-800 hover:underline flex items-center gap-1">
                                                            {row[key]} <ExternalLink className="h-3 w-3" />
                                                        </Link>
                                                    ) : (
                                                        <span className={key === 'status' ? getStatusClass(String(row[key])) : key === 'type' ? getTypeClass(String(row[key])) : ''}>
                                                            {row[key]}
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                {data && (
                    <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400">{data.rows.length} record{data.rows.length !== 1 ? 's' : ''}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function getStatusClass(status: string): string {
    const map: Record<string, string> = {
        Draft: 'px-2 py-0.5 rounded text-[10px] font-black text-slate-500 bg-slate-100',
        Final: 'px-2 py-0.5 rounded text-[10px] font-black text-amber-600 bg-amber-50',
        Paid: 'px-2 py-0.5 rounded text-[10px] font-black text-emerald-600 bg-emerald-50',
        Partial: 'px-2 py-0.5 rounded text-[10px] font-black text-orange-600 bg-orange-50',
        Cancelled: 'px-2 py-0.5 rounded text-[10px] font-black text-rose-600 bg-rose-50',
        Active: 'px-2 py-0.5 rounded text-[10px] font-black text-emerald-600 bg-emerald-50',
        Pending: 'px-2 py-0.5 rounded text-[10px] font-black text-amber-600 bg-amber-50',
        Approved: 'px-2 py-0.5 rounded text-[10px] font-black text-emerald-600 bg-emerald-50',
    };
    return map[status] || '';
}

function getTypeClass(type: string): string {
    return type === 'IPD'
        ? 'px-2 py-0.5 rounded text-[10px] font-black text-violet-600 bg-violet-50'
        : 'px-2 py-0.5 rounded text-[10px] font-black text-teal-600 bg-teal-50';
}
