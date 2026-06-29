'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, Pencil, X, Stethoscope, Wallet, BarChart3 } from 'lucide-react';
import {
    getDoctorCommissionOverview,
    saveDoctorConfig,
    setDoctorConfigActive,
    setDefaultDoctorCommission,
} from '@/app/actions/doctor-commission-actions';
import { DOCTOR_COMMISSION_TYPES, DOCTOR_SERVICE_TYPES } from '@/app/lib/doctor-commission-constants';

type ServiceRate = { service_type: string; percent: number };
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
    if (r.commission_type === 'per_service')
        return r.service_rates.map((s) => `${s.service_type} ${s.percent}%`).join(', ') || 'no rates';
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
                        <Stethoscope className="h-6 w-6 text-indigo-500" /> Doctor Invoicing & Commission
                    </h1>
                    <p className="text-sm text-gray-400">Per-bill commission for the doctor assigned to each invoice.</p>
                </div>
                {/* Shortcut into the MIS "Doctor Wise Revenue Summary" report (admin/finance portal). */}
                <Link
                    href={`/${basePath.split('/')[1]}/mis/revenue-doctor-wise-summary`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 hover:text-indigo-600"
                >
                    <BarChart3 className="h-4 w-4" /> Doctor Revenue Summary
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <SummaryCard label="Business (collected)" value={inr(totals.business)} />
                <SummaryCard label="Commission accrued" value={inr(totals.accrued)} />
                <SummaryCard label="Commission paid" value={inr(totals.paid)} />
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
                            <th className="text-left px-4 py-3">Commission</th>
                            <th className="text-right px-4 py-3">Bills</th>
                            <th className="text-right px-4 py-3">Business</th>
                            <th className="text-right px-4 py-3">Accrued</th>
                            <th className="text-right px-4 py-3">Paid</th>
                            <th className="text-right px-4 py-3">Outstanding</th>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-black">{label}</div>
            <div className="text-lg font-black text-gray-800 mt-1">{value}</div>
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
    const [rates, setRates] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        for (const st of DOCTOR_SERVICE_TYPES) m[st] = '';
        for (const r of doctor.service_rates || []) m[r.service_type] = String(r.percent);
        return m;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setSaving(true);
        setError(null);
        const payload = {
            commission_type: commissionType,
            flat_percent: flatPercent,
            fixed_amount_per_bill: fixedAmount,
            service_rates: DOCTOR_SERVICE_TYPES.map((st) => ({ service_type: st, percent: rates[st] || 0 })).filter(
                (r) => Number(r.percent) > 0,
            ),
        };
        const res = await saveDoctorConfig(doctor.id, payload);
        setSaving(false);
        if (!res.success) {
            setError(res.error || 'Failed to save');
            return;
        }
        onSaved();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-black text-gray-800">Commission — {doctor.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {doctor.specialty && <p className="text-xs text-gray-400 mb-4">{doctor.specialty}</p>}

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Commission type</label>
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
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Rates by service (%)</label>
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
                    )}

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex items-center justify-between pt-2">
                        {doctor.configured && (
                            <button
                                onClick={() => onToggleActive(doctor.id, !doctor.config_active)}
                                className="text-xs font-bold text-gray-400 hover:text-gray-600"
                            >
                                {doctor.config_active ? 'Disable commission' : 'Enable commission'}
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">
                                Cancel
                            </button>
                            <button
                                onClick={save}
                                disabled={saving}
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
