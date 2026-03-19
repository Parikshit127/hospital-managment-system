'use client';

import { useState, useEffect, useRef } from 'react';
import {
    getBankTransactions, importBankStatement, autoReconcile, getReconciliationSummary,
} from '@/app/actions/bank-actions';
import {
    Loader2, Upload, RefreshCw, CheckCircle, XCircle,
    Search, IndianRupee, Link2, X, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function BankReconPage() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'reconciled' | 'unreconciled'>('all');
    const [search, setSearch] = useState('');
    const [autoReconciling, setAutoReconciling] = useState(false);

    // Upload
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => { loadData(); }, [filter]);

    async function loadData() {
        setLoading(true);
        const reconFilter = filter === 'reconciled' ? true : filter === 'unreconciled' ? false : undefined;
        const [txnRes, sumRes] = await Promise.all([
            getBankTransactions(reconFilter !== undefined ? { reconciled: reconFilter } : undefined),
            getReconciliationSummary(),
        ]);
        if (txnRes.success) setTransactions(txnRes.data || []);
        if (sumRes.success) setSummary(sumRes.data);
        setLoading(false);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const text = await file.text();
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length < 2) {
                alert('CSV must have at least a header row and one data row');
                setUploading(false);
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const rows = lines.slice(1).map(line => {
                const cols = line.split(',').map(c => c.trim());
                const row: any = {};
                headers.forEach((h, i) => { row[h] = cols[i] || ''; });
                return {
                    transaction_date: row['date'] || row['transaction_date'] || row['txn_date'] || new Date().toISOString(),
                    description: row['description'] || row['narration'] || row['details'] || '',
                    reference: row['reference'] || row['ref'] || row['cheque_no'] || '',
                    debit: parseFloat(row['debit'] || row['withdrawal'] || '0') || 0,
                    credit: parseFloat(row['credit'] || row['deposit'] || '0') || 0,
                    balance: parseFloat(row['balance'] || row['closing_balance'] || '0') || 0,
                    bank_account: 'Primary',
                };
            });

            const res = await importBankStatement(rows);
            if (res.success) {
                loadData();
            } else {
                alert(res.error);
            }
        } catch (err: any) {
            alert('Failed to parse CSV: ' + err.message);
        }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
    }

    async function handleAutoReconcile() {
        setAutoReconciling(true);
        const res = await autoReconcile();
        if (res.success) {
            alert(`Auto-reconciled ${res.data?.matchedCount} of ${res.data?.totalUnmatched} unmatched transactions`);
            loadData();
        } else {
            alert(res.error);
        }
        setAutoReconciling(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const filtered = transactions.filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return t.description?.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q);
    });

    return (
        <AppShell pageTitle="Bank Reconciliation" pageIcon={<Link2 className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
                    <p className="text-sm text-gray-500 mt-1">Import statements and match with payments & expenses</p>
                </div>
                <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Import CSV
                    </button>
                    <button onClick={handleAutoReconcile} disabled={autoReconciling}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                        {autoReconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Auto-Reconcile
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-50 rounded-lg"><IndianRupee className="h-5 w-5 text-blue-600" /></div>
                                <span className="text-sm text-gray-500">Total Transactions</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{summary?.total || 0}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
                                <span className="text-sm text-gray-500">Reconciled</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600">{summary?.reconciled || 0}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-amber-50 rounded-lg"><XCircle className="h-5 w-5 text-amber-600" /></div>
                                <span className="text-sm text-gray-500">Unreconciled</span>
                            </div>
                            <p className="text-2xl font-bold text-amber-600">{summary?.unreconciled || 0}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-violet-50 rounded-lg"><Link2 className="h-5 w-5 text-violet-600" /></div>
                                <span className="text-sm text-gray-500">Match Rate</span>
                            </div>
                            <p className="text-2xl font-bold text-violet-600">{summary?.reconciliationRate || 0}%</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="text" placeholder="Search by description or reference..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                        </div>
                        <div className="flex gap-2">
                            {(['all', 'reconciled', 'unreconciled'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-4 py-2.5 text-sm font-medium rounded-xl transition border ${filter === f ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Debit</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Credit</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={7} className="py-16 text-center text-gray-400 text-sm">
                                            {transactions.length === 0 ? 'No bank transactions. Import a CSV to get started.' : 'No transactions match your search'}
                                        </td></tr>
                                    ) : filtered.map(t => (
                                        <tr key={t.id} className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-sm text-gray-600">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</td>
                                            <td className="px-5 py-3 text-sm text-gray-900 max-w-[250px] truncate">{t.description}</td>
                                            <td className="px-5 py-3 text-sm text-gray-500">{t.reference || '—'}</td>
                                            <td className="px-5 py-3 text-sm font-semibold text-red-600 text-right">
                                                {Number(t.debit) > 0 ? fmt(Number(t.debit)) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-semibold text-emerald-600 text-right">
                                                {Number(t.credit) > 0 ? fmt(Number(t.credit)) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-sm text-gray-900 text-right font-medium">{fmt(Number(t.balance))}</td>
                                            <td className="px-5 py-3 text-center">
                                                {t.reconciled ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200">
                                                        <CheckCircle className="h-3 w-3" /> Matched
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200">
                                                        <XCircle className="h-3 w-3" /> Unmatched
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* CSV Format Help */}
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">CSV Import Format</h3>
                        <p className="text-xs text-gray-500 mb-2">Your CSV should contain columns with these headers (case-insensitive):</p>
                        <div className="flex flex-wrap gap-2">
                            {['date', 'description', 'reference', 'debit', 'credit', 'balance'].map(col => (
                                <span key={col} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600">{col}</span>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Alternative names like narration, withdrawal, deposit, txn_date are also supported.</p>
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
