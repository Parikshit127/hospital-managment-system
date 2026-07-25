'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Pill, Search, CheckCircle2, Clock, Loader2, User,
    AlertTriangle, XCircle, Filter, Syringe
} from 'lucide-react';
import {
    getMedicationSchedule, administerMedication, updateMedicationStatus
} from '@/app/actions/nurse-actions';
import { useToast } from '@/app/components/ui/Toast';
import { getNursesForDropdown } from '@/app/actions/admin-actions';

// Mirrors the MedicationAdministration model. Typed deliberately: this list was
// previously `any[]`, which let a `med.dosage` typo (the column is `dose`) render
// every dose on the eMAR as "N/A" without a compile error.
type MedRow = {
    id: number;
    medication_name: string | null;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    scheduled_time: string | null;
    status: string | null;
    is_prn: boolean | null;
    notes: string | null;
    administered_at: string | null;
    administered_by: string | null;
    patientName?: string;
    patientId?: string;
    wardName?: string;
    bedId?: string;
};

export default function NurseMedicationsPage() {
    const toast = useToast();
    const [nurseId, setNurseId] = useState('');
    const [medications, setMedications] = useState<MedRow[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMode, setFilterMode] = useState<'due' | 'all'>('due');
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setNurseId(data.id || '');
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    const loadMedications = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getMedicationSchedule(undefined, filterMode);
            if (res.success) setMedications(res.data || []);
        } catch (e) {
            console.error('Failed to load medications', e);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [filterMode]);

    useEffect(() => {
        setLoading(true);
        loadMedications();
    }, [loadMedications]);

    // Set when the server refuses a dose because of a recorded allergy. The nurse
    // must then either abandon it or type an explicit override reason.
    const [allergyPrompt, setAllergyPrompt] = useState<{ medId: number; message: string } | null>(null);
    // Set when a dose is being marked Held/Refused/Missed, which requires a reason.
    const [reasonPrompt, setReasonPrompt] = useState<{ medId: number; status: string } | null>(null);
    const [reasonText, setReasonText] = useState('');
    // Set when the drug is controlled and needs a second nurse to co-sign.
    const [witnessPrompt, setWitnessPrompt] = useState<{ medId: number; message: string } | null>(null);
    const [witnessId, setWitnessId] = useState('');
    const [colleagues, setColleagues] = useState<Array<{ id: string; name?: string | null; username: string }>>([]);

    useEffect(() => {
        if (!witnessPrompt || colleagues.length) return;
        getNursesForDropdown().then(r => {
            if (r.success) setColleagues((r.data as Array<{ id: string; name?: string | null; username: string }>) ?? []);
        });
    }, [witnessPrompt, colleagues.length]);

    const handleAdminister = async (medId: number, allergyOverrideReason?: string, witnessId?: string) => {
        setActionLoading(medId);
        try {
            const res = await administerMedication(
                medId, undefined, undefined,
                (allergyOverrideReason || witnessId)
                    ? { allergy_override_reason: allergyOverrideReason, witness_id: witnessId }
                    : undefined,
            );
            if (res.success) {
                setAllergyPrompt(null);
                setWitnessPrompt(null);
                await loadMedications();
            } else if (res.error && /CONTROLLED DRUG/i.test(res.error)) {
                // A controlled drug needs a second nurse to co-sign.
                setWitnessPrompt({ medId, message: res.error });
            } else if (res.error && /ALLERGY ALERT/i.test(res.error)) {
                // Hard stop, not a toast that scrolls away.
                setAllergyPrompt({ medId, message: res.error });
            } else {
                toast.error(res.error || 'Failed to administer medication.');
            }
        } catch (e) {
            console.error('Administer error', e);
            toast.error('An error occurred.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleStatusUpdate = async (medId: number, status: string, reason?: string) => {
        // Held / Refused / Missed are only meaningful with a reason attached.
        if (!reason?.trim()) {
            setReasonPrompt({ medId, status });
            setReasonText('');
            return;
        }
        setActionLoading(medId);
        try {
            const res = await updateMedicationStatus(medId, status, reason);
            if (res.success) {
                setReasonPrompt(null);
                await loadMedications();
            } else {
                toast.error(res.error || 'Failed to update status.');
            }
        } catch (e) {
            console.error('Status update error', e);
            toast.error('An error occurred.');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredMedications = medications.filter(m => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.patientName?.toLowerCase().includes(q) ||
            m.medication_name?.toLowerCase().includes(q) ||
            m.route?.toLowerCase().includes(q)
        );
    });

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Scheduled': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'Administered': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'Held': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'Refused': return 'bg-rose-100 text-rose-800 border-rose-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Scheduled': return <Clock className="h-3 w-3" />;
            case 'Administered': return <CheckCircle2 className="h-3 w-3" />;
            case 'Held': return <AlertTriangle className="h-3 w-3" />;
            case 'Refused': return <XCircle className="h-3 w-3" />;
            default: return null;
        }
    };

    const isOverdue = (m: any) =>
        m.status === 'Scheduled' && m.scheduled_time && new Date(m.scheduled_time).getTime() < Date.now();

    const scheduledCount = medications.filter(m => m.status === 'Scheduled').length;
    const overdueCount = medications.filter(isOverdue).length;
    const administeredCount = medications.filter(m => m.status === 'Administered').length;

    return (
        <AppShell
            pageTitle="Medication Administration"
            pageIcon={<Pill className="h-5 w-5" />}
            onRefresh={loadMedications}
            refreshing={refreshing}
            headerActions={
                <div className="flex items-center gap-2">
                    {overdueCount > 0 && (
                        <span className="flex items-center gap-1 bg-red-50 text-red-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-red-200">
                            <AlertTriangle className="h-3 w-3" /> {overdueCount} OVERDUE
                        </span>
                    )}
                    {scheduledCount > 0 && (
                        <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-amber-200">
                            {scheduledCount} DUE
                        </span>
                    )}
                </div>
            }
        >
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                    { label: 'Due Now', value: scheduledCount, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
                    { label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
                    { label: 'Administered', value: administeredCount, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                ].map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-0.5">{s.label}</p>
                                <p className="text-2xl font-black text-gray-900">{s.value}</p>
                            </div>
                            <div className={`p-2.5 rounded-xl ${s.bg}`}>
                                <Icon className={`h-5 w-5 ${s.color}`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {/* Header Controls */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search patient, medication, route..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        {(['due', 'all'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setFilterMode(mode)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterMode === mode
                                    ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {mode === 'due' ? 'Due Now' : 'All'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Medication</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Dose</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Route</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Scheduled Time</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-teal-400 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredMedications.length > 0 ? (
                                filteredMedications.map((med: any) => {
                                    const isScheduled = med.status === 'Scheduled';
                                    const overdue = isOverdue(med);
                                    const isLoading = actionLoading === med.id;

                                    return (
                                        <tr key={med.id} className={`transition-colors ${overdue ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'} ${isScheduled ? '' : 'opacity-70'}`}>
                                            <td className="px-6 py-4 font-bold text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                                                        <User className="h-3.5 w-3.5 text-orange-500" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm">{med.patientName}</p>
                                                        {/* Was sliced to 8 chars, which rendered every UHID as
                                                            "#AVS-2026" — identical for every patient, so it
                                                            identified nobody. Show it in full. */}
                                                        <p className="text-[10px] text-gray-400 font-mono">
                                                            {med.patientId || '—'}
                                                            {med.wardName ? <span className="ml-1 text-gray-300">· {med.wardName}</span> : null}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <Pill className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                                    <span className="font-bold text-gray-700">{med.medication_name || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-600">{med.dose || '—'}</td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                                                    {med.route || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs">
                                                <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                                    <Clock className="h-3 w-3" />
                                                    {med.scheduled_time ? new Date(med.scheduled_time).toLocaleString() : 'N/A'}
                                                </span>
                                                {overdue && (
                                                    <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-red-600 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${getStatusStyle(med.status)}`}>
                                                    {getStatusIcon(med.status)}
                                                    {med.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isScheduled ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleAdminister(med.id)}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-white font-bold text-xs bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 px-3 py-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                                                        >
                                                            {isLoading ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Syringe className="h-3 w-3" />
                                                            )}
                                                            Administer
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(med.id, 'Held')}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                                                        >
                                                            Hold
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(med.id, 'Refused')}
                                                            disabled={isLoading}
                                                            className="inline-flex items-center gap-1 text-rose-600 font-bold text-xs bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors border border-rose-200 disabled:opacity-50"
                                                        >
                                                            Refused
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 font-bold text-xs">
                                                        {med.status === 'Administered' && med.administered_at
                                                            ? `Given at ${new Date(med.administered_at).toLocaleTimeString()}`
                                                            : med.status
                                                        }
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 whitespace-normal">
                                        <div className="max-w-md mx-auto whitespace-normal">
                                            <Pill className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                            <p className="font-bold text-gray-700">
                                                {filterMode === 'due'
                                                    ? 'No medications due right now'
                                                    : 'No medication records yet'}
                                            </p>
                                            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed whitespace-normal">
                                                This is the <span className="font-semibold text-gray-600">Medication Administration Record (eMAR)</span>.
                                                Doses appear here automatically once a doctor adds an active
                                                medication to an admitted patient&apos;s chart — then you can mark each
                                                dose <span className="font-semibold text-emerald-600">Administered</span>,{' '}
                                                <span className="font-semibold text-blue-600">Held</span> or{' '}
                                                <span className="font-semibold text-rose-600">Refused</span> here.
                                            </p>
                                            {filterMode === 'due' && (
                                                <button
                                                    onClick={() => setFilterMode('all')}
                                                    className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 underline underline-offset-2"
                                                >
                                                    View all medication records
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Allergy hard-stop. The server refuses the dose; proceeding requires a
                typed justification, which is stored on the administration record. */}
            {allergyPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border-2 border-red-300">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h2 className="text-base font-black text-red-700">Allergy conflict</h2>
                                <p className="mt-2 text-sm text-gray-700">{allergyPrompt.message}</p>
                                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                    Override reason (required to proceed)
                                </label>
                                <textarea
                                    value={reasonText}
                                    onChange={e => setReasonText(e.target.value)}
                                    rows={3}
                                    placeholder="e.g. Discussed with Dr. Rao; previous reaction was mild rash, proceeding under observation"
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-400"
                                />
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => { setAllergyPrompt(null); setReasonText(''); }}
                                        className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                                    >
                                        Do not give
                                    </button>
                                    <button
                                        disabled={reasonText.trim().length < 10}
                                        onClick={() => handleAdminister(allergyPrompt.medId, reasonText.trim())}
                                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-red-700"
                                    >
                                        Give anyway &amp; record reason
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* A controlled drug needs a second nurse to witness the dose. */}
            {witnessPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border-2 border-amber-300">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h2 className="text-base font-black text-amber-700">Second check required</h2>
                                <p className="mt-2 text-sm text-gray-700">{witnessPrompt.message}</p>
                                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                    Witnessing nurse
                                </label>
                                <select
                                    value={witnessId}
                                    onChange={e => setWitnessId(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                                >
                                    <option value="">Select a colleague…</option>
                                    {colleagues.map(c => (
                                        <option key={c.id} value={c.id}>{c.name || c.username}</option>
                                    ))}
                                </select>
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => { setWitnessPrompt(null); setWitnessId(''); }}
                                        className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={!witnessId}
                                        onClick={() => handleAdminister(witnessPrompt.medId, undefined, witnessId)}
                                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-amber-700"
                                    >
                                        Co-sign &amp; give
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Held / Refused / Missed must carry a reason. */}
            {reasonPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h2 className="text-base font-black text-gray-800">
                            Why was this dose {reasonPrompt.status.toLowerCase()}?
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                            Recorded on the medication chart against your name.
                        </p>
                        <select
                            onChange={e => setReasonText(e.target.value)}
                            defaultValue=""
                            className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400"
                        >
                            <option value="" disabled>Select a reason…</option>
                            {(reasonPrompt.status === 'Refused'
                                ? ['Patient refused', 'Patient unable to swallow', 'Family declined']
                                : reasonPrompt.status === 'Held'
                                    ? ['Held on doctor’s instruction', 'Vitals out of range', 'Nil by mouth', 'Awaiting review']
                                    : ['Patient off ward', 'Drug unavailable', 'Missed — staffing', 'Patient asleep']
                            ).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <textarea
                            value={reasonText}
                            onChange={e => setReasonText(e.target.value)}
                            rows={2}
                            placeholder="Add detail (optional)"
                            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => { setReasonPrompt(null); setReasonText(''); }}
                                className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={!reasonText.trim()}
                                onClick={() => handleStatusUpdate(reasonPrompt.medId, reasonPrompt.status, reasonText.trim())}
                                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-orange-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
