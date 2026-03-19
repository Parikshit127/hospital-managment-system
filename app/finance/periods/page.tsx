'use client';

import { useState, useEffect } from 'react';
import {
    getFinancialPeriods, createFinancialPeriod,
    closeFinancialPeriod, lockFinancialPeriod, getPeriodPreview,
} from '@/app/actions/period-actions';
import {
    Loader2, Plus, Calendar, Lock, CheckCircle, Eye,
    IndianRupee, X, AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function PeriodsPage() {
    const [periods, setPeriods] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({
        period_name: '', period_type: 'Monthly', start_date: '', end_date: '',
    });
    const [createLoading, setCreateLoading] = useState(false);

    // Preview modal
    const [previewModal, setPreviewModal] = useState<any>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getFinancialPeriods();
        if (res.success) setPeriods(res.data || []);
        setLoading(false);
    }

    async function handleCreate() {
        if (!createForm.period_name || !createForm.start_date || !createForm.end_date) return;
        setCreateLoading(true);
        const res = await createFinancialPeriod(createForm);
        if (res.success) {
            setShowCreate(false);
            setCreateForm({ period_name: '', period_type: 'Monthly', start_date: '', end_date: '' });
            loadData();
        } else {
            alert(res.error);
        }
        setCreateLoading(false);
    }

    async function handleClose(id: number) {
        if (!confirm('Close this period? This will calculate and snapshot the P&L.')) return;
        const res = await closeFinancialPeriod(id);
        if (res.success) loadData();
        else alert(res.error);
    }

    async function handleLock(id: number) {
        if (!confirm('Lock this period? This cannot be undone.')) return;
        const res = await lockFinancialPeriod(id);
        if (res.success) loadData();
        else alert(res.error);
    }

    async function handlePreview(period: any) {
        setPreviewModal(period);
        setPreviewLoading(true);
        const res = await getPeriodPreview(period.id);
        if (res.success) setPreviewData(res.data);
        setPreviewLoading(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Open: 'text-emerald-600 bg-emerald-50 border-emerald-200',
            Closed: 'text-blue-600 bg-blue-50 border-blue-200',
            Locked: 'text-gray-600 bg-gray-100 border-gray-300',
        };
        return map[status] || 'text-gray-600 bg-gray-50 border-gray-200';
    };

    const openCount = periods.filter(p => p.status === 'Open').length;
    const closedCount = periods.filter(p => p.status === 'Closed').length;
    const lockedCount = periods.filter(p => p.status === 'Locked').length;

    return (
        <AppShell pageTitle="Fiscal Periods" pageIcon={<Calendar className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Fiscal Periods</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage financial periods for books closing</p>
                </div>
                <button onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> New Period
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-50 rounded-lg"><Calendar className="h-5 w-5 text-emerald-600" /></div>
                                <span className="text-sm text-gray-500">Open Periods</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600">{openCount}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-50 rounded-lg"><CheckCircle className="h-5 w-5 text-blue-600" /></div>
                                <span className="text-sm text-gray-500">Closed Periods</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-600">{closedCount}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-gray-100 rounded-lg"><Lock className="h-5 w-5 text-gray-600" /></div>
                                <span className="text-sm text-gray-500">Locked Periods</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-600">{lockedCount}</p>
                        </div>
                    </div>

                    {/* Periods Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period Name</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Start</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">End</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Expenses</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Net Result</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Closed By</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {periods.length === 0 ? (
                                        <tr><td colSpan={10} className="py-16 text-center text-gray-400 text-sm">No fiscal periods created yet</td></tr>
                                    ) : periods.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.period_name}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{p.period_type}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{new Date(p.start_date).toLocaleDateString('en-IN')}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{new Date(p.end_date).toLocaleDateString('en-IN')}</td>
                                            <td className="px-5 py-3 text-sm font-semibold text-emerald-600 text-right">
                                                {p.total_revenue != null ? fmt(Number(p.total_revenue)) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-semibold text-red-600 text-right">
                                                {p.total_expenses != null ? fmt(Number(p.total_expenses)) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-bold text-right">
                                                {p.net_result != null ? (
                                                    <span className={Number(p.net_result) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                                        {fmt(Number(p.net_result))}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(p.status)}`}>
                                                    {p.status === 'Locked' && <Lock className="h-3 w-3 mr-1" />}
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{p.closed_by || '—'}</td>
                                            <td className="px-5 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {p.status === 'Open' && (
                                                        <>
                                                            <button onClick={() => handlePreview(p)}
                                                                className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                                                                Preview
                                                            </button>
                                                            <button onClick={() => handleClose(p.id)}
                                                                className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                                                Close
                                                            </button>
                                                        </>
                                                    )}
                                                    {p.status === 'Closed' && (
                                                        <button onClick={() => handleLock(p.id)}
                                                            className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition flex items-center gap-1">
                                                            <Lock className="h-3 w-3" /> Lock
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Period Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Create Financial Period</h3>
                            <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Period Name *</label>
                                <input type="text" value={createForm.period_name} onChange={e => setCreateForm({ ...createForm, period_name: e.target.value })}
                                    placeholder="e.g. March 2026" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Period Type</label>
                                <select value={createForm.period_type} onChange={e => setCreateForm({ ...createForm, period_type: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                    <option>Monthly</option>
                                    <option>Quarterly</option>
                                    <option>Yearly</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                                    <input type="date" value={createForm.start_date} onChange={e => setCreateForm({ ...createForm, start_date: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                                    <input type="date" value={createForm.end_date} onChange={e => setCreateForm({ ...createForm, end_date: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleCreate} disabled={createLoading || !createForm.period_name || !createForm.start_date || !createForm.end_date}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2">
                                {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Create Period
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* P&L Preview Modal */}
            {previewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">P&L Preview: {previewModal.period_name}</h3>
                            <button onClick={() => { setPreviewModal(null); setPreviewData(null); }} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        {previewLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                            </div>
                        ) : previewData ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                                    <div className="flex items-center gap-2">
                                        <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                                        <span className="text-sm font-medium text-emerald-800">Total Revenue</span>
                                    </div>
                                    <span className="text-sm font-bold text-emerald-700">{fmt(previewData.totalRevenue)} ({previewData.paymentCount} payments)</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-200">
                                    <div className="flex items-center gap-2">
                                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                                        <span className="text-sm font-medium text-red-800">Total Expenses</span>
                                    </div>
                                    <span className="text-sm font-bold text-red-700">{fmt(previewData.totalExpenses)} ({previewData.expenseCount} expenses)</span>
                                </div>
                                <div className={`flex items-center justify-between p-3 rounded-xl border ${previewData.netResult >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <IndianRupee className={`h-4 w-4 ${previewData.netResult >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                                        <span className={`text-sm font-medium ${previewData.netResult >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>Net Result</span>
                                    </div>
                                    <span className={`text-sm font-bold ${previewData.netResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(previewData.netResult)}</span>
                                </div>
                                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
                                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                    <p className="text-xs text-amber-700">Closing will snapshot these values. Ensure all transactions are recorded before closing.</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-8">Failed to load preview</p>
                        )}
                        <div className="flex justify-end mt-5">
                            <button onClick={() => { setPreviewModal(null); setPreviewData(null); }}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
