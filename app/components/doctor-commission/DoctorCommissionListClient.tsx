'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, Pencil, X, Stethoscope, Wallet, BarChart3 } from 'lucide-react';
import {
    getDoctorCommissionOverview,
    saveDoctorConfig,
    setDoctorConfigActive,
    setDefaultDoctorCommission,
    getCommissionServiceOptions,
    applyDoctorConfigToAll,
} from '@/app/actions/doctor-commission-actions';
import { DOCTOR_COMMISSION_TYPES, DOCTOR_SERVICE_TYPES } from '@/app/lib/doctor-commission-constants';

type ServiceRate = { service_type: string; service_name?: string; percent: number };
type Row = {
    id: string;
    name: string;
    specialty?: string | null;
    is_active: boolean;
    configured: boolean;
    commission_type: string | null;
    flat_percent?: number | null;
    fixed_amount_per_bill?: number | null;
    config_active: boolean;
    service_rates: ServiceRate[];
    uses_default?: boolean;
    bill_count: number;
    total_business: number;
    commission_accrued: number;
    commission_paid: number;
    outstanding: number;
};

const COMMISSION_LABEL: Record<string, string> = {
    flat_percent: 'Flat %',
    per_service: 'By service',
    fixed_per_bill: 'Fixed / bill',
};

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function commissionSummary(r: Row): string {
    if (!r.configured) return 'not configured';
    if (r.commission_type === 'flat_percent') return `${r.flat_percent ?? 0}%`;
    if (r.commission_type === 'fixed_per_bill') return inr(r.fixed_amount_per_bill ?? 0) + '/bill';
    if (r.commission_type === 'per_service') {
        // Named-service overrides read better as "Service 12%" than "IPD 12%".
        const parts = r.service_rates.map((s) => `${s.service_name || s.service_type} ${s.percent}%`);
        return parts.join(', ') || 'no rates';
    }
    return '—';
}

export default function DoctorCommissionListClient({ basePath }: { basePath: string }) {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [onlyConfigured, setOnlyConfigured] = useState(false);
    const [editing, setEditing] = useState<Row | null>(null);
    const [defaultPercent, setDefaultPercent] = useState(0);

    const load = async () => {
        setLoading(true);
        const res = await getDoctorCommissionOverview();
        if (res.success) {
            setRows(res.data as Row[]);
            setDefaultPercent(Number((res as any).default_percent ?? 0));
        }
        setLoading(false);
    };
    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(
        () =>
            rows.filter((r) => {
                if (onlyConfigured && !r.configured) return false;
                if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
                return true;
            }),
        [rows, search, onlyConfigured],
    );

    const totals = useMemo(
        () =>
            filtered.reduce(
                (acc, r) => {
                    acc.business += r.total_business;
                    acc.accrued += r.commission_accrued;
                    acc.paid += r.commission_paid;
                    return acc;
                },
                { business: 0, accrued: 0, paid: 0 },
            ),
        [filtered],
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <Stethoscope className="h-6 w-6 text-indigo-500" /> Doctor Payouts
                    </h1>
                    <p className="text-sm text-gray-400">What each doctor is paid on the bills assigned to them.</p>
                </div>
                {/* Shortcut into the MIS "Doctor Wise Revenue Summary" report (admin/finance portal). */}
                <Link
                    href={`/${basePath.split('/')[1]}/mis/revenue-doctor-wise-summary`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 hover:text-indigo-600"
                >
                    <BarChart3 className="h-4 w-4" /> Doctor Revenue Summary
                </Link>
            </div>

            {/* Finance summary — reads left to right as the money's journey:
                collected from patients → owed to doctors → already paid → still to pay. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <SummaryCard label="Collected from patients" value={inr(totals.business)} />
                <SummaryCard label="Payable to doctors" value={inr(totals.accrued + totals.paid)} />
                <SummaryCard label="Already paid" value={inr(totals.paid)} />
                <SummaryCard label="Still to pay" value={inr(totals.accrued)} highlight />
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search doctor..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                    <input type="checkbox" checked={onlyConfigured} onChange={(e) => setOnlyConfigured(e.target.checked)} />
                    Only configured
                </label>
                <DefaultRateControl current={defaultPercent} onSaved={load} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black">
                        <tr>
                            <th className="text-left px-4 py-3">Doctor</th>
                            <th className="text-left px-4 py-3">Rate</th>
                            <th className="text-right px-4 py-3">Bills</th>
                            <th className="text-right px-4 py-3">Collected</th>
                            <th className="text-right px-4 py-3">Payable</th>
                            <th className="text-right px-4 py-3">Paid</th>
                            <th className="text-right px-4 py-3">Still to pay</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                                    <Loader2 className="h-5 w-5 animate-spin inline" /> Loading...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                                    No doctors found.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((r) => (
                                <tr key={r.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <Link href={`${basePath}/${r.id}`} className="font-bold text-gray-800 hover:text-indigo-600">
                                            {r.name}
                                        </Link>
                                        {!r.config_active && r.configured && (
                                            <span className="ml-2 text-[10px] text-red-400 font-bold">CONFIG OFF</span>
                                        )}
                                        {r.specialty && <div className="text-[11px] text-gray-400">{r.specialty}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">
                                        {r.configured ? (
                                            <>
                                                <span className="text-[11px] font-bold text-gray-400">
                                                    {COMMISSION_LABEL[r.commission_type || ''] || r.commission_type}
                                                </span>
                                                <div className="text-[11px]">{commissionSummary(r)}</div>
                                            </>
                                        ) : r.uses_default ? (
                                            <>
                                                <span className="text-[11px] font-bold text-gray-400">Default</span>
                                                <div className="text-[11px]">{defaultPercent}% (org default)</div>
                                            </>
                                        ) : (
                                            <span className="text-[11px] italic text-gray-300">not configured</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">{r.bill_count}</td>
                                    <td className="px-4 py-3 text-right">{inr(r.total_business)}</td>
                                    <td className="px-4 py-3 text-right text-amber-600 font-bold">{inr(r.commission_accrued)}</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">{inr(r.commission_paid)}</td>
                                    <td className="px-4 py-3 text-right font-bold">{inr(r.outstanding)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <Link
                                                href={`${basePath}/${r.id}/statement`}
                                                className="text-gray-400 hover:text-emerald-600"
                                                title="View payout statement"
                                            >
                                                <Wallet className="h-4 w-4" />
                                            </Link>
                                            <button
                                                onClick={() => setEditing(r)}
                                                className="text-gray-400 hover:text-indigo-600"
                                                title={r.configured ? 'Edit commission' : 'Set commission'}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {editing && (
                <ConfigModal
                    doctor={editing}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        await load();
                    }}
                    onToggleActive={async (id, active) => {
                        await setDoctorConfigActive(id, active);
                        await load();
                    }}
                />
            )}
        </div>
    );
}

function DefaultRateControl({ current, onSaved }: { current: number; onSaved: () => Promise<void> }) {
    const [value, setValue] = useState(String(current ?? 0));
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setValue(String(current ?? 0));
    }, [current]);

    const dirty = Number(value) !== Number(current);

    const save = async () => {
        setSaving(true);
        const res = await setDefaultDoctorCommission(value);
        setSaving(false);
        if (res.success) await onSaved();
        else alert(res.error || 'Failed to update default commission');
    };

    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white"
            title="Flat % applied to doctors with no commission config. 0 = disabled. Saving re-accrues their collected bills."
        >
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Default %</span>
            <input
                type="number"
                value={value}
                min={0}
                max={100}
                onChange={(e) => setValue(e.target.value)}
                className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm"
            />
            <button
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500 text-white font-bold text-xs hover:bg-indigo-600 disabled:opacity-40"
            >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
            </button>
        </div>
    );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`rounded-2xl border p-4 ${highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'}`}>
            <div className={`text-[10px] uppercase tracking-wider font-black ${highlight ? 'text-indigo-500' : 'text-gray-400'}`}>{label}</div>
            <div className={`text-lg font-black mt-1 ${highlight ? 'text-indigo-700' : 'text-gray-800'}`}>{value}</div>
        </div>
    );
}

const ctlClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

function ConfigModal({
    doctor,
    onClose,
    onSaved,
    onToggleActive,
}: {
    doctor: Row;
    onClose: () => void;
    onSaved: () => void;
    onToggleActive: (id: string, active: boolean) => void;
}) {
    const [commissionType, setCommissionType] = useState(doctor.commission_type || 'flat_percent');
    const [flatPercent, setFlatPercent] = useState(String(doctor.flat_percent ?? ''));
    const [fixedAmount, setFixedAmount] = useState(String(doctor.fixed_amount_per_bill ?? ''));
    // Bucket rates (whole OPD/IPD/... category)
    const [rates, setRates] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        for (const st of DOCTOR_SERVICE_TYPES) m[st] = '';
        for (const r of doctor.service_rates || []) if (!r.service_name) m[r.service_type] = String(r.percent);
        return m;
    });
    // Named-service rates — a specific service the doctor performs, at its own %.
    const [namedRates, setNamedRates] = useState<Array<{ service_type: string; service_name: string; percent: string }>>(
        () =>
            (doctor.service_rates || [])
                .filter((r: any) => r.service_name)
                .map((r: any) => ({ service_type: r.service_type, service_name: r.service_name, percent: String(r.percent) })),
    );
    type Opt = { name: string; category: string; rate?: number; performed?: boolean };
    const [options, setOptions] = useState<Opt[]>([]);
    const [pick, setPick] = useState('');
    const [pickType, setPickType] = useState('IPD');
    const [saving, setSaving] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (commissionType !== 'per_service' || options.length) return;
        getCommissionServiceOptions(doctor.id).then((r) => { if (r.success) setOptions(r.data as any); });
    }, [commissionType, options.length, doctor.id]);

    // The whole list is always on screen; the search box only narrows it.
    const filteredOptions = useMemo(() => {
        const q = pick.trim().toLowerCase();
        return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
    }, [options, pick]);

    const performedOptions = useMemo(() => filteredOptions.filter((o) => o.performed), [filteredOptions]);
    const otherOptions = useMemo(() => filteredOptions.filter((o) => !o.performed), [filteredOptions]);

    /** Current % typed against a service, for the active bill type. */
    const rateFor = (name: string) =>
        namedRates.find((r) => r.service_type === pickType && r.service_name.toLowerCase() === name.toLowerCase())?.percent ?? '';

    /** Typing a % adds/updates the row; clearing it removes the row entirely. */
    const setRateFor = (name: string, percent: string) =>
        setNamedRates((prev) => {
            const i = prev.findIndex(
                (r) => r.service_type === pickType && r.service_name.toLowerCase() === name.toLowerCase(),
            );
            if (percent.trim() === '') return i === -1 ? prev : prev.filter((_, j) => j !== i);
            if (i === -1) return [...prev, { service_type: pickType, service_name: name, percent }];
            return prev.map((r, j) => (j === i ? { ...r, percent } : r));
        });

    const buildPayload = () => ({
        commission_type: commissionType,
        flat_percent: flatPercent,
        fixed_amount_per_bill: fixedAmount,
        service_rates: [
            ...DOCTOR_SERVICE_TYPES.map((st) => ({ service_type: st, service_name: '', percent: rates[st] || 0 })),
            ...namedRates.map((r) => ({ service_type: r.service_type, service_name: r.service_name, percent: r.percent || 0 })),
        ].filter((r) => Number(r.percent) > 0),
    });

    const save = async () => {
        setSaving(true);
        setError(null);
        const res = await saveDoctorConfig(doctor.id, buildPayload());
        setSaving(false);
        if (!res.success) {
            setError(res.error || 'Failed to save');
            return;
        }
        onSaved();
    };

    const applyAll = async () => {
        if (!confirm('Apply this exact commission setup to EVERY active doctor?\n\nThis overwrites each doctor’s existing commission config.')) return;
        setApplying(true);
        setError(null);
        setNotice(null);
        const res = await applyDoctorConfigToAll(buildPayload());
        setApplying(false);
        if (!res.success) {
            setError(res.error || 'Failed to apply to all');
            return;
        }
        setNotice(`Applied to ${(res.data as any)?.applied} doctors.`);
        onSaved();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-black text-gray-800">Consultant Charges — {doctor.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {doctor.specialty && <p className="text-xs text-gray-400 mb-4">{doctor.specialty}</p>}

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Charge type</label>
                        <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} className={ctlClass}>
                            {DOCTOR_COMMISSION_TYPES.map((c) => (
                                <option key={c} value={c}>
                                    {COMMISSION_LABEL[c]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {commissionType === 'flat_percent' && (
                        <Labeled label="Flat percent (%)">
                            <input type="number" value={flatPercent} onChange={(e) => setFlatPercent(e.target.value)} className={ctlClass} />
                        </Labeled>
                    )}
                    {commissionType === 'fixed_per_bill' && (
                        <Labeled label="Fixed amount per bill (₹)">
                            <input type="number" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} className={ctlClass} />
                        </Labeled>
                    )}
                    {commissionType === 'per_service' && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    Default rate by bill type (%)
                                </label>
                                <p className="text-[11px] text-gray-400 mb-1">Applies to every line on that kind of bill.</p>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    {DOCTOR_SERVICE_TYPES.map((st) => (
                                        <div key={st} className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 w-20">{st}</span>
                                            <input
                                                type="number"
                                                value={rates[st]}
                                                onChange={(e) => setRates((prev) => ({ ...prev, [st]: e.target.value }))}
                                                className={ctlClass}
                                                placeholder="0"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Per-service overrides: pick the exact service the doctor performs
                                and set its own cut. Beats the bill-type rate on matching lines. */}
                            <div className="border-t border-gray-100 pt-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    Rate for a specific service (%)
                                </label>
                                <p className="text-[11px] text-gray-400 mb-2">
                                    Overrides the rate above, for that one service only.
                                </p>

                                <div className="flex items-center gap-2 mb-2">
                                    <select
                                        value={pickType}
                                        onChange={(e) => setPickType(e.target.value)}
                                        className="w-24 shrink-0 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    >
                                        {DOCTOR_SERVICE_TYPES.map((st) => <option key={st} value={st}>{st}</option>)}
                                    </select>
                                    <input
                                        value={pick}
                                        onChange={(e) => setPick(e.target.value)}
                                        placeholder="Filter services…"
                                        className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    />
                                </div>

                                {/* Every service is listed inline — nothing to open, nothing to
                                    type from memory. Services this doctor has actually billed are
                                    pinned to the top in bold; the rest are dimmed to show they have
                                    never appeared on one of their bills. */}
                                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-50">
                                    {options.length === 0 ? (
                                        <div className="px-3 py-4 text-sm text-gray-400 text-center">Loading services…</div>
                                    ) : filteredOptions.length === 0 ? (
                                        <div className="px-3 py-4 text-sm text-gray-400 text-center">No matching service.</div>
                                    ) : (
                                        <>
                                            {performedOptions.length > 0 && (
                                                <div className="sticky top-0 bg-gray-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
                                                    Done by {doctor.name} · {performedOptions.length}
                                                </div>
                                            )}
                                            {performedOptions.map((o) => (
                                                <ServiceRateRow
                                                    key={`p-${o.name}`}
                                                    name={o.name}
                                                    category={o.category}
                                                    performed
                                                    value={rateFor(o.name)}
                                                    onChange={(v) => setRateFor(o.name, v)}
                                                />
                                            ))}
                                            {otherOptions.length > 0 && (
                                                <div className="sticky top-0 bg-gray-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500">
                                                    Not billed by this doctor · {otherOptions.length}
                                                </div>
                                            )}
                                            {otherOptions.map((o) => (
                                                <ServiceRateRow
                                                    key={`o-${o.name}`}
                                                    name={o.name}
                                                    category={o.category}
                                                    value={rateFor(o.name)}
                                                    onChange={(v) => setRateFor(o.name, v)}
                                                />
                                            ))}
                                        </>
                                    )}
                                </div>

                                {namedRates.length > 0 && (
                                    <p className="mt-2 text-[11px] text-gray-500">
                                        <span className="font-black text-indigo-600">{namedRates.length}</span> service rate(s) set —
                                        clear a box to remove it.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-500">{error}</p>}
                    {notice && <p className="text-sm text-emerald-600 font-bold">{notice}</p>}

                    <div className="flex items-center justify-between pt-2">
                        {doctor.configured && (
                            <button
                                onClick={() => onToggleActive(doctor.id, !doctor.config_active)}
                                className="text-xs font-bold text-gray-400 hover:text-gray-600"
                            >
                                {doctor.config_active ? 'Disable consultant charges' : 'Enable consultant charges'}
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button
                                onClick={applyAll}
                                disabled={applying || saving}
                                title="Give every active doctor this same commission setup"
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50 disabled:opacity-50"
                            >
                                {applying && <Loader2 className="h-4 w-4 animate-spin" />} Apply to all doctors
                            </button>
                            <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">
                                Cancel
                            </button>
                            <button
                                onClick={save}
                                disabled={saving || applying}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 disabled:opacity-50"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * One row in the inline service list. `performed` = this doctor has actually
 * billed this service, so it is rendered in solid black; everything else is
 * dimmed to signal it has never appeared on one of their bills.
 */
function ServiceRateRow({
    name,
    category,
    performed,
    value,
    onChange,
}: {
    name: string;
    category: string;
    performed?: boolean;
    value: string;
    onChange: (v: string) => void;
}) {
    const set = value.trim() !== '';
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 ${set ? 'bg-indigo-50/60' : performed ? 'bg-white' : 'bg-gray-50/40'}`}>
            <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${performed ? 'font-bold text-gray-900' : 'font-normal text-gray-400'}`} title={name}>
                    {name}
                </div>
                <div className="text-[10px] text-gray-400">{category}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="—"
                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right"
                />
                <span className="text-xs text-gray-400">%</span>
            </div>
        </div>
    );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
