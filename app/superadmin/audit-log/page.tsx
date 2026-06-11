'use client';

import { useState, useEffect } from 'react';
import { getPlatformAuditLog, listOrganizations } from '@/app/actions/superadmin-actions';
import { Clock, ChevronLeft, ChevronRight, Loader2, Filter, Building2 } from 'lucide-react';

export default function PlatformAuditLogPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [orgFilter, setOrgFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [usernameFilter, setUsernameFilter] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    useEffect(() => {
        listOrganizations().then(res => {
            if (res.success) setOrgs(res.data || []);
        });
    }, []);

    async function loadLogs() {
        setLoading(true);
        const res = await getPlatformAuditLog({
            page,
            orgId: orgFilter || undefined,
            action: actionFilter || undefined,
            username: usernameFilter || undefined,
            from: from || undefined,
            to: to || undefined,
        });
        if (res.success) {
            setLogs(res.data?.logs || []);
            setTotal(res.data?.total || 0);
        }
        setLoading(false);
    }

    useEffect(() => { loadLogs(); }, [page, orgFilter, actionFilter, usernameFilter, from, to]);

    const totalPages = Math.ceil(total / 50);

    const actionColor = (action: string) => {
        if (action.includes('CREATE')) return 'text-emerald-400 bg-emerald-500/10';
        if (action.includes('DELETE') || action.includes('SUSPEND')) return 'text-red-400 bg-red-500/10';
        if (action.includes('UPDATE') || action.includes('ACTIVATE')) return 'text-blue-400 bg-blue-500/10';
        return 'text-gray-400 bg-white/5';
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-white">Platform Audit Log</h1>
                <p className="text-sm text-gray-400 mt-1">Cross-tenant activity monitoring</p>
            </header>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <select value={orgFilter} onChange={e => { setOrgFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">All Organizations</option>
                    {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <div className="relative flex-1 min-w-[180px]">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input type="text" placeholder="Filter action..." value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                        className="w-full pl-10 pr-4 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                <input type="text" placeholder="Username..." value={usernameFilter} onChange={e => { setUsernameFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500 w-40" />
                <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
                    className="px-3 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-violet-500" />
                <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
                    className="px-3 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-violet-500" />
                <span className="text-xs text-gray-500">{total} entries</span>
            </div>

            {/* Log Table */}
            <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <Clock className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                        <p className="font-medium">No audit log entries found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white/5 border-b border-white/5">
                                <tr className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                    <th className="px-4 py-3">Timestamp</th>
                                    <th className="px-4 py-3">Organization</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3">Module</th>
                                    <th className="px-4 py-3">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition">
                                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {log.organization ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Building2 className="h-3 w-3 text-gray-600" />
                                                    <span className="text-xs text-gray-300">{log.organization.name}</span>
                                                    <span className="text-[10px] text-gray-600">{log.organization.code}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-600">Platform</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${actionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-300">{log.username || 'System'}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500 capitalize">{log.module}</td>
                                        <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{log.details || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                    <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
