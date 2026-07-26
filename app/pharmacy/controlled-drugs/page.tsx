'use client';

/**
 * Controlled-drug flags for the formulary.
 *
 * The narcotic register, the pharmacy dispensing controls and the two-nurse
 * check at the bedside all read is_narcotic / drug_schedule. Nothing in the
 * formulary is flagged, so all of them are inert — this is where a pharmacist
 * turns them on.
 *
 * Proposals only. Nothing is written until someone confirms it, because a wrong
 * flag is friction on every dose of that drug for the rest of its life.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { ShieldCheck, Loader2, AlertTriangle, Check } from 'lucide-react';
import {
    getControlledDrugCandidates, applyControlledDrugFlags, getFlaggedControlledDrugs,
} from '@/app/actions/controlled-drugs-actions';

type Row = Record<string, any>;

const SCHEDULE_STYLE: Record<string, string> = {
    NDPS: 'bg-red-100 text-red-700 border-red-200',
    X: 'bg-amber-100 text-amber-700 border-amber-200',
    H1: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function ControlledDrugsPage() {
    const [candidates, setCandidates] = useState<Row[]>([]);
    const [flagged, setFlagged] = useState<Row[]>([]);
    const [stats, setStats] = useState<{ formularySize: number; alreadyFlagged: number } | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
    const [tab, setTab] = useState<'proposed' | 'current'>('proposed');

    const load = useCallback(async () => {
        setLoading(true);
        const [c, f] = await Promise.all([getControlledDrugCandidates(), getFlaggedControlledDrugs()]);
        if (c.success && c.data) {
            const d = c.data as any;
            setCandidates(d.candidates);
            setStats({ formularySize: d.formularySize, alreadyFlagged: d.alreadyFlagged });
            // Pre-select the narcotics: those are the ones that must not be missed.
            setSelected(new Set(d.candidates.filter((x: Row) => x.suggested_narcotic).map((x: Row) => x.id)));
        } else {
            setMsg({ text: (c as any).error || 'Could not scan the formulary', bad: true });
        }
        if (f.success) setFlagged((f.data as Row[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const selectAllInSchedule = (schedule: string) => {
        const next = new Set(selected);
        candidates.filter(c => c.suggested_schedule === schedule).forEach(c => next.add(c.id));
        setSelected(next);
    };

    const apply = async () => {
        const items = candidates
            .filter(c => selected.has(c.id))
            .map(c => ({ id: c.id, schedule: String(c.suggested_schedule), narcotic: !!c.suggested_narcotic }));
        if (!items.length) { setMsg({ text: 'Nothing selected.', bad: true }); return; }

        setBusy(true);
        const res = await applyControlledDrugFlags(items);
        setBusy(false);
        setMsg(res.success
            ? { text: `${(res.data as any)?.updated ?? 0} formulary line(s) flagged.` }
            : { text: (res as any).error || 'Failed', bad: true });
        if (res.success) load();
        setTimeout(() => setMsg(null), 6000);
    };

    const bySchedule = (s: string) => candidates.filter(c => c.suggested_schedule === s);

    return (
        <AppShell>
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-teal-600" /> Controlled drugs
                        </h1>
                        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                            The narcotic register, pharmacy dispensing controls and the second-nurse check
                            at the bedside all depend on these flags. Review the proposals and apply the
                            ones that are right for this formulary.
                        </p>
                    </div>
                    {stats && (
                        <div className="text-right shrink-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Formulary</p>
                            <p className="text-sm font-bold text-gray-900">{stats.formularySize.toLocaleString()} lines</p>
                            <p className={`text-xs font-semibold ${stats.alreadyFlagged ? 'text-emerald-600' : 'text-red-600'}`}>
                                {stats.alreadyFlagged} currently flagged
                            </p>
                        </div>
                    )}
                </div>

                {stats?.alreadyFlagged === 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-800">
                            <span className="font-bold">No drug in this formulary is flagged as controlled.</span>{' '}
                            Until at least the narcotics are flagged, the controlled-drug register stays empty
                            and no dose will ever ask for a second nurse.
                        </p>
                    </div>
                )}

                {msg && (
                    <div className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad
                        ? 'border border-amber-200 bg-amber-50 text-amber-800'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                        {msg.text}
                    </div>
                )}

                <div className="flex gap-2">
                    {(['proposed', 'current'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${tab === t
                                ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {t === 'proposed' ? `Proposed (${candidates.length})` : `Currently flagged (${flagged.length})`}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                ) : tab === 'current' ? (
                    <div className="rounded-2xl border border-gray-200 bg-white divide-y">
                        {flagged.length === 0 && <p className="p-6 text-xs text-gray-400">Nothing is flagged yet.</p>}
                        {flagged.map(f => (
                            <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-800">{f.brand_name}</span>
                                <span className="flex items-center gap-2">
                                    {f.is_narcotic && (
                                        <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                            narcotic
                                        </span>
                                    )}
                                    {f.drug_schedule && (
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SCHEDULE_STYLE[f.drug_schedule] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                            {f.drug_schedule}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-gray-700">Nothing to propose</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Every controlled molecule this list knows about is already flagged correctly.
                        </p>
                    </div>
                ) : (
                    <>
                        {['NDPS', 'X', 'H1'].map(schedule => {
                            const rows = bySchedule(schedule);
                            if (!rows.length) return null;
                            return (
                                <div key={schedule} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SCHEDULE_STYLE[schedule]}`}>
                                                {schedule}
                                            </span>
                                            <span className="text-xs font-semibold text-gray-700">{rows.length} line(s)</span>
                                            <span className="text-[10px] text-gray-400">
                                                {schedule === 'H1'
                                                    ? 'register entry only — no bedside co-signature'
                                                    : 'register entry and a second nurse at the bedside'}
                                            </span>
                                        </div>
                                        <button onClick={() => selectAllInSchedule(schedule)}
                                            className="text-[11px] font-bold text-teal-600 hover:underline">
                                            Select all
                                        </button>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto divide-y">
                                        {rows.map(c => (
                                            <label key={c.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                                                <input type="checkbox" checked={selected.has(c.id)}
                                                    onChange={() => toggle(c.id)}
                                                    className="h-3.5 w-3.5 accent-teal-600" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-xs font-medium text-gray-800 truncate">{c.brand_name}</span>
                                                    <span className="block text-[10px] text-gray-400">
                                                        matched on “{c.molecule}”
                                                        {c.note ? ` · ${c.note}` : ''}
                                                        {c.current_schedule ? ` · currently ${c.current_schedule}` : ''}
                                                    </span>
                                                </span>
                                                {c.suggested_narcotic && (
                                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 shrink-0">
                                                        narcotic
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
                            <p className="text-xs text-gray-600">
                                <span className="font-bold text-gray-900">{selected.size}</span> selected of {candidates.length}
                            </p>
                            <button onClick={apply} disabled={busy || !selected.size}
                                className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
                                {busy ? 'Applying…' : `Flag ${selected.size} drug(s)`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}
