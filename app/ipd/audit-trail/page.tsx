'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Shield, Search, Filter, Clock, User, FileText } from 'lucide-react';

const IPD_ACTION_TYPES = [
  'admission_created', 'admission_discharged', 'ward_round_recorded',
  'charge_posted', 'discount_applied', 'discount_requested',
  'medication_administered', 'vitals_recorded', 'deposit_collected',
  'bed_transfer', 'diet_plan_assigned', 'nursing_assessment',
  'preauth_created', 'preauth_updated', 'tpa_claim_submitted',
  'tpa_settled', 'handover_saved', 'handover_acknowledged',
];

export default function IPDAuditTrailPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch('/api/ipd/audit-logs?' + new URLSearchParams({
      search,
      action: actionFilter,
      offset: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    }))
      .then(r => r.json())
      .then(d => { if (d.ok) setLogs(d.data ?? []); })
      .finally(() => setLoading(false));
  }, [search, actionFilter, page]);

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-gray-600" />
            <h1 className="text-xl font-black text-gray-900">IPD Audit Trail</h1>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search by admission ID, action, user…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            </div>
            <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
              <option value="">All Actions</option>
              {IPD_ACTION_TYPES.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Log table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Timestamp</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Action</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Entity</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">User</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading…</td></tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">No audit logs found</td></tr>
                )}
                {logs.map((log: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold text-[10px] uppercase">
                        {log.action?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{log.entity_type}/{log.entity_id}</td>
                    <td className="px-4 py-3 text-gray-600">{log.user_id ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-end gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-500">Page {page + 1}</span>
            <button disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Next →
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
