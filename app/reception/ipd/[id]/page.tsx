'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
    Bed, ArrowLeft, Loader2, User, Phone, Mail, MapPin,
    Droplets, Stethoscope, Building2, CalendarCheck, Calendar,
    Clock, FileText, Receipt, CreditCard, Activity, Printer,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getAdmissionDetail } from '@/app/actions/ipd-actions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatMoney(amount: number | null | undefined): string {
    if (amount == null) return '₹0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

function calcDays(start: string | null | undefined, end?: string | null): number | null {
    if (!start) return null;
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    if (isNaN(s.getTime())) return null;
    const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}

function getStatusBadge(status: string) {
    const map: Record<string, string> = {
        Admitted: 'bg-blue-50 text-blue-700 border-blue-200',
        Discharged: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Cancelled: 'bg-red-50 text-red-700 border-red-200',
    };
    return map[status] || 'bg-gray-100 text-gray-500 border-gray-200';
}

function getInvoiceStatusBadge(status: string) {
    const map: Record<string, string> = {
        Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Partial: 'bg-amber-50 text-amber-700 border-amber-200',
        Unpaid: 'bg-red-50 text-red-700 border-red-200',
        Pending: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return map[status] || 'bg-gray-100 text-gray-500 border-gray-200';
}

function parseDetails(details: string): React.ReactNode {
    if (!details) return <span className="text-gray-400 text-xs italic">No details</span>;
    try {
        const parsed = JSON.parse(details);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {Object.entries(parsed).map(([k, v]) => (
                        <div key={k} className="flex gap-1.5">
                            <dt className="text-[10px] font-semibold text-gray-400 uppercase shrink-0 pt-0.5">
                                {k.replace(/_/g, ' ')}:
                            </dt>
                            <dd className="text-xs text-gray-700">{String(v)}</dd>
                        </div>
                    ))}
                </dl>
            );
        }
        return <p className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</p>;
    } catch {
        return <p className="text-xs text-gray-700 whitespace-pre-wrap">{details}</p>;
    }
}

function getNoteTypeBadge(noteType: string) {
    const map: Record<string, string> = {
        'Progress Note': 'bg-blue-50 text-blue-700 border-blue-200',
        'Doctor Note': 'bg-violet-50 text-violet-700 border-violet-200',
        'Nursing Note': 'bg-teal-50 text-teal-700 border-teal-200',
        'Discharge Summary': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'Lab Result': 'bg-amber-50 text-amber-700 border-amber-200',
    };
    return map[noteType] || 'bg-gray-100 text-gray-600 border-gray-200';
}

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <div className="shrink-0 text-gray-400 mt-0.5">{icon}</div>
            <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <div className="text-sm text-gray-800 font-medium mt-0.5">{value}</div>
            </div>
        </div>
    );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'billing' | 'notes';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="h-3.5 w-3.5" /> },
    { key: 'billing', label: 'Billing', icon: <CreditCard className="h-3.5 w-3.5" /> },
    { key: 'notes', label: 'Notes', icon: <FileText className="h-3.5 w-3.5" /> },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IPDAdmissionDetailPage() {
    const params = useParams();
    const admissionId = params.id as string;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getAdmissionDetail(admissionId);
        if (res.success) setData(res.data);
        setLoading(false);
    }, [admissionId]);

    useEffect(() => { loadData(); }, [loadData]);

    const headerActions = (
        <div className="flex items-center gap-2">
            <button
                onClick={() => window.open(`/api/admission/${encodeURIComponent(admissionId)}/admission-form`, '_blank')}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-colors"
                title="Print patient admission form"
            >
                <Printer className="h-3.5 w-3.5" /> Print Admission Form
            </button>
            {data?.patient?.patient_id && (
                <button
                    onClick={() => window.open(`/api/patient/${encodeURIComponent(data.patient.patient_id)}/stickers?count=8`, '_blank')}
                    className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold rounded-xl hover:bg-orange-100 transition-colors"
                    title="Print patient stickers"
                >
                    <Printer className="h-3.5 w-3.5" /> Print Stickers
                </button>
            )}
            <Link
                href="/reception/ipd"
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors"
            >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to IPD
            </Link>
        </div>
    );

    if (loading) {
        return (
            <AppShell pageTitle="Admission Detail" pageIcon={<Bed className="h-5 w-5" />} headerActions={headerActions}>
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            </AppShell>
        );
    }

    if (!data) {
        return (
            <AppShell pageTitle="Admission Detail" pageIcon={<Bed className="h-5 w-5" />} headerActions={headerActions}>
                <div className="flex flex-col items-center justify-center py-32 gap-3">
                    <Bed className="h-12 w-12 text-gray-200" />
                    <p className="text-sm font-medium text-gray-400">Admission not found</p>
                </div>
            </AppShell>
        );
    }

    const { patient, ward, bed, medical_notes = [], invoices = [] } = data;

    const daysAdmitted = calcDays(data.admission_date, data.discharge_date);

    // Billing summary
    const totalBilled = invoices.reduce((s: number, inv: any) => s + Number(inv.net_amount || 0), 0);
    const totalPaid = invoices.reduce((s: number, inv: any) => s + Number(inv.paid_amount || 0), 0);
    const totalBalance = invoices.reduce((s: number, inv: any) => s + Number(inv.balance_due || 0), 0);

    const wardName = ward?.ward_name || bed?.wards?.ward_name || '—';
    const bedDisplay = bed ? `Bed ${bed.bed_number || bed.bed_id}` : '—';

    return (
        <AppShell
            pageTitle={patient?.full_name || 'Admission Detail'}
            pageIcon={<Bed className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">

                {/* Header: Admission ID + status */}
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        {data.admission_id}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1.5 text-[10px] font-bold rounded-xl border ${getStatusBadge(data.status)}`}>
                        {data.status}
                    </span>
                </div>

                {/* Patient Info Card */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-6">

                        {/* Avatar + Left info */}
                        <div className="flex items-start gap-4 flex-1">
                            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-teal-500/20 shrink-0">
                                {patient?.full_name?.charAt(0) || 'P'}
                            </div>
                            <div className="space-y-3 flex-1">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900">{patient?.full_name || '—'}</h2>
                                    <p className="text-xs font-mono text-emerald-600 mt-0.5">{patient?.patient_id || '—'}</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <InfoRow
                                        icon={<User className="h-3.5 w-3.5" />}
                                        label="Age / Gender"
                                        value={[patient?.age ? `${patient.age}y` : null, patient?.gender].filter(Boolean).join(' · ') || '—'}
                                    />
                                    <InfoRow
                                        icon={<Phone className="h-3.5 w-3.5" />}
                                        label="Phone"
                                        value={patient?.phone || '—'}
                                    />
                                    <InfoRow
                                        icon={<Mail className="h-3.5 w-3.5" />}
                                        label="Email"
                                        value={patient?.email || '—'}
                                    />
                                    <InfoRow
                                        icon={<Droplets className="h-3.5 w-3.5" />}
                                        label="Blood Group"
                                        value={
                                            patient?.blood_group
                                                ? <span className="font-bold text-red-600">{patient.blood_group}</span>
                                                : '—'
                                        }
                                    />
                                    <div className="sm:col-span-2">
                                        <InfoRow
                                            icon={<MapPin className="h-3.5 w-3.5" />}
                                            label="Address"
                                            value={patient?.address || '—'}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block w-px self-stretch bg-gray-100" />

                        {/* Right: Admission info */}
                        <div className="space-y-3 md:w-64 shrink-0">
                            <InfoRow
                                icon={<Stethoscope className="h-3.5 w-3.5" />}
                                label="Doctor"
                                value={data.doctor_name || '—'}
                            />
                            <InfoRow
                                icon={<Building2 className="h-3.5 w-3.5" />}
                                label="Ward / Bed"
                                value={`${wardName} · ${bedDisplay}`}
                            />
                            <InfoRow
                                icon={<CalendarCheck className="h-3.5 w-3.5" />}
                                label="Admission Date"
                                value={formatDate(data.admission_date)}
                            />
                            {data.discharge_date && (
                                <InfoRow
                                    icon={<Calendar className="h-3.5 w-3.5" />}
                                    label="Discharge Date"
                                    value={formatDate(data.discharge_date)}
                                />
                            )}
                            <InfoRow
                                icon={<Clock className="h-3.5 w-3.5" />}
                                label="Days Admitted"
                                value={
                                    daysAdmitted != null
                                        ? <span>{daysAdmitted} day{daysAdmitted !== 1 ? 's' : ''}</span>
                                        : '—'
                                }
                            />
                            <InfoRow
                                icon={<Bed className="h-3.5 w-3.5" />}
                                label="Admission Type"
                                value={data.admission_type || '—'}
                            />
                            <InfoRow
                                icon={<Activity className="h-3.5 w-3.5" />}
                                label="Diagnosis"
                                value={data.diagnosis || '—'}
                            />
                        </div>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.key
                                    ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Overview Tab ── */}
                {activeTab === 'overview' && (
                    <div className="space-y-4">

                        {/* Diagnosis card */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5" /> Diagnosis
                            </h3>
                            <p className="text-sm text-gray-800 leading-relaxed">
                                {data.diagnosis || <span className="text-gray-300 italic">No diagnosis recorded</span>}
                            </p>
                        </div>

                        {/* Admission timeline */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" /> Admission Timeline
                            </h3>
                            <div className="space-y-0">
                                {/* Admission event */}
                                <TimelineItem
                                    icon={<CalendarCheck className="h-3.5 w-3.5" />}
                                    color="bg-teal-500"
                                    title="Admitted"
                                    subtitle={`${data.doctor_name || '—'} · ${wardName} · ${bedDisplay} · ${data.admission_type || '—'}`}
                                    date={formatDateTime(data.admission_date)}
                                    isLast={!data.discharge_date}
                                />
                                {data.discharge_date && (
                                    <TimelineItem
                                        icon={<Calendar className="h-3.5 w-3.5" />}
                                        color="bg-emerald-500"
                                        title="Discharged"
                                        subtitle={
                                            daysAdmitted != null
                                                ? `Duration: ${daysAdmitted} day${daysAdmitted !== 1 ? 's' : ''}`
                                                : undefined
                                        }
                                        date={formatDateTime(data.discharge_date)}
                                        isLast
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Billing Tab ── */}
                {activeTab === 'billing' && (
                    <div className="space-y-4">
                        {invoices.length === 0 ? (
                            <div className="bg-white border border-gray-200 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
                                <CreditCard className="h-8 w-8 text-gray-200" />
                                <p className="text-sm font-medium text-gray-400">No invoices found</p>
                            </div>
                        ) : (
                            invoices.map((inv: any) => (
                                <div key={inv.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    {/* Invoice header */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono font-bold text-emerald-600">
                                                #{inv.invoice_number}
                                            </span>
                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getInvoiceStatusBadge(inv.status)}`}>
                                                {inv.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-5">
                                            <div className="text-right">
                                                <p className="text-[10px] font-semibold text-gray-400 uppercase">Billed</p>
                                                <p className="text-sm font-bold text-gray-900">{formatMoney(inv.net_amount)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-semibold text-gray-400 uppercase">Paid</p>
                                                <p className="text-sm font-bold text-emerald-600">{formatMoney(inv.paid_amount)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-semibold text-gray-400 uppercase">Balance</p>
                                                <p className={`text-sm font-bold ${Number(inv.balance_due) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {formatMoney(inv.balance_due)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Payments table */}
                                    {(inv.payments && inv.payments.length > 0) ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-gray-100">
                                                        {['Receipt #', 'Method', 'Amount', 'Date', 'Status', ''].map(h => (
                                                            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {inv.payments.map((payment: any) => (
                                                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-3">
                                                                <span className="text-xs font-mono font-bold text-gray-700">
                                                                    {payment.receipt_number || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                                                {payment.payment_method || '—'}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs font-bold text-emerald-700 whitespace-nowrap">
                                                                {formatMoney(payment.amount)}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                                {formatDateTime(payment.created_at)}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getInvoiceStatusBadge(payment.status)}`}>
                                                                    {payment.status || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <button
                                                                    onClick={() => window.open(`/api/payment/${payment.id}/receipt`, '_blank')}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                                                                >
                                                                    <Receipt className="h-3 w-3" /> Receipt
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="px-5 py-4 text-xs text-gray-400 italic">No payments recorded for this invoice.</p>
                                    )}
                                </div>
                            ))
                        )}

                        {/* Billing summary */}
                        {invoices.length > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing Summary</p>
                                <div className="flex items-center gap-8">
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Billed</p>
                                        <p className="text-lg font-black text-gray-900">{formatMoney(totalBilled)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Paid</p>
                                        <p className="text-lg font-black text-emerald-600">{formatMoney(totalPaid)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase">Balance Due</p>
                                        <p className={`text-lg font-black ${totalBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {formatMoney(totalBalance)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Notes Tab ── */}
                {activeTab === 'notes' && (
                    <div className="space-y-3">
                        {medical_notes.length === 0 ? (
                            <div className="bg-white border border-gray-200 rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
                                <FileText className="h-8 w-8 text-gray-200" />
                                <p className="text-sm font-medium text-gray-400">No medical notes recorded</p>
                            </div>
                        ) : (
                            medical_notes.map((note: any) => (
                                <div key={note.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-3 gap-3">
                                        <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold rounded-full border ${getNoteTypeBadge(note.note_type)}`}>
                                            {note.note_type || 'Note'}
                                        </span>
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                            {formatDateTime(note.created_at)}
                                        </span>
                                    </div>
                                    <div className="mt-1">
                                        {parseDetails(note.details)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

function TimelineItem({
    icon, color, title, subtitle, date, isLast,
}: {
    icon: React.ReactNode;
    color: string;
    title: string;
    subtitle?: string;
    date: string;
    isLast?: boolean;
}) {
    return (
        <div className="flex gap-3">
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 ${color}`}>
                    {icon}
                </div>
                {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[24px]" />}
            </div>
            <div className="pb-5 flex-1">
                <p className="text-sm font-bold text-gray-800">{title}</p>
                {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">{date}</p>
            </div>
        </div>
    );
}
