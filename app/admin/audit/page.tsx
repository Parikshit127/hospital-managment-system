'use client';

import React, { useState, useEffect } from 'react';
import {
    Shield, Search, RefreshCw, Loader2, ArrowLeft, ChevronLeft, ChevronRight,
    Download, Filter, AlertTriangle, Clock
} from 'lucide-react';
import Link from 'next/link';
import { getAuditLogs, getAuditStats } from '@/app/actions/audit-actions';

const CRITICAL_ACTIONS = ['PAYMENT_REVERSED', 'DISCOUNT_APPLIED', 'DELETE', 'CANCEL_INVOICE', 'DRUG_INTERACTION_WARNING'];

export default function AuditTrailPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [moduleFilter, setModuleFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const [logRes, statsRes] = await Promise.all([
                getAuditLogs(pagination.page, pagination.limit, {
                    module: moduleFilter || undefined,
                    action: actionFilter || undefined,
                    username: userFilter || undefined,
                }),
                getAuditStats(),
            ]);
            if (logRes.success) {
                setLogs(logRes.data || []);
                if (logRes.pagination) setPagination(logRes.pagination);
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (err) {
            console.error('Audit load error:', err);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [pagination.page, moduleFilter, actionFilter, userFilter]);

    const exportCSV = () => {
        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Entity Type', 'Entity ID', 'Details'];
        const rows = logs.map(l => [
            new Date(l.created_at).toISOString(),
            l.username || '',
            l.role || '',
            l.action || '',
            l.module || '',
            l.entity_type || '',
            l.entity_id || '',
            (l.details || '').replace(/"/g, '""'),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const isCritical = (action: string) => CRITICAL_ACTIONS.some(ca => action?.toUpperCase().includes(ca));

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
            {/* HEADER */}
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/dashboard" className="p-2 hover:bg-white/5 rounded-lg transition-all">
                            <ArrowLeft className="h-4 w-4 text-white/40" />
                        </Link>
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-amber-400 to-orange-600 p-2 rounded-xl shadow-lg shadow-amber-500/20">
                                <Shield className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight">Audit Trail</h1>
                            <p className="text-[10px] text-white/30 font-medium">System activity log &bull; Admin only</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white/60 hover:bg-white/10 transition-all">
                            <Download className="h-3 w-3" /> Export CSV
                        </button>
                        <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white/60 hover:bg-white/10 transition-all">
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto p-6 space-y-5">
                {/* STATS */}
                {stats && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#131A2E] border border-white/5 rounded-xl p-4">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-wider">Total Events</p>
                            <p className="text-2xl font-black text-white mt-1">{stats.totalAll?.toLocaleString()}</p>
                        </div>
                        <div className="bg-[#131A2E] border border-white/5 rounded-xl p-4">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-wider">Today</p>
                            <p className="text-2xl font-black text-amber-400 mt-1">{stats.totalToday?.toLocaleString()}</p>
                        </div>
                        <div className="bg-[#131A2E] border border-white/5 rounded-xl p-4">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-wider">Logins Today</p>
                            <p className="text-2xl font-black text-emerald-400 mt-1">{stats.loginCount?.toLocaleString()}</p>
                        </div>
                    </div>
                )}

                {/* FILTERS */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-white/30" />
                        <span className="text-[10px] font-black text-white/30 uppercase">Filters:</span>
                    </div>
                    <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none">
                        <option value="" className="bg-[#1a1f3a] text-white">All Modules</option>
                        {['auth', 'OPD', 'IPD', 'Finance', 'Lab', 'Pharmacy', 'discharge', 'reception'].map(m =>
                            <option key={m} value={m} className="bg-[#1a1f3a] text-white">{m}</option>
                        )}
                    </select>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                        <input type="text" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                            placeholder="Filter by action..."
                            className="pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none w-44" />
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                        <input type="text" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                            placeholder="Filter by username..."
                            className="pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none w-44" />
                    </div>
                </div>

                {/* TABLE */}
                <div className="bg-[#131A2E] border border-white/5 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    {['Timestamp', 'User', 'Role', 'Action', 'Module', 'Entity', 'Details'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-white/30 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading && logs.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-400 mx-auto" /></td></tr>
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16 text-white/20 text-sm">No audit logs found</td></tr>
                                ) : logs.map((log: any, i: number) => (
                                    <tr key={log.id || i} className={`border-b border-white/5 hover:bg-white/[0.02] ${isCritical(log.action) ? 'bg-rose-500/5' : ''}`}>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="h-3 w-3 text-white/20" />
                                                <span className="text-[11px] text-white/50 font-mono">
                                                    {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-bold text-white/70">{log.username || '-'}</td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/40">{log.role || '-'}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                {isCritical(log.action) && <AlertTriangle className="h-3 w-3 text-rose-400" />}
                                                <span className={`text-xs font-bold ${isCritical(log.action) ? 'text-rose-400' : 'text-white/60'}`}>
                                                    {log.action}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-white/40">{log.module}</td>
                                        <td className="px-4 py-2.5 text-[11px] text-white/30 font-mono">
                                            {log.entity_type && `${log.entity_type}: ${log.entity_id || '-'}`}
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] text-white/25 max-w-[200px] truncate" title={log.details || ''}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                        <span className="text-[10px] text-white/20 font-bold">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                                disabled={pagination.page <= 1}
                                className="p-1.5 hover:bg-white/5 rounded-lg disabled:opacity-30">
                                <ChevronLeft className="h-4 w-4 text-white/40" />
                            </button>
                            <span className="text-xs font-bold text-white/40">Page {pagination.page} of {pagination.totalPages}</span>
                            <button onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="p-1.5 hover:bg-white/5 rounded-lg disabled:opacity-30">
                                <ChevronRight className="h-4 w-4 text-white/40" />
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">Avani Hospital OS &bull; Audit Trail &bull; v2.0</p>
                    <p className="text-[10px] font-medium text-white/15">NABH compliant &bull; Immutable audit log</p>
                </div>
            </footer>
        </div>
    );
}
