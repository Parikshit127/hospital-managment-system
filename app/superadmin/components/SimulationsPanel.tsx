'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    Play, Pause, RotateCcw, Trash2, RefreshCw, Copy, Plus,
    AlertCircle, CheckCircle, Activity, X,
} from 'lucide-react';
import {
    createSimulation, setSimulationRunning, updateSimulationSettings,
    syncSimulationMasterData, resetSimulation, deleteSimulation,
} from '@/app/actions/simulation-actions';

export interface SimulationRow {
    orgId: string;
    name: string;
    code: string;
    running: boolean;
    enabled: boolean;
    intensity: string;
    useMasterData: boolean;
    complaintStyle: string;
    departmentMode: string;
    procurementEnabled: boolean;
    sourceName: string | null;
    lastSyncedAt: string | null;
    counts: Record<string, number>;
    warnings: string[];
    blockers: string[];
}

export interface HospitalRow {
    id: string;
    name: string;
    code: string;
    staff: number;
    doctors: number;
    labTests: number;
    medicines: number;
    services: number;
}

/**
 * Pinned to one locale and zone on purpose. A bare toLocaleString() formats with the
 * SERVER's locale during SSR and the browser's on hydration, and React threw a hydration
 * mismatch on this line whenever the two differed.
 */
function formatSynced(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

const card = 'bg-white/5 border border-white/5 rounded-xl p-5';
const label = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const field = 'w-full px-3 py-2 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none';
const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed';

export default function SimulationsPanel({
    simulations, hospitals, loadError,
}: { simulations: SimulationRow[]; hospitals: HospitalRow[]; loadError: string | null }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
    const [cloneFrom, setCloneFrom] = useState<HospitalRow | null>(null);
    const [blank, setBlank] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<SimulationRow | null>(null);
    const [confirmText, setConfirmText] = useState('');

    const refresh = () => startTransition(() => router.refresh());

    async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>, okText: string) {
        setBusy(key);
        setMessage(null);
        const res = await fn();
        setBusy(null);
        setMessage(res.success ? { tone: 'ok', text: okText } : { tone: 'bad', text: res.error ?? 'Something went wrong' });
        if (res.success) refresh();
    }

    return (
        <div className="space-y-8">
            {(loadError || message) && (
                <div className={`p-3 rounded-lg flex items-start gap-2 text-sm border ${
                    loadError || message?.tone === 'bad'
                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                    {loadError || message?.tone === 'bad'
                        ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        : <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span>{loadError ?? message?.text}</span>
                </div>
            )}

            {/* ── Active simulations ─────────────────────────────────────── */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Activity className="h-4 w-4 text-violet-400" /> Simulations
                    </h2>
                    <button onClick={() => { setBlank(true); setCloneFrom(null); }}
                        className={`${btn} bg-violet-600 hover:bg-violet-500 text-white`}>
                        <Plus className="h-3.5 w-3.5" /> Blank simulation
                    </button>
                </div>

                {simulations.length === 0 ? (
                    <div className={`${card} text-sm text-gray-500`}>
                        No simulations yet. Clone a hospital below to create one.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {simulations.map(sim => (
                            <div key={sim.orgId} className={card}>
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base font-semibold text-white">{sim.name}</h3>
                                            <span className="text-xs text-gray-500 font-mono">{sim.code}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                                sim.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-500/15 text-gray-400'
                                            }`}>
                                                {sim.running ? 'RUNNING' : 'STOPPED'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {sim.sourceName ? `Cloned from ${sim.sourceName}` : 'Not cloned from a hospital'}
                                            {sim.lastSyncedAt && ` · synced ${formatSynced(sim.lastSyncedAt)}`}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        {sim.enabled ? (
                                            <button disabled={!!busy} onClick={() => run(sim.orgId, () => setSimulationRunning(sim.orgId, false), 'Paused')}
                                                className={`${btn} bg-amber-600/80 hover:bg-amber-600 text-white`}>
                                                <Pause className="h-3.5 w-3.5" /> Pause
                                            </button>
                                        ) : (
                                            <button disabled={!!busy} onClick={() => run(sim.orgId, () => setSimulationRunning(sim.orgId, true), 'Started')}
                                                className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
                                                <Play className="h-3.5 w-3.5" /> Start
                                            </button>
                                        )}
                                        <button disabled={!!busy || !sim.sourceName}
                                            title={sim.sourceName ? 'Pull master data changes now' : 'Not cloned from a hospital'}
                                            onClick={() => run(sim.orgId, () => syncSimulationMasterData(sim.orgId), 'Master data synced')}
                                            className={`${btn} bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10`}>
                                            <RefreshCw className="h-3.5 w-3.5" /> Sync now
                                        </button>
                                        <button disabled={!!busy} onClick={() => run(sim.orgId, () => resetSimulation(sim.orgId), 'Generated data cleared')}
                                            className={`${btn} bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10`}>
                                            <RotateCcw className="h-3.5 w-3.5" /> Reset data
                                        </button>
                                        <button disabled={!!busy} onClick={() => { setConfirmDelete(sim); setConfirmText(''); }}
                                            className={`${btn} bg-red-600/80 hover:bg-red-600 text-white`}>
                                            <Trash2 className="h-3.5 w-3.5" /> Delete
                                        </button>
                                    </div>
                                </div>

                                {/* Why it is not generating, if it is not */}
                                {sim.blockers.length > 0 && (
                                    <div className="mt-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                        <p className="text-xs text-amber-300">
                                            Not generating — {sim.blockers.join('; ')}.
                                        </p>
                                    </div>
                                )}

                                {/* What its master data cannot support */}
                                {sim.warnings.length > 0 && (
                                    <ul className="mt-3 space-y-1">
                                        {sim.warnings.map(w => (
                                            <li key={w} className="text-xs text-gray-400 flex items-start gap-1.5">
                                                <AlertCircle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" /> {w}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                                    {Object.entries(sim.counts).map(([k, v]) => (
                                        <span key={k}>
                                            <span className="text-gray-500">{k}</span>{' '}
                                            <span className="text-gray-200 font-semibold">{v}</span>
                                        </span>
                                    ))}
                                </div>

                                {/* Settings */}
                                <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div>
                                        <label className={label}>Volume</label>
                                        <select value={sim.intensity} disabled={!!busy} className={field}
                                            onChange={e => run(sim.orgId, () => updateSimulationSettings(sim.orgId, { intensity: e.target.value }), 'Volume updated')}>
                                            <option value="low">Low</option>
                                            <option value="moderate">Moderate</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={label}>Data source</label>
                                        <select value={sim.useMasterData ? 'master' : 'defaults'} disabled={!!busy} className={field}
                                            onChange={e => run(sim.orgId, () => updateSimulationSettings(sim.orgId, { useMasterData: e.target.value === 'master' }), 'Data source updated')}>
                                            <option value="master">Hospital&rsquo;s own master data</option>
                                            <option value="defaults">Built-in defaults</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={label}>Complaints</label>
                                        <select value={sim.complaintStyle} disabled={!!busy} className={field}
                                            onChange={e => run(sim.orgId, () => updateSimulationSettings(sim.orgId, { complaintStyle: e.target.value }), 'Complaint style updated')}>
                                            <option value="general">General / allopathic</option>
                                            <option value="ayurvedic">Ayurvedic</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={label}>Departments</label>
                                        <select value={sim.departmentMode} disabled={!!busy} className={field}
                                            onChange={e => run(sim.orgId, () => updateSimulationSettings(sim.orgId, { departmentMode: e.target.value as any }), 'Department mode updated')}>
                                            <option value="clone">Clone from hospital</option>
                                            <option value="default">Use defaults</option>
                                            <option value="none">No departments</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={label}>Purchasing</label>
                                        <select value={sim.procurementEnabled ? 'on' : 'off'} disabled={!!busy} className={field}
                                            onChange={e => run(sim.orgId, () => updateSimulationSettings(sim.orgId, { procurementEnabled: e.target.value === 'on' }), 'Purchasing updated')}>
                                            <option value="on">Buy stock from the hospital&rsquo;s suppliers</option>
                                            <option value="off">No purchasing</option>
                                        </select>
                                        <p className="text-[11px] text-gray-600 mt-1">
                                            Gross margin is worked out from purchases. With this off, or with no
                                            suppliers on file, cost of goods is zero and the margin reads 100%.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Hospitals available to clone ───────────────────────────── */}
            <section>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Hospitals</h2>
                <div className={`${card} p-0 overflow-hidden`}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/5">
                                <th className="px-5 py-3">Hospital</th>
                                <th className="px-5 py-3">Staff</th>
                                <th className="px-5 py-3">Doctors</th>
                                <th className="px-5 py-3">Lab tests</th>
                                <th className="px-5 py-3">Medicines</th>
                                <th className="px-5 py-3">Services</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {hospitals.map(h => (
                                <tr key={h.id} className="border-b border-white/5 last:border-0">
                                    <td className="px-5 py-3">
                                        <span className="text-white font-medium">{h.name}</span>
                                        <span className="text-gray-500 font-mono text-xs ml-2">{h.code}</span>
                                    </td>
                                    <td className="px-5 py-3 text-gray-300">{h.staff}</td>
                                    <td className="px-5 py-3 text-gray-300">{h.doctors}</td>
                                    <td className={`px-5 py-3 ${h.labTests ? 'text-gray-300' : 'text-amber-400'}`}>{h.labTests}</td>
                                    <td className={`px-5 py-3 ${h.medicines ? 'text-gray-300' : 'text-amber-400'}`}>{h.medicines}</td>
                                    <td className={`px-5 py-3 ${h.services ? 'text-gray-300' : 'text-amber-400'}`}>{h.services}</td>
                                    <td className="px-5 py-3 text-right">
                                        <button onClick={() => { setCloneFrom(h); setBlank(false); }}
                                            className={`${btn} bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10`}>
                                            <Copy className="h-3.5 w-3.5" /> Clone for simulation
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Amber counts are empty tables — those streams will be skipped rather than filled
                    with our own data.
                </p>
            </section>

            {(cloneFrom || blank) && (
                <CreateDialog
                    source={cloneFrom}
                    busy={!!busy || pending}
                    onClose={() => { setCloneFrom(null); setBlank(false); }}
                    onCreate={async (input) => {
                        setBusy('create');
                        const res = await createSimulation(input);
                        setBusy(null);
                        if (res.success) {
                            setCloneFrom(null);
                            setBlank(false);
                            const d: any = res.data;
                            setMessage({
                                tone: 'ok',
                                text: `Created. ${d.clonedStaff} staff cloned. Log in as ${d.usernamePrefix}<username> with password ${d.password}.`,
                            });
                            refresh();
                        } else {
                            setMessage({ tone: 'bad', text: res.error ?? 'Failed' });
                        }
                    }}
                />
            )}

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-[#0d1117] border border-red-500/30 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-base font-semibold text-white mb-2">Delete this environment?</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            This removes <span className="text-white font-medium">{confirmDelete.name}</span> entirely —
                            its generated data, cloned staff and copied master data. The hospital it was
                            cloned from is not affected.
                        </p>
                        <label className={label}>Type the code <span className="font-mono text-white">{confirmDelete.code}</span> to confirm</label>
                        <input value={confirmText} onChange={e => setConfirmText(e.target.value)} className={field} autoFocus />
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setConfirmDelete(null)} className={`${btn} bg-white/5 text-gray-300 border border-white/10`}>
                                Cancel
                            </button>
                            <button
                                disabled={confirmText !== confirmDelete.code || !!busy}
                                onClick={() => {
                                    const target = confirmDelete;
                                    setConfirmDelete(null);
                                    run(target.orgId, () => deleteSimulation(target.orgId), 'Environment deleted');
                                }}
                                className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function CreateDialog({ source, busy, onClose, onCreate }: {
    source: HospitalRow | null;
    busy: boolean;
    onClose: () => void;
    onCreate: (input: {
        name: string; slug: string; code: string; sourceOrgId: string | null;
        useMasterData: boolean; complaintStyle: string; departmentMode: 'clone' | 'default' | 'none';
    }) => void;
}) {
    const [name, setName] = useState(source ? `${source.name} — Simulation` : '');
    const [code, setCode] = useState('');
    const [useMasterData, setUseMasterData] = useState(true);
    const [complaintStyle, setComplaintStyle] = useState('general');
    const [departmentMode, setDepartmentMode] = useState<'clone' | 'default' | 'none'>(source ? 'clone' : 'default');

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const ready = name.trim().length > 1 && /^[A-Za-z0-9]{2,10}$/.test(code);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
            <div className="bg-[#0d1117] border border-white/10 rounded-xl p-6 max-w-lg w-full my-8">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-white">
                            {source ? `Clone ${source.name}` : 'New blank simulation'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {source
                                ? `${source.staff} staff, ${source.labTests} lab tests, ${source.medicines} medicines and ${source.services} services will be copied.`
                                : 'No hospital data is copied. You will need to add doctors before it can generate anything.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className={label}>Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Meridian General — Simulation" />
                        {slug && <p className="text-[11px] text-gray-600 mt-1 font-mono">{slug}</p>}
                    </div>
                    <div>
                        <label className={label}>Code</label>
                        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className={field} placeholder="MGHSIM" maxLength={10} />
                        <p className="text-[11px] text-gray-600 mt-1">
                            Becomes the UHID prefix and the number series on every document. Pick it now — changing it later splits the numbering.
                        </p>
                    </div>

                    {source && (
                        <div>
                            <label className={label}>Data source</label>
                            <select value={useMasterData ? 'master' : 'defaults'} onChange={e => setUseMasterData(e.target.value === 'master')} className={field}>
                                <option value="master">Use {source.name}&rsquo;s own master data</option>
                                <option value="defaults">Use built-in defaults</option>
                            </select>
                        </div>
                    )}
                    <div>
                        <label className={label}>Complaints</label>
                        <select value={complaintStyle} onChange={e => setComplaintStyle(e.target.value)} className={field}>
                            <option value="general">General / allopathic</option>
                            <option value="ayurvedic">Ayurvedic</option>
                        </select>
                    </div>
                    <div>
                        <label className={label}>Departments</label>
                        <select value={departmentMode} onChange={e => setDepartmentMode(e.target.value as any)} className={field}>
                            {source && <option value="clone">Clone from {source.name}</option>}
                            <option value="default">Use built-in defaults</option>
                            <option value="none">No departments</option>
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className={`${btn} bg-white/5 text-gray-300 border border-white/10`}>Cancel</button>
                    <button
                        disabled={!ready || busy}
                        onClick={() => onCreate({
                            name: name.trim(), slug, code: code.trim().toUpperCase(),
                            sourceOrgId: source?.id ?? null, useMasterData: source ? useMasterData : false,
                            complaintStyle, departmentMode,
                        })}
                        className={`${btn} bg-violet-600 hover:bg-violet-500 text-white`}>
                        {busy ? 'Creating…' : 'Create simulation'}
                    </button>
                </div>
            </div>
        </div>
    );
}
