'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Shield, Search, Download, AlertTriangle } from 'lucide-react';

const IPD_ACTION_TYPES = [
  'admission_created', 'admission_discharged', 'ward_round_recorded',
  'charge_posted', 'discount_applied', 'discount_requested',
  'medication_administered', 'vitals_recorded', 'deposit_collected',
  'bed_transfer', 'diet_plan_assigned', 'nursing_assessment',
  'preauth_created', 'preauth_updated', 'tpa_claim_submitted',
  'tpa_settled', 'handover_saved', 'handover_acknowledged',
];

// Kept in sync with EDIT_CANCEL_ACTIONS in the audit-logs route — shown as the
// action dropdown when the Edit / Cancel tab is active.
const EDIT_CANCEL_ACTIONS = [
  'UPDATE_PAYMENT', 'REVERSE_PAYMENT', 'VOID_PAYMENT', 'PROCESS_REFUND',
  'CANCEL_DEPOSIT', 'UPDATE_DEPOSIT', 'CANCEL_INVOICE', 'EDIT_INVOICE',
  'UPDATE_INVOICE', 'DELETE_INVOICE', 'CANCEL_ADMISSION', 'CANCEL_BILL',
  'WRITE_OFF', 'DISCOUNT_APPLIED', 'CREDIT_NOTE_CREATED', 'STOCK_ADJUSTED',
];

const PAGE_SIZE = 50;

// Audit details are stored as a JSON string. Render them as readable key: value
// pairs — the raw JSON was unreadable in a table cell.
function formatDetails(details: any): string {
  if (!details) return '';
  let obj = details;
  if (typeof details === 'string') {
    try { obj = JSON.parse(details); } catch { return details; }
  }
  if (!obj || typeof obj !== 'object') return String(obj);
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

export default function IPDAuditTrailPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<'edits' | 'all'>('edits');
  const [page, setPage] = useState(0);

  const buildParams = useCallback((overrides: Record<string, string> = {}) => new URLSearchParams({
    search,
    action: actionFilter,
    from,
    to,
    scope: tab === 'edits' ? 'edits' : '',
    offset: String(page * PAGE_SIZE),
    limit: String(PAGE_SIZE),
    ...overrides,
  }), [search, actionFilter, from, to, tab, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/ipd/audit-logs?' + buildParams())
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.ok) { setLogs(d.data ?? []); setTotal(d.total ?? 0); }
        else setError(d.error || 'Failed to load audit logs');
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildParams]);

  // Reset to the first page whenever the filters change, otherwise a narrow
  // filter on page 4 shows an empty table.
  useEffect(() => { setPage(0); }, [search, actionFilter, from, to, tab]);

  function exportCsv() {
    const head = ['Timestamp', 'Action', 'Module', 'Entity', 'User', 'Role', 'Details'];
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString('en-IN'),
      l.action ?? '',
      l.module ?? '',
      `${l.entity_type ?? ''}/${l.entity_id ?? ''}`,
      l.user_display ?? '',
      l.user_role ?? '',
      formatDetails(l.details),
    ]);
    const csv = [head, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `edit-cancel-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const actionOptions = tab === 'edits' ? EDIT_CANCEL_ACTIONS : IPD_ACTION_TYPES;

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-gray-600" />
              <div>
                <h1 className="text-xl font-black text-gray-900">
                  {tab === 'edits' ? 'Edit / Cancel Audit Report' : 'Activity Audit Trail'}
                </h1>
                <p className="text-xs text-gray-500">
                  {tab === 'edits'
                    ? 'Every edited, cancelled, reversed or refunded transaction — who did it and when.'
                    : 'All recorded system activity.'}
                </p>
              </div>
            </div>
            <button onClick={exportCsv} disabled={!logs.length}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>

          {/* Scope tabs */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            {([['edits', 'Edited / Cancelled'], ['all', 'All Activity']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k as 'edits' | 'all')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                  tab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by receipt / bill no, action, user or reason…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            </div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
              <option value="">All Actions</option>
              {actionOptions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-medium">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {/* Log table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold text-gray-500">
              {loading ? 'Loading…' : `${total} record${total === 1 ? '' : 's'}`}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Timestamp</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Action</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Module</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Entity</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">User</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-[10px]">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>
                  )}
                  {!loading && logs.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">No audit records found</td></tr>
                  )}
                  {!loading && logs.map((log: any, i: number) => (
                    <tr key={log.id ?? i} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-500 font-mono whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold text-[10px] uppercase whitespace-nowrap">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{log.module ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono whitespace-nowrap">
                        {log.entity_id ? `${log.entity_type ?? ''}/${log.entity_id}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-semibold whitespace-nowrap">
                        {log.user_display ?? '—'}
                        {log.user_role && (
                          <span className="block text-[10px] font-medium text-gray-400 capitalize">{log.user_role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-md">{formatDetails(log.details) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex justify-end items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 bg-white">
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-500">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 bg-white">
              Next →
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
