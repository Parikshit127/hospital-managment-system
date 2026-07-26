'use client';

/**
 * Clinical incident reporting.
 *
 * Falls, medication errors, pressure injuries, restraint use and needlestick
 * injuries had no mechanism at all — there was nowhere to report one and no
 * follow-up trail. Reporting is deliberately open to every clinical role: a
 * reporting system that only seniors can use does not get used.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { AlertTriangle, ShieldAlert, Loader2, CheckCircle2, Plus } from 'lucide-react';
import { reportIncident, getIncidents, reviewIncident } from '@/app/actions/nursing-care-actions';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';

type Row = Record<string, unknown>;

const TYPES = ['Fall', 'Medication error', 'Pressure injury', 'Restraint use', 'Needlestick', 'Equipment failure', 'Other'];
const SEVERITIES = [
    { v: 'no harm', label: 'No harm', tone: 'bg-gray-100 text-gray-600' },
    { v: 'minor', label: 'Minor', tone: 'bg-yellow-100 text-yellow-700' },
    { v: 'moderate', label: 'Moderate', tone: 'bg-orange-100 text-orange-700' },
    { v: 'major', label: 'Major', tone: 'bg-red-100 text-red-700' },
    { v: 'catastrophic', label: 'Catastrophic', tone: 'bg-red-200 text-red-900' },
];

function localNow() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

export default function IncidentsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [admissions, setAdmissions] = useState<Row[]>([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [review, setReview] = useState<Record<string, { notes: string; cause: string; action: string }>>({});
    // Reporting is open to every clinical role, but reviewing and closing is
    // not — that is the IPD manager's or an administrator's job. Without this
    // the review boxes were shown to everyone and only rejected on submit,
    // so a nurse could type a full root-cause analysis and then lose it.
    const [role, setRole] = useState<string | null>(null);
    const canReview = role === 'admin' || role === 'ipd_manager';

    const [f, setF] = useState({
        incident_type: 'Fall', severity: 'no harm', occurred_at: localNow(),
        location: '', description: '', immediate_action: '', admission_id: '', patient_informed: false,
    });

    const load = useCallback(async () => {
        const res = await getIncidents(filter ? { status: filter } : undefined);
        if (res.success) setRows(res.data as Row[]);
        setLoading(false);
    }, [filter]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        getIPDAdmissions('Admitted').then(r => { if (r.success) setAdmissions((r.data as Row[]) ?? []); });
        fetch('/api/session').then(r => r.json()).then(s => setRole(s?.role ?? null)).catch(() => setRole(null));
    }, []);

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
        setBusy(true);
        const res = await fn();
        setBusy(false);
        setMsg(res.success ? { text: ok } : { text: res.error || 'Failed', bad: true });
        if (res.success) load();
        setTimeout(() => setMsg(null), 6000);
    };

    const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400';
    const label = 'text-[10px] font-bold text-gray-400 uppercase block mb-1';
    const toneFor = (s: string) => SEVERITIES.find(x => x.v === s)?.tone ?? 'bg-gray-100 text-gray-600';

    return (
        <AppShell>
            <div className="p-6 space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                            <ShieldAlert className="h-5 w-5 text-red-500" /> Clinical Incidents
                        </h1>
                        <p className="text-sm text-gray-500">
                            Falls, medication errors, pressure injuries, restraint and needlestick — reported and followed up.
                        </p>
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <label className={label}>Status</label>
                            <select className={input} value={filter} onChange={e => setFilter(e.target.value)}>
                                <option value="">All</option>
                                <option value="open">Open</option>
                                <option value="under review">Under review</option>
                                <option value="closed">Closed</option>
                            </select>
                        </div>
                        <button onClick={() => setShowForm(!showForm)}
                            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700">
                            {showForm ? 'Cancel' : <><Plus className="mr-1 inline h-3 w-3" /> Report an incident</>}
                        </button>
                    </div>
                </div>

                {msg && (
                    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                        msg.bad ? 'bg-red-50 border-red-300 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        {msg.bad ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} {msg.text}
                    </div>
                )}

                {showForm && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 max-w-3xl">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div><label className={label}>Type</label>
                                <select className={input} value={f.incident_type} onChange={e => setF({ ...f, incident_type: e.target.value })}>
                                    {TYPES.map(t => <option key={t}>{t}</option>)}
                                </select></div>
                            <div><label className={label}>Severity</label>
                                <select className={input} value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })}>
                                    {SEVERITIES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                                </select></div>
                            <div><label className={label}>When</label>
                                <input type="datetime-local" className={input} value={f.occurred_at} onChange={e => setF({ ...f, occurred_at: e.target.value })} /></div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label className={label}>Patient (optional)</label>
                                <select className={input} value={f.admission_id} onChange={e => setF({ ...f, admission_id: e.target.value })}>
                                    <option value="">Not patient-specific</option>
                                    {admissions.map(a => (
                                        <option key={String(a.admission_id)} value={String(a.admission_id)}>
                                            {String((a.patient as Row)?.full_name ?? '')} · {String(a.admission_id)}
                                        </option>
                                    ))}
                                </select></div>
                            <div><label className={label}>Location</label>
                                <input className={input} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="e.g. Bay 3, General Ward" /></div>
                        </div>
                        <div><label className={label}>What happened</label>
                            <textarea rows={3} className={input} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
                        <div><label className={label}>Immediate action taken</label>
                            <textarea rows={2} className={input} value={f.immediate_action} onChange={e => setF({ ...f, immediate_action: e.target.value })} /></div>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="checkbox" checked={f.patient_informed} onChange={e => setF({ ...f, patient_informed: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                            Patient or family have been informed
                        </label>
                        <p className="text-[11px] text-gray-400">
                            Moderate and above notify the IPD manager and admin immediately.
                        </p>
                        <button disabled={busy || !f.description.trim()}
                            onClick={() => run(() => reportIncident({
                                incident_type: f.incident_type, severity: f.severity, occurred_at: f.occurred_at,
                                location: f.location || undefined, description: f.description,
                                immediate_action: f.immediate_action || undefined,
                                admission_id: f.admission_id || undefined,
                                patient_informed: f.patient_informed,
                            }).then(r => { if (r.success) { setF({ ...f, description: '', immediate_action: '', location: '' }); setShowForm(false); } return r; }),
                                'Incident reported')}
                            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                            Submit report
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-500">No incidents recorded{filter ? ` with status "${filter}"` : ''}.</p>
                ) : (
                    <div className="space-y-2">
                        {rows.map(r => {
                            const id = String(r.id);
                            const rv = review[id] ?? { notes: '', cause: '', action: '' };
                            return (
                                <div key={id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">
                                                {String(r.incident_type)}
                                                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneFor(String(r.severity))}`}>
                                                    {String(r.severity)}
                                                </span>
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {new Date(String(r.occurred_at)).toLocaleString()}
                                                {r.location ? ` · ${String(r.location)}` : ''}
                                                {r.patient_informed ? ' · patient informed' : ''}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            r.status === 'closed' ? 'bg-emerald-100 text-emerald-700'
                                                : r.status === 'under review' ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-amber-100 text-amber-700'}`}>
                                            {String(r.status)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-700">{String(r.description)}</p>
                                    {r.immediate_action ? <p className="text-[11px] text-gray-500">Immediate action: {String(r.immediate_action)}</p> : null}
                                    {r.root_cause ? <p className="text-[11px] text-gray-500">Root cause: {String(r.root_cause)}</p> : null}
                                    {r.preventive_action ? <p className="text-[11px] text-gray-500">Preventive action: {String(r.preventive_action)}</p> : null}

                                    {r.status !== 'closed' && !canReview && (
                                        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                                            Reported and logged. Review and closure are done by the IPD manager
                                            or an administrator — you do not need to do anything further.
                                        </p>
                                    )}

                                    {r.status !== 'closed' && canReview && (
                                        <div className="grid gap-2 sm:grid-cols-3 pt-1">
                                            <input className={`${input} text-xs`} placeholder="Review notes" value={rv.notes}
                                                onChange={e => setReview({ ...review, [id]: { ...rv, notes: e.target.value } })} />
                                            <input className={`${input} text-xs`} placeholder="Root cause" value={rv.cause}
                                                onChange={e => setReview({ ...review, [id]: { ...rv, cause: e.target.value } })} />
                                            <input className={`${input} text-xs`} placeholder="Preventive action" value={rv.action}
                                                onChange={e => setReview({ ...review, [id]: { ...rv, action: e.target.value } })} />
                                            <div className="flex gap-2 sm:col-span-3">
                                                <button disabled={busy}
                                                    onClick={() => run(() => reviewIncident(id, { review_notes: rv.notes, root_cause: rv.cause, preventive_action: rv.action }), 'Review saved')}
                                                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">Save review</button>
                                                <button disabled={busy || !rv.action.trim()}
                                                    onClick={() => run(() => reviewIncident(id, { review_notes: rv.notes, root_cause: rv.cause, preventive_action: rv.action, close: true }), 'Incident closed')}
                                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                                                    Close incident
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
