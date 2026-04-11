'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Pill, CheckCircle2, XCircle, Clock, AlertTriangle, Plus,
    Loader2, Filter, ChevronDown
} from 'lucide-react';
import {
    getTodayMedicationSchedule, administerMedication, scheduleMedication
} from '@/app/actions/ipd-nursing-actions';
import { getWardsWithBeds } from '@/app/actions/ipd-actions';

const STATUS_COLORS: Record<string, string> = {
    Scheduled: 'bg-blue-50 border-blue-200 text-blue-700',
    Administered: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    Missed: 'bg-red-50 border-red-200 text-red-700',
    Held: 'bg-amber-50 border-amber-200 text-amber-700',
    Refused: 'bg-orange-50 border-orange-200 text-orange-700',
};

export default function MedicationAdminPage() {
    const [meds, setMeds] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    const [selectedWard, setSelectedWard] = useState<number | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [adminForm, setAdminForm] = useState<Record<number, { notes: string; pain_before: string; pain_after: string; prn_reason: string }>>({});

    // Add medication modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        admission_id: '', medication_name: '', dose: '', route: 'Oral',
        frequency: 'OD', scheduled_time: '', is_prn: false, notes: '',
    });
    const [addLoading, setAddLoading] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [medsRes, wardsRes] = await Promise.all([
            getTodayMedicationSchedule(selectedWard),
            getWardsWithBeds(),
        ]);
        if (medsRes.success) setMeds(medsRes.data as any[]);
        if (wardsRes.success) setWards(wardsRes.data as any[]);
        setLoading(false);
    }, [selectedWard]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAdminister = async (medId: number, status: 'Administered' | 'Missed' | 'Held' | 'Refused') => {
        setActionLoading(medId);
        const form = adminForm[medId] ?? { notes: '', pain_before: '', pain_after: '', prn_reason: '' };
        await administerMedication({
            med_id: medId,
            status,
            administered_by: 'Nurse',
            notes: form.notes,
            pain_score_before: form.pain_before ? Number(form.pain_before) : undefined,
            pain_score_after: form.pain_after ? Number(form.pain_after) : undefined,
            prn_reason: form.prn_reason,
        });
        setExpandedId(null);
        await loadData();
        setActionLoading(null);
    };

    const handleAddMed = async () => {
        setAddLoading(true);
        await scheduleMedication({
            ...addForm,
            is_prn: addForm.is_prn,
        });
        setShowAddModal(false);
        setAddForm({ admission_id: '', medication_name: '', dose: '', route: 'Oral', frequency: 'OD', scheduled_time: '', is_prn: false, notes: '' });
        await loadData();
        setAddLoading(false);
    };

    const filtered = filterStatus === 'All' ? meds : meds.filter(m => m.status === filterStatus);

    const stats = {
        total: meds.length,
        scheduled: meds.filter(m => m.status === 'Scheduled').length,
        administered: meds.filter(m => m.status === 'Administered').length,
        missed: meds.filter(m => m.status === 'Missed').length,
    };

    const isOverdue = (m: any) => m.status === 'Scheduled' && new Date(m.scheduled_time) < new Date();

    return (
        <AppShell pageTitle="Medication Administration" pageIcon={<Pill className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Today', value: stats.total, color: 'text-gray-900' },
                        { label: 'Scheduled', value: stats.scheduled, color: 'text-blue-600' },
                        { label: 'Administered', value: stats.administered, color: 'text-emerald-600' },
                        { label: 'Missed', value: stats.missed, color: 'text-red-600' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                            <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>

                {/* Filters + Add */}
                <div className="flex flex-wrap items-center gap-3">
                    <select value={selectedWard ?? ''} onChange={e => setSelectedWard(e.target.value ? Number(e.target.value) : undefined)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white">
                        <option value="">All Wards</option>
                        {wards.map((w: any) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>)}
                    </select>
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                        {['All', 'Scheduled', 'Administered', 'Missed', 'Held'].map(s => (
                            <button key={s} onClick={() => setFilterStatus(s)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${filterStatus === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className="ml-auto">
                        <button onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors">
                            <Plus className="h-4 w-4" /> Schedule Medication
                        </button>
                    </div>
                </div>

                {/* Medication list */}
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <Pill className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No medications found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((med: any) => {
                            const overdue = isOverdue(med);
                            const isExpanded = expandedId === med.id;
                            const form = adminForm[med.id] ?? { notes: '', pain_before: '', pain_after: '', prn_reason: '' };

                            return (
                                <div key={med.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${overdue ? 'border-red-300' : 'border-gray-200'}`}>
                                    <div className="flex items-center justify-between p-4 gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-red-500' : med.status === 'Administered' ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 text-sm truncate">
                                                    {med.medication_name}
                                                    {med.is_prn && <span className="ml-2 text-[9px] font-black text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">PRN</span>}
                                                    {overdue && <span className="ml-2 text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                                                </p>
                                                <p className="text-xs text-gray-400">{med.dose} · {med.route} · {med.frequency}</p>
                                                <p className="text-xs text-gray-400">{med.patient_name} · {med.bed_id} · {med.ward_name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                <Clock className="h-3 w-3" />
                                                {new Date(med.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[med.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                {med.status}
                                            </span>
                                            {med.status === 'Scheduled' && (
                                                <button onClick={() => setExpandedId(isExpanded ? null : med.id)}
                                                    className="p-1 hover:bg-gray-100 rounded-lg">
                                                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded administration form */}
                                    {isExpanded && med.status === 'Scheduled' && (
                                        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Pain Before (0-10)</label>
                                                    <input type="number" min={0} max={10} value={form.pain_before}
                                                        onChange={e => setAdminForm(f => ({ ...f, [med.id]: { ...form, pain_before: e.target.value } }))}
                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">PRN Reason</label>
                                                    <input type="text" value={form.prn_reason}
                                                        onChange={e => setAdminForm(f => ({ ...f, [med.id]: { ...form, prn_reason: e.target.value } }))}
                                                        placeholder="If PRN, reason"
                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Notes</label>
                                                <input type="text" value={form.notes}
                                                    onChange={e => setAdminForm(f => ({ ...f, [med.id]: { ...form, notes: e.target.value } }))}
                                                    placeholder="Administration notes"
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white" />
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <button onClick={() => handleAdminister(med.id, 'Administered')}
                                                    disabled={actionLoading === med.id}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                                                    {actionLoading === med.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Administered
                                                </button>
                                                {(['Held', 'Refused', 'Missed'] as const).map(s => (
                                                    <button key={s} onClick={() => handleAdminister(med.id, s)}
                                                        disabled={actionLoading === med.id}
                                                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-300 disabled:opacity-60 transition-colors">
                                                        <XCircle className="h-3 w-3" /> {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Medication Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h3 className="font-bold text-gray-900">Schedule Medication</h3>
                        {[
                            { key: 'admission_id', label: 'Admission ID', type: 'text', placeholder: 'Enter admission ID' },
                            { key: 'medication_name', label: 'Medication', type: 'text', placeholder: 'Drug name' },
                            { key: 'dose', label: 'Dose', type: 'text', placeholder: 'e.g. 500mg' },
                        ].map(({ key, label, type, placeholder }) => (
                            <div key={key}>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{label}</label>
                                <input type={type} value={(addForm as any)[key]} placeholder={placeholder}
                                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                            </div>
                        ))}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Route</label>
                                <select value={addForm.route} onChange={e => setAddForm(f => ({ ...f, route: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                    {['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhaled'].map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Frequency</label>
                                <select value={addForm.frequency} onChange={e => setAddForm(f => ({ ...f, frequency: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                    {['OD', 'BD', 'TDS', 'QID', 'SOS', 'STAT'].map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Scheduled Time</label>
                            <input type="datetime-local" value={addForm.scheduled_time}
                                onChange={e => setAddForm(f => ({ ...f, scheduled_time: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={addForm.is_prn} onChange={e => setAddForm(f => ({ ...f, is_prn: e.target.checked }))}
                                className="rounded" />
                            PRN (as needed)
                        </label>
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleAddMed} disabled={addLoading}
                                className="flex-1 py-2.5 bg-teal-600 text-white font-bold text-sm rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
                                {addLoading ? 'Scheduling...' : 'Schedule'}
                            </button>
                            <button onClick={() => setShowAddModal(false)}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
