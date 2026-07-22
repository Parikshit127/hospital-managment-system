'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, Loader2, ExternalLink, Download } from 'lucide-react';
import { getDrillDownData, DrillDownType } from '@/app/actions/finance-actions';
import Link from 'next/link';

interface DrillDownModalProps {
    type: DrillDownType;
    filters: Record<string, any>;
    onClose: () => void;
}

const OUTSTANDING_TYPES = new Set(['outstanding', 'outstanding-ipd-cash', 'outstanding-ipd-tpa', 'outstanding-opd']);
const HIDDEN_KEYS = new Set(['invoiceId', '_payer']);

export function DrillDownModal({ type, filters, onClose }: DrillDownModalProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ title: string; columns: string[]; rows: Record<string, any>[] } | null>(null);
    const [error, setError] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'OPD' | 'IPD'>('all');
    const [payerFilter, setPayerFilter] = useState<'all' | 'Cash' | 'TPA'>('all');

    const isOutstanding = OUTSTANDING_TYPES.has(type);

    useEffect(() => {
        setLoading(true);
        setError('');
        setTypeFilter('all');
        setPayerFilter('all');
        getDrillDownData(type, filters)
            .then(res => {
                if (res.success) setData((res as any).data);
                else setError((res as any).error || 'Failed to load');
            })
            .catch(() => setError('Network error — please try again'))
            .finally(() => setLoading(false));
    }, [type, JSON.stringify(filters)]);

    const filteredRows = useMemo(() => {
        if (!data) return [];
        if (!isOutstanding) return data.rows;
        return data.rows.filter(row => {
            if (typeFilter !== 'all' && row.type !== typeFilter) return false;
            if (payerFilter !== 'all' && row._payer !== payerFilter) return false;
            return true;
        });
    }, [data, typeFilter, payerFilter, isOutstanding]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const exportCsv = () => {
        if (!data) return;
        const rowKeys = filteredRows[0] ? Object.keys(filteredRows[0]).filter(k => !HIDDEN_KEYS.has(k)) : [];
        const headers = data.columns.join(',');
        const rows = filteredRows.map(r => rowKeys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${type}-drilldown.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const [exportingExcel, setExportingExcel] = useState(false);
    const exportExcel = async () => {
        if (!data || filteredRows.length === 0) return;
        setExportingExcel(true);
        try {
            const rowKeys = Object.keys(filteredRows[0]).filter(k => !HIDDEN_KEYS.has(k));
            const sheetRows = filteredRows.map(r => {
                const obj: Record<string, any> = {};
                rowKeys.forEach((k, i) => { obj[data.columns[i]] = r[k] ?? ''; });
                return obj;
            });
            const xlsxModule = await import('xlsx');
            const XLSX = (xlsxModule as any).default ?? xlsxModule;
            const ws = XLSX.utils.json_to_sheet(sheetRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, `${type}-drilldown.xlsx`);
        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            setExportingExcel(false);
        }
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
                            <>
                                <button onClick={exportExcel} disabled={exportingExcel}
                                    className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50 flex items-center gap-1.5">
                                    {exportingExcel ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                    Export Excel
                                </button>
                                <button onClick={exportCsv}
                                    className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                                    Export CSV
                                </button>
                            </>
                        )}
                        <button onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Outstanding filters */}
                {isOutstanding && !loading && data && (
                    <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3 flex-shrink-0 bg-gray-50">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</span>
                            {(['all', 'IPD', 'OPD'] as const).map(v => (
                                <button key={v} onClick={() => setTypeFilter(v)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${typeFilter === v ? 'bg-blue-500/20 text-blue-700 border border-blue-500/30' : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-800'}`}>
                                    {v === 'all' ? 'All' : v}
                                </button>
                            ))}
                        </div>
                        <div className="w-px h-4 bg-gray-200" />
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payer</span>
                            {(['all', 'Cash', 'TPA'] as const).map(v => (
                                <button key={v} onClick={() => setPayerFilter(v)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${payerFilter === v ? 'bg-amber-500/20 text-amber-700 border border-amber-500/30' : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-800'}`}>
                                    {v === 'all' ? 'All' : v}
                                </button>
                            ))}
                        </div>
                        {(typeFilter !== 'all' || payerFilter !== 'all') && (
                            <button onClick={() => { setTypeFilter('all'); setPayerFilter('all'); }}
                                className="ml-auto text-[10px] font-bold text-gray-400 hover:text-gray-600 underline">
                                Clear filters
                            </button>
                        )}
                    </div>
                )}

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
                    {!loading && data && filteredRows.length === 0 && (
                        <div className="p-12 text-center text-gray-400 text-sm">No data found.</div>
                    )}
                    {!loading && data && filteredRows.length > 0 && (
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
                                {filteredRows.map((row, i) => {
                                    const rowKeys = Object.keys(row).filter(k => !HIDDEN_KEYS.has(k));
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
                    <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-gray-400">
                            {filteredRows.length}{filteredRows.length !== data.rows.length ? ` of ${data.rows.length}` : ''} record{filteredRows.length !== 1 ? 's' : ''}
                        </p>
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
