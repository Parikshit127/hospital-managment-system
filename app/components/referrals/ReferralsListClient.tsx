'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users, UserCheck, Loader2, Pencil, X } from 'lucide-react';
import {
    getReferralsOverview,
    createReferrer,
    updateReferrer,
    setReferrerActive,
} from '@/app/actions/referral-actions';
import { REFERRER_CATEGORIES, COMMISSION_TYPES, REFERRAL_SERVICE_TYPES } from '@/app/lib/referral-constants';

type ServiceRate = { service_type: string; percent: number };
type Row = {
    id: string;
    name: string;
    category: string;
    phone?: string | null;
    is_active: boolean;
    commission_type: string;
    flat_percent?: number | null;
    fixed_amount_per_patient?: number | null;
    service_rates: ServiceRate[];
    patient_count: number;
    bill_count: number;
    total_business: number;
    commission_accrued: number;
    commission_paid: number;
    outstanding: number;
};

const CATEGORY_LABEL: Record<string, string> = {
    staff: 'Staff',
    affiliate: 'Affiliate',
    interpreter: 'Interpreter',
    rmp: 'RMP',
    others: 'Others',
};
const COMMISSION_LABEL: Record<string, string> = {
    flat_percent: 'Flat %',
    per_service: 'By service',
    fixed_per_patient: 'Fixed / patient',
};

const inr = (n: number) =>
    '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function commissionSummary(r: Row): string {
    if (r.commission_type === 'flat_percent') return `${r.flat_percent ?? 0}%`;
    if (r.commission_type === 'fixed_per_patient') return inr(r.fixed_amount_per_patient ?? 0) + '/patient';
    if (r.commission_type === 'per_service')
        return r.service_rates.map((s) => `${s.service_type} ${s.percent}%`).join(', ') || 'no rates';
    return '—';
}

export default function ReferralsListClient({ basePath }: { basePath: string }) {
    const [rows, setRows] = useState<Row[]>([]);
    const [selfCount, setSelfCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Row | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await getReferralsOverview();
        if (res.success) {
            setRows(res.data as Row[]);
            setSelfCount(res.selfCount);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(
        () =>
            rows.filter((r) => {
                if (categoryFilter && r.category !== categoryFilter) return false;
                if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
                return true;
            }),
        [rows, search, categoryFilter],
    );

    const totals = useMemo(() => {
        return filtered.reduce(
            (acc, r) => {
                acc.patients += r.patient_count;
                acc.business += r.total_business;
                acc.accrued += r.commission_accrued;
                acc.paid += r.commission_paid;
                return acc;
            },
            { patients: 0, business: 0, accrued: 0, paid: 0 },
        );
    }, [filtered]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <UserCheck className="h-6 w-6 text-teal-500" /> Consultant Charges
                    </h1>
                    <p className="text-sm text-gray-400">Manage referrers, commission rates and payouts.</p>
                </div>
                <button
                    onClick={() => {
                        setEditing(null);
                        setModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600"
                >
                    <Plus className="h-4 w-4" /> Add Referrer
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <SummaryCard icon={<Users className="h-4 w-4" />} label="Self / Walk-in" value={String(selfCount)} />
                <SummaryCard label="Referred patients" value={String(totals.patients)} />
                <SummaryCard label="Business (collected)" value={inr(totals.business)} />
                <SummaryCard label="Commission accrued" value={inr(totals.accrued)} />
                <SummaryCard label="Commission paid" value={inr(totals.paid)} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search referrer..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
                >
                    <option value="">All categories</option>
                    {REFERRER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                        </option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black">
                        <tr>
                            <th className="text-left px-4 py-3">Referrer</th>
                            <th className="text-left px-4 py-3">Category</th>
                            <th className="text-left px-4 py-3">Commission</th>
                            <th className="text-right px-4 py-3">Patients</th>
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
                                <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                                    <Loader2 className="h-5 w-5 animate-spin inline" /> Loading...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                                    No referrers yet. Add one to get started.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((r) => (
                                <tr key={r.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <Link href={`${basePath}/${r.id}`} className="font-bold text-gray-800 hover:text-teal-600">
                                            {r.name}
                                        </Link>
                                        {!r.is_active && <span className="ml-2 text-[10px] text-red-400 font-bold">INACTIVE</span>}
                                        {r.phone && <div className="text-[11px] text-gray-400">{r.phone}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
                                            {CATEGORY_LABEL[r.category] || r.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">
                                        <span className="text-[11px] font-bold text-gray-400">{COMMISSION_LABEL[r.commission_type]}</span>
                                        <div className="text-[11px]">{commissionSummary(r)}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right">{r.patient_count}</td>
                                    <td className="px-4 py-3 text-right">{r.bill_count}</td>
                                    <td className="px-4 py-3 text-right">{inr(r.total_business)}</td>
                                    <td className="px-4 py-3 text-right text-amber-600 font-bold">{inr(r.commission_accrued)}</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">{inr(r.commission_paid)}</td>
                                    <td className="px-4 py-3 text-right font-bold">{inr(r.outstanding)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setEditing(r);
                                                setModalOpen(true);
                                            }}
                                            className="text-gray-400 hover:text-teal-600"
                                            title="Edit"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {modalOpen && (
                <ReferrerModal
                    editing={editing}
                    onClose={() => setModalOpen(false)}
                    onSaved={async () => {
                        setModalOpen(false);
                        await load();
                    }}
                    onToggleActive={async (id, active) => {
                        await setReferrerActive(id, active);
                        await load();
                    }}
                />
            )}
        </div>
    );
}

function SummaryCard({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-black flex items-center gap-1">
                {icon} {label}
            </div>
            <div className="text-lg font-black text-gray-800 mt-1">{value}</div>
        </div>
    );
}

function ReferrerModal({
    editing,
    onClose,
    onSaved,
    onToggleActive,
}: {
    editing: Row | null;
    onClose: () => void;
    onSaved: () => void;
    onToggleActive: (id: string, active: boolean) => void;
}) {
    const [name, setName] = useState(editing?.name || '');
    const [category, setCategory] = useState(editing?.category || 'rmp');
    const [phone, setPhone] = useState(editing?.phone || '');
    const [commissionType, setCommissionType] = useState(editing?.commission_type || 'flat_percent');
    const [flatPercent, setFlatPercent] = useState(String(editing?.flat_percent ?? ''));
    const [fixedAmount, setFixedAmount] = useState(String(editing?.fixed_amount_per_patient ?? ''));
    const [rates, setRates] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        for (const st of REFERRAL_SERVICE_TYPES) m[st] = '';
        for (const r of editing?.service_rates || []) m[r.service_type] = String(r.percent);
        return m;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!name.trim()) {
            setError('Name is required');
            return;
        }
        setSaving(true);
        setError(null);
        const payload = {
            name: name.trim(),
            category,
            phone,
            commission_type: commissionType,
            flat_percent: flatPercent,
            fixed_amount_per_patient: fixedAmount,
            service_rates: REFERRAL_SERVICE_TYPES.map((st) => ({ service_type: st, percent: rates[st] || 0 })).filter(
                (r) => Number(r.percent) > 0,
            ),
        };
        const res = editing ? await updateReferrer(editing.id, payload) : await createReferrer(payload);
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
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-black text-gray-800">{editing ? 'Edit Referrer' : 'Add Referrer'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-3">
                    <Field label="Name *">
                        <input value={name} onChange={(e) => setName(e.target.value)} className={ctlClass} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Category">
                            <select value={category} onChange={(e) => setCategory(e.target.value)} className={ctlClass}>
                                {REFERRER_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {CATEGORY_LABEL[c]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Phone">
                            <input value={phone || ''} onChange={(e) => setPhone(e.target.value)} className={ctlClass} />
                        </Field>
                    </div>

                    <Field label="Commission type">
                        <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} className={ctlClass}>
                            {COMMISSION_TYPES.map((c) => (
                                <option key={c} value={c}>
                                    {COMMISSION_LABEL[c]}
                                </option>
                            ))}
                        </select>
                    </Field>

                    {commissionType === 'flat_percent' && (
                        <Field label="Flat percent (%)">
                            <input
                                type="number"
                                value={flatPercent}
                                onChange={(e) => setFlatPercent(e.target.value)}
                                className={ctlClass}
                            />
                        </Field>
                    )}

                    {commissionType === 'fixed_per_patient' && (
                        <Field label="Fixed amount per patient (₹)">
                            <input
                                type="number"
                                value={fixedAmount}
                                onChange={(e) => setFixedAmount(e.target.value)}
                                className={ctlClass}
                            />
                        </Field>
                    )}

                    {commissionType === 'per_service' && (
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Rates by service (%)</label>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                {REFERRAL_SERVICE_TYPES.map((st) => (
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
                        {editing && (
                            <button
                                onClick={() => onToggleActive(editing.id, !editing.is_active)}
                                className="text-xs font-bold text-gray-400 hover:text-gray-600"
                            >
                                {editing.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">
                                Cancel
                            </button>
                            <button
                                onClick={save}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600 disabled:opacity-50"
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

const ctlClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
