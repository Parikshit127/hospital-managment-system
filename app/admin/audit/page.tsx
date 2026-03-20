'use client';

import { useState, useEffect } from 'react';
import {
    Shield, Search, Loader2, ChevronLeft, ChevronRight,
    Download, Filter, AlertTriangle, Clock
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
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
        <AdminPage
            pageTitle="Audit Trail"
            pageIcon={<Shield className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
            headerActions={
                <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition-all">
                    <Download className="h-3 w-3" /> Export CSV
                </button>
            }
        >
            <div className="space-y-5">
                {/* STATS */}
                {stats && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total Events</p>
                            <p className="text-2xl font-black text-gray-900 mt-1">{stats.totalAll?.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Today</p>
                            <p className="text-2xl font-black text-amber-400 mt-1">{stats.totalToday?.toLocaleString()}</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Logins Today</p>
                            <p className="text-2xl font-black text-emerald-400 mt-1">{stats.loginCount?.toLocaleString()}</p>
                        </div>
                    </div>
                )}

                {/* FILTERS */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">Filters:</span>
                    </div>
                    <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                        className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none">
                        <option value="" className="bg-white text-gray-900">All Modules</option>
                        {['auth', 'OPD', 'IPD', 'Finance', 'Lab', 'Pharmacy', 'discharge', 'reception'].map(m =>
                            <option key={m} value={m} className="bg-white text-gray-900">{m}</option>
                        )}
                    </select>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300" />
                        <input type="text" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                            placeholder="Filter by action..."
                            className="pl-7 pr-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none w-44" />
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300" />
                        <input type="text" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                            placeholder="Filter by username..."
                            className="pl-7 pr-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none w-44" />
                    </div>
                </div>

                {/* TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Timestamp', 'User', 'Role', 'Action', 'Module', 'Entity', 'Details'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading && logs.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-400 mx-auto" /></td></tr>
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16 text-gray-300 text-sm">No audit logs found</td></tr>
                                ) : logs.map((log: any, i: number) => (
                                    <tr key={log.id || i} className={`border-b border-gray-200 hover:bg-gray-50 ${isCritical(log.action) ? 'bg-rose-500/5' : ''}`}>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="h-3 w-3 text-gray-300" />
                                                <span className="text-[11px] text-gray-500 font-mono">
                                                    {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-bold text-gray-700">{log.username || '-'}</td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{log.role || '-'}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                {isCritical(log.action) && <AlertTriangle className="h-3 w-3 text-rose-400" />}
                                                <span className={`text-xs font-bold ${isCritical(log.action) ? 'text-rose-400' : 'text-gray-500'}`}>
                                                    {log.action}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-500">{log.module}</td>
                                        <td className="px-4 py-2.5 text-[11px] text-gray-400 font-mono">
                                            {log.entity_type && `${log.entity_type}: ${log.entity_id || '-'}`}
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] text-gray-400 max-w-[200px] truncate" title={log.details || ''}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                        <span className="text-[10px] text-gray-300 font-bold">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                                disabled={pagination.page <= 1}
                                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                                <ChevronLeft className="h-4 w-4 text-gray-500" />
                            </button>
                            <span className="text-xs font-bold text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
                            <button onClick={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminPage>
    );
}
