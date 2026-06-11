'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
    Plug, PlugZap, CheckCircle2, XCircle, Loader2, RefreshCw, Save, FlaskConical,
    ListChecks, BookOpen, ScrollText, AlertTriangle, Clock, Upload,
} from 'lucide-react';
import {
    getTallyConfig, saveTallyConfig, testTallyConnection,
    getTallyDashboard, getTallyVoucherList, getTallyLedgerList, getTallySyncLogs,
    syncLedger, syncAllLedgers, syncVoucher, postSelectedVouchers, postAllPendingVouchers, syncAllVouchers,
    validateTallyVoucherTypes, getTallyReconciliation,
} from '@/app/actions/tally-actions';
import { repostInvoicesGL } from '@/app/actions/finance-actions';

const fmtMoney = (n: number) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDateTime = (d: any) => (d ? new Date(d).toLocaleString('en-IN') : '—');

function SyncBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        synced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        failed: 'bg-rose-100 text-rose-700 border-rose-200',
        pending: 'bg-amber-100 text-amber-700 border-amber-200',
        success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {status}
        </span>
    );
}

export function TallyIntegration() {
    const [config, setConfig] = useState<any>(null);
    const [dash, setDash] = useState<any>(null);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [recon, setRecon] = useState<any>(null);
    const [tab, setTab] = useState<'vouchers' | 'ledgers' | 'logs'>('vouchers');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null); // global action key in-flight
    const [rowBusy, setRowBusy] = useState<string | null>(null);

    // editable config form
    const [form, setForm] = useState({ tally_enabled: false, tally_url: '', tally_company: '', tally_username: '', tally_password: '', tally_auto_sync: false });

    const loadAll = useCallback(async () => {
        const [c, d, v, l, lg, rc] = await Promise.all([
            getTallyConfig(), getTallyDashboard(), getTallyVoucherList({ limit: 200 }), getTallyLedgerList({ limit: 500 }), getTallySyncLogs({ limit: 50 }), getTallyReconciliation(),
        ]);
        if (rc.success) setRecon(rc.data);
        if (c.success && c.data) {
            setConfig(c.data);
            setForm({
                tally_enabled: !!c.data.tally_enabled,
                tally_url: c.data.tally_url || '',
                tally_company: c.data.tally_company || '',
                tally_username: c.data.tally_username || '',
                tally_password: '',
                tally_auto_sync: !!c.data.tally_auto_sync,
            });
        }
        if (d.success) setDash(d.data);
        if (v.success) setVouchers(v.data || []);
        if (l.success) setLedgers(l.data || []);
        if (lg.success) setLogs(lg.data || []);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    async function run(key: string, fn: () => Promise<any>, successMsg?: (r: any) => string) {
        setBusy(key);
        try {
            const r = await fn();
            if (r?.success) toast.success(successMsg ? successMsg(r) : (r.message || 'Done.'));
            else toast.error(r?.error || r?.message || 'Action failed.', { duration: 6000 });
            await loadAll();
            return r;
        } catch (e: any) {
            toast.error(e?.message || 'Action failed.');
        } finally {
            setBusy(null);
        }
    }

    async function handleSave() {
        await run('save', () => saveTallyConfig(form), () => 'Configuration saved.');
    }
    async function handleTest() {
        setBusy('test');
        try {
            const r = await testTallyConnection();
            if (r?.success) toast.success(r.message || 'Connection successful.');
            else toast.error(r?.error || 'Connection failed.', { duration: 7000 });
            await loadAll();
        } finally { setBusy(null); }
    }
    async function handleValidate() {
        setBusy('validate');
        try {
            const r = await validateTallyVoucherTypes();
            if (r?.success && r.data) {
                (r.data.missing || []).length ? toast.error(r.data.message, { duration: 8000 }) : toast.success(r.data.message);
            } else toast.error(r?.error || 'Validation failed.', { duration: 7000 });
        } finally { setBusy(null); }
    }
    async function handleRepost() {
        setBusy('repost');
        try {
            const dry = await repostInvoicesGL({ dryRun: true });
            if (!dry?.success) { toast.error(dry?.error || 'Re-post check failed.'); return; }
            const ok = window.confirm(
                `Re-post ${dry.eligible} invoice(s) to the GL with the corrected structure?\n\n` +
                `Skipped: ${dry.skippedLocked} in locked periods, ${dry.skippedSynced} already synced to Tally, ${dry.skippedNoEntry} with no GL entry.\n\n` +
                `Each is reversed + re-posted (audit trail preserved). Run this BEFORE syncing those vouchers to Tally.`,
            );
            if (!ok) return;
            const r = await repostInvoicesGL({ dryRun: false });
            if (r?.success) toast.success(`Re-posted ${r.reposted} invoice(s)${r.failed ? `, ${r.failed} failed` : ''}.`);
            else toast.error(r?.error || `Re-posted ${r?.reposted || 0}, ${r?.failed || 0} failed.`, { duration: 8000 });
            await loadAll();
        } finally { setBusy(null); }
    }

    const allSelected = vouchers.length > 0 && vouchers.every((v) => selected.has(v.id));
    function toggleAll() {
        setSelected(allSelected ? new Set() : new Set(vouchers.map((v) => v.id)));
    }
    function toggleOne(id: string) {
        setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    const connected = !!dash?.connected;

    return (
        <div className="space-y-6">
            {/* Connection status banner */}
            <div className={`flex items-center gap-3 rounded-2xl border p-4 ${connected ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                {connected ? <PlugZap className="h-5 w-5 text-emerald-600" /> : <Plug className="h-5 w-5 text-amber-600" />}
                <div className="flex-1">
                    <p className={`text-sm font-bold ${connected ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {connected ? 'Tally Connected' : 'Tally Not Connected'}
                    </p>
                    <p className="text-xs text-gray-500">
                        {config?.tally_url ? `${config.tally_url}${config.tally_company ? ` · ${config.tally_company}` : ''}` : 'Configure the Tally server URL below.'} · Last sync: {fmtDateTime(dash?.last_sync)}
                    </p>
                </div>
                <button onClick={loadAll} className="p-2 rounded-lg hover:bg-white/60 text-gray-500" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
            </div>

            {/* Dashboard cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Status" value={connected ? 'Connected' : 'Disconnected'} tone={connected ? 'emerald' : 'rose'} icon={connected ? CheckCircle2 : XCircle} />
                <StatCard label="Ledgers Synced" value={`${dash?.ledgers_synced ?? 0}/${dash?.ledgers_total ?? 0}`} tone="blue" icon={BookOpen} />
                <StatCard label="Vouchers Synced" value={`${dash?.vouchers_synced ?? 0}/${dash?.vouchers_total ?? 0}`} tone="indigo" icon={ListChecks} />
                <StatCard label="Failed Syncs" value={dash?.failed ?? 0} tone="rose" icon={AlertTriangle} />
                <StatCard label="Pending Syncs" value={dash?.pending ?? 0} tone="amber" icon={Clock} />
                <StatCard label="Last Sync" value={dash?.last_sync ? new Date(dash.last_sync).toLocaleDateString('en-GB') : '—'} tone="gray" icon={Clock} />
            </div>

            {/* Reconciliation strip */}
            {recon && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                    <span className="font-bold text-gray-700">Reconciliation</span>
                    <span className="text-gray-500">HIS posted vouchers: <b className="text-gray-800">{recon.his_count}</b> ({fmtMoney(recon.his_total)})</span>
                    <span className="text-emerald-700">Synced: <b>{recon.synced}</b></span>
                    <span className="text-rose-700">Failed: <b>{recon.failed}</b></span>
                    <span className="text-amber-700">Pending: <b>{recon.pending}</b></span>
                    <span className={`ml-auto font-bold ${recon.in_sync ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {recon.in_sync ? '✓ In sync with Tally' : '⚠ Not fully synced'}
                    </span>
                </div>
            )}

            {/* Configuration */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Plug className="h-4 w-4 text-indigo-500" /> Tally Connection Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tally Server URL" placeholder="http://localhost:9000">
                        <input value={form.tally_url} onChange={(e) => setForm({ ...form, tally_url: e.target.value })} placeholder="http://localhost:9000" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10" />
                    </Field>
                    <Field label="Tally Company Name">
                        <input value={form.tally_company} onChange={(e) => setForm({ ...form, tally_company: e.target.value })} placeholder="e.g. Axten Hospitals Pvt Ltd" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10" />
                    </Field>
                    <Field label="Username (optional)">
                        <input value={form.tally_username} onChange={(e) => setForm({ ...form, tally_username: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10" />
                    </Field>
                    <Field label="Password (optional)">
                        <input type="password" value={form.tally_password} onChange={(e) => setForm({ ...form, tally_password: e.target.value })} placeholder={config?.has_password ? '•••••••• (saved — leave blank to keep)' : ''} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10" />
                    </Field>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={form.tally_enabled} onChange={(e) => setForm({ ...form, tally_enabled: e.target.checked })} className="rounded border-gray-300 text-emerald-600" />
                        Tally Enabled
                    </label>
                    <label
                        className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed"
                        title="Auto-sync is not active. Tally updates only when you click Sync / Post."
                    >
                        <input
                            type="checkbox"
                            checked={form.tally_auto_sync}
                            disabled
                            readOnly
                            className="rounded border-gray-300 text-emerald-600 cursor-not-allowed"
                        />
                        Auto Sync (not active — sync is manual)
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={handleTest} disabled={!!busy} className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
                            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Test Connection
                        </button>
                        <button onClick={handleValidate} disabled={!!busy} className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2" title="Check that Sales/Receipt/Payment/Journal/Contra exist in the Tally company">
                            {busy === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />} Validate Types
                        </button>
                        <button onClick={handleSave} disabled={!!busy} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Configuration
                        </button>
                    </div>
                </div>
            </div>

            {/* Sync action bar */}
            <div className="flex flex-wrap items-center gap-2">
                <ActionBtn busy={busy === 'syncLedgers'} onClick={() => run('syncLedgers', syncAllLedgers)} icon={BookOpen}>Sync Ledgers</ActionBtn>
                <ActionBtn busy={busy === 'syncVouchers'} onClick={() => run('syncVouchers', syncAllVouchers)} icon={ListChecks}>Sync Vouchers</ActionBtn>
                <ActionBtn busy={busy === 'syncAll'} onClick={() => run('syncAll', async () => { const a = await syncAllLedgers(); const b = await syncAllVouchers(); return { success: a.success && b.success, message: `Ledgers: ${a.message ?? ''} | Vouchers: ${b.message ?? ''}` }; })} icon={Upload}>Sync All</ActionBtn>
                <button onClick={() => setTab('logs')} className="px-3 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"><ScrollText className="h-4 w-4" /> View Logs</button>
                <button onClick={handleRepost} disabled={!!busy} className="ml-auto px-3 py-2 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex items-center gap-2" title="Re-post existing invoices to the GL with corrected accounting (opt-in, dry-run first)">
                    {busy === 'repost' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-post GL
                </button>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-100">
                    {(['vouchers', 'ledgers', 'logs'] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-bold capitalize ${tab === t ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
                    ))}
                </div>

                {tab === 'vouchers' && (
                    <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <button disabled={!!busy || selected.size === 0} onClick={() => run('postSel', () => postSelectedVouchers([...selected]))} className="px-2.5 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded disabled:opacity-50">Post Selected ({selected.size})</button>
                            <button disabled={!!busy} onClick={() => run('postPending', postAllPendingVouchers)} className="px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded disabled:opacity-50">Post All Pending</button>
                        </div>
                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 sticky top-0">
                                    <tr>
                                        <th className="px-2 py-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                                        <th className="px-3 py-2 text-left">Voucher #</th>
                                        <th className="px-3 py-2 text-left">Type</th>
                                        <th className="px-3 py-2 text-left">Reference</th>
                                        <th className="px-3 py-2 text-right">Amount</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        <th className="px-3 py-2 text-left">Sync</th>
                                        <th className="px-3 py-2 text-left">Date</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vouchers.length === 0 ? (
                                        <tr><td colSpan={9} className="text-center py-8 text-gray-400">No posted vouchers found.</td></tr>
                                    ) : vouchers.map((v) => (
                                        <tr key={v.id} className="border-t border-gray-100 hover:bg-indigo-50/30">
                                            <td className="px-2 py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} /></td>
                                            <td className="px-3 py-2 font-mono font-bold text-gray-700">{v.voucher_number}</td>
                                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">{v.voucher_type}</span></td>
                                            <td className="px-3 py-2 text-gray-600 max-w-[220px] truncate" title={v.reference}>{v.reference}</td>
                                            <td className="px-3 py-2 text-right font-bold">{fmtMoney(v.amount)}</td>
                                            <td className="px-3 py-2 text-gray-500">{v.status}</td>
                                            <td className="px-3 py-2"><SyncBadge status={v.sync_status} /></td>
                                            <td className="px-3 py-2 text-gray-500">{v.created_at ? new Date(v.created_at).toLocaleDateString('en-GB') : '—'}</td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    disabled={!!busy || rowBusy === v.id}
                                                    onClick={async () => { setRowBusy(v.id); const r = await syncVoucher(v.id); r?.success ? toast.success(r.message || 'Posted.') : toast.error(r?.error || 'Failed.', { duration: 6000 }); await loadAll(); setRowBusy(null); }}
                                                    className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold hover:bg-indigo-100 disabled:opacity-50"
                                                >
                                                    {rowBusy === v.id ? '…' : v.sync_status === 'failed' ? 'Retry' : 'Post'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === 'ledgers' && (
                    <div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <button disabled={!!busy} onClick={() => run('syncLedgers2', syncAllLedgers)} className="px-2.5 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded disabled:opacity-50">Sync All Ledgers</button>
                        </div>
                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Code</th>
                                        <th className="px-3 py-2 text-left">HIS Ledger</th>
                                        <th className="px-3 py-2 text-left">Tally Ledger</th>
                                        <th className="px-3 py-2 text-left">Group</th>
                                        <th className="px-3 py-2 text-left">Sync</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ledgers.map((l) => (
                                        <tr key={l.id} className="border-t border-gray-100 hover:bg-indigo-50/30">
                                            <td className="px-3 py-2 font-mono text-gray-500">{l.account_code}</td>
                                            <td className="px-3 py-2 font-bold text-gray-700">{l.his_ledger_name}</td>
                                            <td className="px-3 py-2 text-gray-600">{l.tally_ledger_name}</td>
                                            <td className="px-3 py-2 text-gray-500">{l.tally_group}</td>
                                            <td className="px-3 py-2"><SyncBadge status={l.sync_status} /></td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    disabled={!!busy || rowBusy === l.id}
                                                    onClick={async () => { setRowBusy(l.id); const r = await syncLedger(l.id); r?.success ? toast.success(r.message || 'Synced.') : toast.error(r?.error || 'Failed.', { duration: 6000 }); await loadAll(); setRowBusy(null); }}
                                                    className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold hover:bg-indigo-100 disabled:opacity-50"
                                                >
                                                    {rowBusy === l.id ? '…' : l.sync_status === 'failed' ? 'Retry' : 'Sync'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === 'logs' && (
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left">Time</th>
                                    <th className="px-3 py-2 text-left">Entity</th>
                                    <th className="px-3 py-2 text-left">Action</th>
                                    <th className="px-3 py-2 text-left">Status</th>
                                    <th className="px-3 py-2 text-right">Records</th>
                                    <th className="px-3 py-2 text-left">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No sync logs yet.</td></tr>
                                ) : logs.map((lg) => (
                                    <tr key={lg.id} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDateTime(lg.created_at)}</td>
                                        <td className="px-3 py-2 text-gray-600">{lg.entity_type}</td>
                                        <td className="px-3 py-2 text-gray-600">{lg.action}</td>
                                        <td className="px-3 py-2"><SyncBadge status={lg.status} /></td>
                                        <td className="px-3 py-2 text-right text-gray-600">{lg.records_count}</td>
                                        <td className="px-3 py-2 text-rose-600 max-w-[320px] truncate" title={lg.error_message || ''}>{lg.error_message || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; placeholder?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
            {children}
        </div>
    );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: any; tone: string; icon: any }) {
    const tones: Record<string, string> = {
        emerald: 'text-emerald-600 bg-emerald-50', rose: 'text-rose-600 bg-rose-50', amber: 'text-amber-600 bg-amber-50',
        blue: 'text-blue-600 bg-blue-50', indigo: 'text-indigo-600 bg-indigo-50', gray: 'text-gray-600 bg-gray-100',
    };
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
                <div className={`p-1.5 rounded-md ${tones[tone] ?? tones.gray}`}><Icon className="h-3 w-3" /></div>
            </div>
            <div className="mt-1.5 text-lg font-black text-gray-800">{value}</div>
        </div>
    );
}

function ActionBtn({ busy, onClick, icon: Icon, children }: { busy: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
    return (
        <button onClick={onClick} disabled={busy} className="px-3 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {children}
        </button>
    );
}
