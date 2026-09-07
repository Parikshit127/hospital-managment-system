'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Shield, Search, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { exportAuditReport } from '@/app/actions/report-export-actions';
import { getUsersList } from '@/app/actions/admin-actions';
import { ENTITY_TYPE_LABELS, AUDIT_ACTION_GROUPS, auditActionLabel } from '@/app/lib/audit-actions';

const IPD_ACTION_TYPES = [
  'admission_created', 'admission_discharged', 'ward_round_recorded',
  'charge_posted', 'discount_applied', 'discount_requested',
  'medication_administered', 'vitals_recorded', 'deposit_collected',
  'bed_transfer', 'diet_plan_assigned', 'nursing_assessment',
  'preauth_created', 'preauth_updated', 'tpa_claim_submitted',
  'tpa_settled', 'handover_saved', 'handover_acknowledged',
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

// A second, structured shape some writers now use: { summary?, changes?: [{field, from, to}] }.
// Render it as a compact "Field: from → to" list when present; otherwise fall back to the
// plain-string / generic-object formatting above so older rows keep displaying exactly as before.
function formatChangeValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderAuditDetails(details: any): React.ReactNode {
  if (!details) return null;
  let parsed: any = null;
  if (typeof details === 'string') {
    try { parsed = JSON.parse(details); } catch { parsed = null; }
  } else if (details && typeof details === 'object') {
    parsed = details;
  }

  const changes = parsed && typeof parsed === 'object' && Array.isArray(parsed.changes) ? parsed.changes : null;
  const summary = parsed && typeof parsed === 'object' && typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.trim()
    : null;

  if ((changes && changes.length > 0) || summary) {
    return (
      <div className="space-y-1">
        {summary && <div className="text-gray-700 font-medium">{summary}</div>}
        {changes && changes.length > 0 && (
          <ul className="space-y-0.5">
            {changes.map((c: any, idx: number) => (
              <li key={idx} className="text-[11px] text-gray-500">
                <span className="font-semibold text-gray-600 capitalize">{String(c?.field ?? '').replace(/_/g, ' ')}</span>
                {': '}
                <span className="font-mono">{formatChangeValue(c?.from)}</span>
                <span className="mx-1">→</span>
                <span className="font-mono">{formatChangeValue(c?.to)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Legacy shape (plain string, or generic JSON without a `changes` array) — unchanged.
  const text = formatDetails(details);
  return text ? <span>{text}</span> : null;
}

// Quick date-range presets. Dates are plain YYYY-MM-DD strings — the API route
// resolves them against the org's timezone (getDayRange/getOrgTimezone), so no
// timezone math is needed here.
function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function quickRange(preset: 'last7' | 'last30' | 'thisMonth' | 'lastMonth'): { from: string; to: string } {
  const now = new Date();
  if (preset === 'last7') {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    return { from: ymd(start), to: ymd(now) };
  }
  if (preset === 'last30') {
    const start = new Date(now); start.setDate(start.getDate() - 29);
    return { from: ymd(start), to: ymd(now) };
  }
  if (preset === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: ymd(start), to: ymd(now) };
  }
  // lastMonth
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: ymd(start), to: ymd(end) };
}

export default function IPDAuditTrailPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [users, setUsers] = useState<{ id: string; username: string; name?: string | null; role?: string | null }[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<'edits' | 'all'>('edits');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);

  // Populate the user filter from the org's staff list — a monthful of activity
  // can span far more users than happen to appear on the current page of results.
  useEffect(() => {
    let cancelled = false;
    getUsersList({ limit: 500 }).then(res => {
      if (cancelled || !res.success) return;
      setUsers((res.data?.users ?? []).map((u: any) => ({ id: u.id, username: u.username, name: u.name, role: u.role })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const buildParams = useCallback((overrides: Record<string, string> = {}) => new URLSearchParams({
    search,
    action: actionFilter,
    user: userFilter,
    from,
    to,
    scope: tab === 'edits' ? 'edits' : '',
    offset: String(page * PAGE_SIZE),
    limit: String(PAGE_SIZE),
    ...overrides,
  }), [search, actionFilter, userFilter, from, to, tab, page]);

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
  useEffect(() => { setPage(0); }, [search, actionFilter, userFilter, from, to, tab]);

  // Exports the whole filtered result set as a titled .xlsx — not just the rows
  // currently on screen, and not a bare CSV that opens as an unlabelled grid.
  async function exportExcel() {
    setExporting(true);
    setError(null);
    try {
      const res = await exportAuditReport({
        search, action: actionFilter, user: userFilter, from, to,
        scope: tab === 'edits' ? 'edits' : '',
      });
      if (!res.success || !res.base64) {
        setError(res.error || 'Export failed');
        return;
      }
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'audit-report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  // Edit/Cancel tab filters by group key ("bill_cancelled"); the Activity tab
  // still filters by raw action name. Both are passed straight through as ?action=.
  const actionOptions = tab === 'edits'
    ? AUDIT_ACTION_GROUPS.map(g => ({ value: g.key, label: g.label }))
    : IPD_ACTION_TYPES.map(a => ({ value: a, label: a.replace(/_/g, ' ') }));

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
            <button onClick={exportExcel} disabled={!logs.length || exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? 'Preparing…' : 'Export Excel'}
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
            <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 max-w-[180px]">
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u.id} value={u.username}>{u.name || u.username}{u.role ? ` (${u.role})` : ''}</option>
              ))}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
              <option value="">All Actions</option>
              {actionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Quick date-range presets — lets a user pull "a month's log" in one click
              instead of hand-picking from/to dates. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase mr-0.5">Quick range:</span>
            {([
              ['last7', 'Last 7 Days'],
              ['last30', 'Last 30 Days'],
              ['thisMonth', 'This Month'],
              ['lastMonth', 'Last Month'],
            ] as const).map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => { const r = quickRange(key); setFrom(r.from); setTo(r.to); }}
                className="px-2.5 py-1 text-[11px] font-bold border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">
                {label}
              </button>
            ))}
            {(from || to) && (
              <button type="button" onClick={() => { setFrom(''); setTo(''); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                Clear dates
              </button>
            )}
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
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase whitespace-nowrap ${
                          // An override bypassed a guard rail — never let it read
                          // like an ordinary cancellation.
                          log.action === 'FORCE_CANCEL_ADMISSION'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {auditActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{log.module ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {log.entity_id ? (
                          <>
                            <span className="font-mono">{log.entity_id}</span>
                            {log.entity_type && (
                              <span className="block text-[10px] font-medium text-gray-400">
                                {ENTITY_TYPE_LABELS[log.entity_type] ?? log.entity_type}
                              </span>
                            )}
                          </>
                        ) : (
                          // Older rows were written before the record id was
                          // stamped; say so rather than showing a bare dash.
                          <span className="text-gray-300 italic">not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-semibold whitespace-nowrap">
                        {log.user_display ? (
                          <>
                            {log.user_display}
                            {log.user_role && (
                              <span className="block text-[10px] font-medium text-gray-400 capitalize">{log.user_role}</span>
                            )}
                          </>
                        ) : (
                          <span className="font-normal text-gray-300 italic">not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-md">
                        {renderAuditDetails(log.details) || <span className="text-gray-300 italic">—</span>}
                      </td>
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
