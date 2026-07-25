'use client';

/**
 * Nursing Care Record — one patient, one screen.
 *
 * The audit found a nurse needed six screens to look after one patient, and that
 * whole categories of care (fluid balance, care plans, wounds, devices,
 * transfusion, teaching) had nowhere to be recorded at all. This puts those in a
 * single tabbed record against one admission, in the order a ward works.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ClipboardList, Droplets, Bandage, Syringe, HeartPulse, GraduationCap,
    Loader2, Plus, AlertTriangle, CheckCircle2, Trash2,
} from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import {
    createCarePlan, getCarePlans, evaluateCarePlan,
    recordFluid, getFluidBalance,
    recordWoundCare, getWoundCare,
    insertDevice, removeDevice, getDevices,
    recordEducation, getEducationRecords,
    startTransfusion, addTransfusionObservation, getTransfusions,
} from '@/app/actions/nursing-care-actions';
import { getNursesForDropdown } from '@/app/actions/admin-actions';

type Row = Record<string, unknown>;

const TABS = [
    { id: 'careplan', label: 'Care Plan', icon: ClipboardList },
    { id: 'fluid', label: 'Fluid Balance', icon: Droplets },
    { id: 'wound', label: 'Wound Care', icon: Bandage },
    { id: 'device', label: 'Lines & Devices', icon: Syringe },
    { id: 'transfusion', label: 'Transfusion', icon: HeartPulse },
    { id: 'education', label: 'Education', icon: GraduationCap },
];

export default function CareRecordPage() {
    const [admissions, setAdmissions] = useState<Row[]>([]);
    const [admissionId, setAdmissionId] = useState('');
    const [tab, setTab] = useState('careplan');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

    const [plans, setPlans] = useState<Row[]>([]);
    const [fluid, setFluid] = useState<{ entries: Row[]; totals: Record<string, number>; shifts: Row[] } | null>(null);
    const [wounds, setWounds] = useState<Row[]>([]);
    const [devices, setDevices] = useState<Row[]>([]);
    const [transfusions, setTransfusions] = useState<Row[]>([]);
    const [education, setEducation] = useState<Row[]>([]);
    const [nurses, setNurses] = useState<Row[]>([]);

    useEffect(() => {
        getIPDAdmissions('Admitted').then(r => {
            if (r.success) {
                const rows = (r.data as Row[]) ?? [];
                setAdmissions(rows);
                const fromUrl = new URLSearchParams(window.location.search).get('admission_id');
                setAdmissionId(fromUrl || String(rows[0]?.admission_id ?? ''));
            }
            setLoading(false);
        });
        getNursesForDropdown().then(r => { if (r.success) setNurses((r.data as Row[]) ?? []); });
    }, []);

    const reload = useCallback(async () => {
        if (!admissionId) return;
        const [p, f, w, d, t, e] = await Promise.all([
            getCarePlans(admissionId), getFluidBalance(admissionId), getWoundCare(admissionId),
            getDevices(admissionId), getTransfusions(admissionId), getEducationRecords(admissionId),
        ]);
        if (p.success) setPlans(p.data as Row[]);
        if (f.success && f.data) setFluid(f.data as never);
        if (w.success) setWounds(w.data as Row[]);
        if (d.success) setDevices(d.data as Row[]);
        if (t.success) setTransfusions(t.data as Row[]);
        if (e.success) setEducation(e.data as Row[]);
    }, [admissionId]);

    useEffect(() => { reload(); }, [reload]);

    const run = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
        setBusy(true);
        const res = await fn();
        setBusy(false);
        setMsg(res.success ? { text: ok } : { text: res.error || 'Failed', bad: true });
        if (res.success) reload();
        setTimeout(() => setMsg(null), 6000);
    };

    const patient = admissions.find(a => a.admission_id === admissionId);
    const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400';
    const label = 'text-[10px] font-bold text-gray-400 uppercase block mb-1';

    if (loading) {
        return <AppShell><div className="flex items-center gap-2 p-8 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></AppShell>;
    }

    return (
        <AppShell>
            <div className="p-6 space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">Nursing Care Record</h1>
                        <p className="text-sm text-gray-500">
                            Care plan, fluids, wounds, lines, transfusion and teaching for one patient.
                        </p>
                    </div>
                    <div>
                        <label className={label}>Patient</label>
                        <select value={admissionId} onChange={e => setAdmissionId(e.target.value)} className={`${input} min-w-[20rem]`}>
                            {admissions.length === 0 && <option value="">No admitted patients</option>}
                            {admissions.map(a => (
                                <option key={String(a.admission_id)} value={String(a.admission_id)}>
                                    {String((a.patient as Row)?.full_name ?? 'Unknown')} · {String(a.admission_id)}
                                    {a.bed_id ? ` · ${String(a.bed_id)}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {msg && (
                    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                        msg.bad ? 'bg-red-50 border-red-300 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        {msg.bad ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        {msg.text}
                    </div>
                )}

                {!admissionId ? (
                    <p className="text-sm text-gray-500">No patients are currently admitted.</p>
                ) : (
                    <>
                        <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
                            {TABS.map(t => {
                                const Icon = t.icon;
                                return (
                                    <button key={t.id} onClick={() => setTab(t.id)}
                                        className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                                            tab === t.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                                        <Icon className="h-3.5 w-3.5" /> {t.label}
                                    </button>
                                );
                            })}
                        </div>

                        {patient && (
                            <p className="text-xs text-gray-400">
                                {String((patient.patient as Row)?.full_name ?? '')} · {String(patient.admission_id)}
                                {patient.diagnosis ? ` · ${String(patient.diagnosis)}` : ''}
                            </p>
                        )}

                        {tab === 'careplan' && <CarePlanTab plans={plans} admissionId={admissionId} run={run} busy={busy} input={input} label={label} />}
                        {tab === 'fluid' && <FluidTab fluid={fluid} admissionId={admissionId} run={run} busy={busy} input={input} label={label} />}
                        {tab === 'wound' && <WoundTab wounds={wounds} admissionId={admissionId} run={run} busy={busy} input={input} label={label} />}
                        {tab === 'device' && <DeviceTab devices={devices} admissionId={admissionId} run={run} busy={busy} input={input} label={label} />}
                        {tab === 'transfusion' && <TransfusionTab records={transfusions} admissionId={admissionId} nurses={nurses} run={run} busy={busy} input={input} label={label} />}
                        {tab === 'education' && <EducationTab records={education} admissionId={admissionId} run={run} busy={busy} input={input} label={label} />}
                    </>
                )}
            </div>
        </AppShell>
    );
}

type TabProps = {
    admissionId: string;
    run: (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => Promise<void>;
    busy: boolean;
    input: string;
    label: string;
};

function Card({ children }: { children: React.ReactNode }) {
    return <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">{children}</div>;
}

// ── Care plan (ADPIE) ───────────────────────────────────────────────────────
function CarePlanTab({ plans, admissionId, run, busy, input, label }: TabProps & { plans: Row[] }) {
    const [f, setF] = useState({ assessment: '', diagnosis: '', goal: '', target_date: '', interventions: '', priority: 'routine' });
    const [evalNote, setEvalNote] = useState<Record<string, string>>({});

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">New care plan</h2>
                <p className="text-[11px] text-gray-400">
                    Assessment → Diagnosis → Goal → Interventions → Evaluation. Each intervention becomes a nursing task.
                </p>
                <div><label className={label}>Assessment (the finding)</label>
                    <input className={input} value={f.assessment} onChange={e => setF({ ...f, assessment: e.target.value })} placeholder="e.g. Unsteady on standing, sedated overnight" /></div>
                <div><label className={label}>Nursing diagnosis (the problem)</label>
                    <input className={input} value={f.diagnosis} onChange={e => setF({ ...f, diagnosis: e.target.value })} placeholder="e.g. Risk of falls related to sedation" /></div>
                <div><label className={label}>Goal (measurable)</label>
                    <input className={input} value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })} placeholder="e.g. No falls during this admission" /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Target date</label>
                        <input type="date" className={input} value={f.target_date} onChange={e => setF({ ...f, target_date: e.target.value })} /></div>
                    <div><label className={label}>Priority</label>
                        <select className={input} value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
                            <option value="routine">Routine</option><option value="high">High</option>
                        </select></div>
                </div>
                <div><label className={label}>Interventions (one per line)</label>
                    <textarea rows={3} className={input} value={f.interventions} onChange={e => setF({ ...f, interventions: e.target.value })}
                        placeholder={'Bed in lowest position\nCall bell within reach\nHourly rounding'} /></div>
                <button disabled={busy || !f.assessment.trim() || !f.diagnosis.trim() || !f.goal.trim()}
                    onClick={() => run(() => createCarePlan({
                        admission_id: admissionId,
                        assessment: f.assessment.trim(), diagnosis: f.diagnosis.trim(), goal: f.goal.trim(),
                        target_date: f.target_date || undefined,
                        interventions: f.interventions.split('\n').map(s => s.trim()).filter(Boolean),
                        priority: f.priority as 'routine' | 'high',
                    }).then(r => { if (r.success) setF({ assessment: '', diagnosis: '', goal: '', target_date: '', interventions: '', priority: 'routine' }); return r; }),
                        'Care plan opened and interventions raised as tasks')}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Plus className="mr-1 inline h-3 w-3" /> Open care plan
                </button>
            </Card>

            <div className="space-y-3">
                {plans.length === 0 && <p className="text-sm text-gray-500">No care plans yet.</p>}
                {plans.map(p => (
                    <Card key={String(p.id)}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{String(p.diagnosis)}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Goal: {String(p.goal)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                p.status === 'met' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {String(p.status)}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400">Assessment: {String(p.assessment)}</p>
                        {Array.isArray(p.interventions) && (p.interventions as string[]).length > 0 && (
                            <ul className="text-xs text-gray-600 list-disc ml-4">
                                {(p.interventions as string[]).map((i, n) => <li key={n}>{i}</li>)}
                            </ul>
                        )}
                        {Array.isArray(p.evaluations) && (p.evaluations as Row[]).length > 0 && (
                            <div className="rounded-lg bg-gray-50 p-2 space-y-1">
                                {(p.evaluations as Row[]).map((e, n) => (
                                    <p key={n} className="text-[11px] text-gray-600">
                                        <span className="font-semibold">{String(e.outcome)}</span> · {String(e.note)}
                                    </p>
                                ))}
                            </div>
                        )}
                        {p.status !== 'met' && (
                            <div className="flex gap-2">
                                <input className={`${input} text-xs`} placeholder="Evaluation note"
                                    value={evalNote[String(p.id)] ?? ''}
                                    onChange={e => setEvalNote({ ...evalNote, [String(p.id)]: e.target.value })} />
                                <button disabled={busy || !(evalNote[String(p.id)] ?? '').trim()}
                                    onClick={() => run(() => evaluateCarePlan(String(p.id), evalNote[String(p.id)], 'progressing'), 'Evaluation recorded')}
                                    className="shrink-0 rounded-lg bg-gray-100 px-3 text-xs font-bold text-gray-600 disabled:opacity-40">Note</button>
                                <button disabled={busy || !(evalNote[String(p.id)] ?? '').trim()}
                                    onClick={() => run(() => evaluateCarePlan(String(p.id), evalNote[String(p.id)], 'met'), 'Goal met, plan closed')}
                                    className="shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40">Goal met</button>
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}

// ── Fluid balance ───────────────────────────────────────────────────────────
function FluidTab({ fluid, admissionId, run, busy, input, label }: TabProps & { fluid: { entries: Row[]; totals: Record<string, number>; shifts: Row[] } | null }) {
    const [f, setF] = useState({ direction: 'intake', route: 'Oral', volume_ml: '', description: '' });
    const routes = f.direction === 'intake'
        ? ['Oral', 'IV', 'NG feed', 'Blood product', 'Other']
        : ['Urine', 'Drain', 'Vomitus', 'Stool', 'Blood loss', 'Other'];

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">Record intake / output</h2>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Direction</label>
                        <select className={input} value={f.direction}
                            onChange={e => setF({ ...f, direction: e.target.value, route: e.target.value === 'intake' ? 'Oral' : 'Urine' })}>
                            <option value="intake">Intake</option><option value="output">Output</option>
                        </select></div>
                    <div><label className={label}>Route</label>
                        <select className={input} value={f.route} onChange={e => setF({ ...f, route: e.target.value })}>
                            {routes.map(r => <option key={r}>{r}</option>)}
                        </select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Volume (ml)</label>
                        <input type="number" min="1" className={input} value={f.volume_ml} onChange={e => setF({ ...f, volume_ml: e.target.value })} /></div>
                    <div><label className={label}>Note</label>
                        <input className={input} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="optional" /></div>
                </div>
                <button disabled={busy || !f.volume_ml}
                    onClick={() => run(() => recordFluid({
                        admission_id: admissionId, direction: f.direction as 'intake' | 'output',
                        route: f.route, volume_ml: Number(f.volume_ml), description: f.description || undefined,
                    }).then(r => { if (r.success) setF({ ...f, volume_ml: '', description: '' }); return r; }), 'Recorded')}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Plus className="mr-1 inline h-3 w-3" /> Add entry
                </button>
            </Card>

            <Card>
                <h2 className="text-sm font-bold text-gray-700">Today&apos;s balance</h2>
                {fluid && (
                    <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-blue-50 p-3">
                                <p className="text-[10px] font-bold uppercase text-blue-500">Intake</p>
                                <p className="text-lg font-black text-blue-700">{fluid.totals.intake} ml</p>
                            </div>
                            <div className="rounded-lg bg-amber-50 p-3">
                                <p className="text-[10px] font-bold uppercase text-amber-600">Output</p>
                                <p className="text-lg font-black text-amber-700">{fluid.totals.output} ml</p>
                            </div>
                            <div className={`rounded-lg p-3 ${fluid.totals.balance < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                                <p className={`text-[10px] font-bold uppercase ${fluid.totals.balance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>Balance</p>
                                <p className={`text-lg font-black ${fluid.totals.balance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                    {fluid.totals.balance > 0 ? '+' : ''}{fluid.totals.balance} ml
                                </p>
                            </div>
                        </div>
                        <table className="w-full text-xs">
                            <thead><tr className="text-gray-400"><th className="text-left font-bold">Shift</th><th>In</th><th>Out</th><th>Balance</th></tr></thead>
                            <tbody>
                                {fluid.shifts.map(s => (
                                    <tr key={String(s.shift)} className="border-t border-gray-50">
                                        <td className="py-1 capitalize text-gray-600">{String(s.shift)}</td>
                                        <td className="text-center">{String(s.intake)}</td>
                                        <td className="text-center">{String(s.output)}</td>
                                        <td className="text-center font-semibold">{Number(s.balance) > 0 ? '+' : ''}{String(s.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="max-h-56 overflow-y-auto">
                            {fluid.entries.map(e => (
                                <p key={String(e.id)} className="text-[11px] text-gray-500 border-t border-gray-50 py-1">
                                    <span className={e.direction === 'intake' ? 'text-blue-600' : 'text-amber-600'}>
                                        {e.direction === 'intake' ? '↓' : '↑'} {String(e.volume_ml)} ml
                                    </span>{' '}
                                    {String(e.route)} · {new Date(String(e.recorded_at)).toLocaleTimeString([], { timeStyle: 'short' })}
                                    {e.description ? ` · ${String(e.description)}` : ''}
                                </p>
                            ))}
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}

// ── Wound care ──────────────────────────────────────────────────────────────
function WoundTab({ wounds, admissionId, run, busy, input, label }: TabProps & { wounds: Row[] }) {
    const [f, setF] = useState({ wound_type: 'Pressure ulcer', location: '', stage: '', length_cm: '', width_cm: '', depth_cm: '', appearance: '', exudate: '', dressing_used: '', intervention: '', next_review_at: '' });
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">Wound assessment</h2>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Type</label>
                        <select className={input} value={f.wound_type} onChange={e => setF({ ...f, wound_type: e.target.value })}>
                            {['Pressure ulcer', 'Surgical', 'Traumatic', 'Diabetic foot', 'Other'].map(t => <option key={t}>{t}</option>)}
                        </select></div>
                    <div><label className={label}>Location</label>
                        <input className={input} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="e.g. Sacrum" /></div>
                </div>
                {f.wound_type === 'Pressure ulcer' && (
                    <div><label className={label}>Stage</label>
                        <select className={input} value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })}>
                            <option value="">—</option>{['I', 'II', 'III', 'IV', 'Unstageable'].map(s => <option key={s}>{s}</option>)}
                        </select></div>
                )}
                <div className="grid grid-cols-3 gap-2">
                    {(['length_cm', 'width_cm', 'depth_cm'] as const).map(k => (
                        <div key={k}><label className={label}>{k.replace('_cm', '')} (cm)</label>
                            <input type="number" step="0.1" className={input} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Appearance</label>
                        <input className={input} value={f.appearance} onChange={e => setF({ ...f, appearance: e.target.value })} placeholder="granulating / slough" /></div>
                    <div><label className={label}>Exudate</label>
                        <input className={input} value={f.exudate} onChange={e => setF({ ...f, exudate: e.target.value })} placeholder="nil / serous / purulent" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Dressing used</label>
                        <input className={input} value={f.dressing_used} onChange={e => setF({ ...f, dressing_used: e.target.value })} /></div>
                    <div><label className={label}>Next review</label>
                        <input type="datetime-local" className={input} value={f.next_review_at} onChange={e => setF({ ...f, next_review_at: e.target.value })} /></div>
                </div>
                <p className="text-[11px] text-gray-400">Setting a review date raises the redressing task automatically.</p>
                <button disabled={busy || !f.location.trim()}
                    onClick={() => run(() => recordWoundCare({
                        admission_id: admissionId, wound_type: f.wound_type, location: f.location.trim(),
                        stage: f.stage || undefined,
                        length_cm: f.length_cm ? Number(f.length_cm) : undefined,
                        width_cm: f.width_cm ? Number(f.width_cm) : undefined,
                        depth_cm: f.depth_cm ? Number(f.depth_cm) : undefined,
                        appearance: f.appearance || undefined, exudate: f.exudate || undefined,
                        dressing_used: f.dressing_used || undefined,
                        next_review_at: f.next_review_at || undefined,
                    }), 'Wound assessment recorded')}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Plus className="mr-1 inline h-3 w-3" /> Record
                </button>
            </Card>
            <div className="space-y-2">
                {wounds.length === 0 && <p className="text-sm text-gray-500">No wound records yet.</p>}
                {wounds.map(w => (
                    <Card key={String(w.id)}>
                        <p className="text-sm font-bold text-gray-800">{String(w.wound_type)} · {String(w.location)}{w.stage ? ` · Stage ${String(w.stage)}` : ''}</p>
                        <p className="text-[11px] text-gray-500">
                            {new Date(String(w.assessed_at)).toLocaleString()}
                            {w.dressing_used ? ` · ${String(w.dressing_used)}` : ''}
                            {w.appearance ? ` · ${String(w.appearance)}` : ''}
                        </p>
                    </Card>
                ))}
            </div>
        </div>
    );
}

// ── Devices ─────────────────────────────────────────────────────────────────
function DeviceTab({ devices, admissionId, run, busy, input, label }: TabProps & { devices: Row[] }) {
    const [f, setF] = useState({ device_type: 'Peripheral IV cannula', site: '', size: '' });
    const [reason, setReason] = useState<Record<string, string>>({});
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">Insert a device</h2>
                <div><label className={label}>Type</label>
                    <select className={input} value={f.device_type} onChange={e => setF({ ...f, device_type: e.target.value })}>
                        {['Peripheral IV cannula', 'Central line', 'Urinary catheter', 'NG tube', 'Arterial line', 'Drain'].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Site</label>
                        <input className={input} value={f.site} onChange={e => setF({ ...f, site: e.target.value })} placeholder="e.g. Left forearm" /></div>
                    <div><label className={label}>Size</label>
                        <input className={input} value={f.size} onChange={e => setF({ ...f, size: e.target.value })} placeholder="e.g. 20G" /></div>
                </div>
                <p className="text-[11px] text-gray-400">A review date is set from the device type and raised as a task.</p>
                <button disabled={busy || !f.site.trim()}
                    onClick={() => run(() => insertDevice({ admission_id: admissionId, device_type: f.device_type, site: f.site.trim(), size: f.size || undefined })
                        .then(r => { if (r.success) setF({ ...f, site: '', size: '' }); return r; }), 'Device recorded and review task raised')}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Plus className="mr-1 inline h-3 w-3" /> Record insertion
                </button>
            </Card>
            <div className="space-y-2">
                {devices.length === 0 && <p className="text-sm text-gray-500">No devices recorded.</p>}
                {devices.map(d => (
                    <Card key={String(d.id)}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{String(d.device_type)} · {String(d.site)}</p>
                                <p className="text-[11px] text-gray-500">
                                    In situ since {new Date(String(d.inserted_at)).toLocaleDateString()}
                                    {d.due_at ? ` · review ${new Date(String(d.due_at)).toLocaleDateString()}` : ''}
                                </p>
                            </div>
                            {d.overdue ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">OVERDUE</span> : null}
                            {d.status === 'removed' ? <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">removed</span> : null}
                        </div>
                        {d.status === 'in_situ' && (
                            <div className="flex gap-2">
                                <input className={`${input} text-xs`} placeholder="Removal reason"
                                    value={reason[String(d.id)] ?? ''} onChange={e => setReason({ ...reason, [String(d.id)]: e.target.value })} />
                                <button disabled={busy || !(reason[String(d.id)] ?? '').trim()}
                                    onClick={() => run(() => removeDevice(String(d.id), reason[String(d.id)]), 'Device removed')}
                                    className="shrink-0 rounded-lg bg-gray-100 px-3 text-xs font-bold text-gray-600 disabled:opacity-40">
                                    <Trash2 className="inline h-3 w-3" /> Remove
                                </button>
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}

// ── Transfusion ─────────────────────────────────────────────────────────────
function TransfusionTab({ records, admissionId, nurses, run, busy, input, label }: TabProps & { records: Row[]; nurses: Row[] }) {
    const [f, setF] = useState({ component: 'PRBC', unit_number: '', blood_group: '', crossmatch_ref: '', consent: false, witness_id: '', volume_ml: '' });
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">Start a transfusion</h2>
                <p className="text-[11px] text-gray-400">
                    Consent and a second checker are both required; the 15 and 30 minute observations are raised as tasks.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Component</label>
                        <select className={input} value={f.component} onChange={e => setF({ ...f, component: e.target.value })}>
                            {['PRBC', 'Whole blood', 'Platelets', 'FFP', 'Cryoprecipitate'].map(c => <option key={c}>{c}</option>)}
                        </select></div>
                    <div><label className={label}>Unit number</label>
                        <input className={input} value={f.unit_number} onChange={e => setF({ ...f, unit_number: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Blood group</label>
                        <input className={input} value={f.blood_group} onChange={e => setF({ ...f, blood_group: e.target.value })} placeholder="e.g. B+" /></div>
                    <div><label className={label}>Cross-match ref</label>
                        <input className={input} value={f.crossmatch_ref} onChange={e => setF({ ...f, crossmatch_ref: e.target.value })} /></div>
                </div>
                <div><label className={label}>Second checker (bedside check)</label>
                    <select className={input} value={f.witness_id} onChange={e => setF({ ...f, witness_id: e.target.value })}>
                        <option value="">Select a colleague…</option>
                        {nurses.map(n => <option key={String(n.id)} value={String(n.id)}>{String(n.name ?? n.username)}</option>)}
                    </select></div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                    Consent has been taken and documented
                </label>
                <button disabled={busy || !f.unit_number.trim() || !f.blood_group.trim() || !f.consent || !f.witness_id}
                    onClick={() => run(() => startTransfusion({
                        admission_id: admissionId, component: f.component, unit_number: f.unit_number.trim(),
                        blood_group: f.blood_group.trim(), crossmatch_ref: f.crossmatch_ref || undefined,
                        consent_taken: f.consent, witness_id: f.witness_id,
                        volume_ml: f.volume_ml ? Number(f.volume_ml) : undefined,
                    }), 'Transfusion started, observation tasks raised')}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    Start transfusion
                </button>
            </Card>
            <div className="space-y-2">
                {records.length === 0 && <p className="text-sm text-gray-500">No transfusions recorded.</p>}
                {records.map(r => (
                    <Card key={String(r.id)}>
                        <p className="text-sm font-bold text-gray-800">{String(r.component)} · unit {String(r.unit_number)} · {String(r.blood_group)}</p>
                        <p className="text-[11px] text-gray-500">
                            {String(r.status)}{r.started_at ? ` · started ${new Date(String(r.started_at)).toLocaleString()}` : ''}
                        </p>
                        {r.reaction_occurred ? (
                            <p className="text-xs font-bold text-red-700">Reaction recorded — transfusion stopped</p>
                        ) : r.status === 'in_progress' ? (
                            <div className="flex gap-2">
                                <button disabled={busy}
                                    onClick={() => run(() => addTransfusionObservation(String(r.id), { minute: 15, note: 'Routine observation, no reaction' }), 'Observation recorded')}
                                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">Observation OK</button>
                                <button disabled={busy}
                                    onClick={() => run(() => addTransfusionObservation(String(r.id), { minute: 15, reaction: true, note: 'Reaction observed — stopped' }), 'Reaction recorded, transfusion stopped')}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Reaction — stop</button>
                            </div>
                        ) : null}
                    </Card>
                ))}
            </div>
        </div>
    );
}

// ── Education ───────────────────────────────────────────────────────────────
function EducationTab({ records, admissionId, run, busy, input, label }: TabProps & { records: Row[] }) {
    const [f, setF] = useState({ topic: 'Medication', content: '', method: 'verbal', audience: 'patient', understanding: 'understood', is_discharge: false });
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <h2 className="text-sm font-bold text-gray-700">Record teaching</h2>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Topic</label>
                        <select className={input} value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })}>
                            {['Medication', 'Diet', 'Wound care', 'Device care', 'Danger signs', 'Follow-up', 'Other'].map(t => <option key={t}>{t}</option>)}
                        </select></div>
                    <div><label className={label}>Method</label>
                        <select className={input} value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>
                            {['verbal', 'demonstration', 'leaflet', 'video'].map(m => <option key={m}>{m}</option>)}
                        </select></div>
                </div>
                <div><label className={label}>What was taught</label>
                    <textarea rows={3} className={input} value={f.content} onChange={e => setF({ ...f, content: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label}>Audience</label>
                        <select className={input} value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>
                            {['patient', 'family', 'both'].map(a => <option key={a}>{a}</option>)}
                        </select></div>
                    <div><label className={label}>Teach-back</label>
                        <select className={input} value={f.understanding} onChange={e => setF({ ...f, understanding: e.target.value })}>
                            {['understood', 'partial', 'needs repeat'].map(u => <option key={u}>{u}</option>)}
                        </select></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={f.is_discharge} onChange={e => setF({ ...f, is_discharge: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                    This is discharge teaching
                </label>
                <button disabled={busy || !f.content.trim()}
                    onClick={() => run(() => recordEducation({
                        admission_id: admissionId, topic: f.topic, content: f.content.trim(),
                        method: f.method, audience: f.audience, understanding: f.understanding,
                        is_discharge_teaching: f.is_discharge,
                    }).then(r => { if (r.success) setF({ ...f, content: '' }); return r; }), 'Teaching recorded')}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    <Plus className="mr-1 inline h-3 w-3" /> Record
                </button>
            </Card>
            <div className="space-y-2">
                {records.length === 0 && <p className="text-sm text-gray-500">No teaching recorded yet.</p>}
                {records.map(r => (
                    <Card key={String(r.id)}>
                        <p className="text-sm font-bold text-gray-800">
                            {String(r.topic)}{r.is_discharge_teaching ? ' · discharge teaching' : ''}
                        </p>
                        <p className="text-xs text-gray-600">{String(r.content)}</p>
                        <p className="text-[11px] text-gray-400">
                            {String(r.method)} · {String(r.audience)} · understanding: {String(r.understanding ?? '—')}
                            {r.repeat_required ? ' · REPEAT NEEDED' : ''}
                        </p>
                    </Card>
                ))}
            </div>
        </div>
    );
}
