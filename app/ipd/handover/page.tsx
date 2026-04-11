'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ArrowRight, CheckCircle2, Loader2, ClipboardList,
    AlertTriangle, User, HeartPulse, Clock, ChevronDown
} from 'lucide-react';
import {
    getShiftHandoverData, saveShiftHandover, getRecentHandovers
} from '@/app/actions/ipd-nursing-actions';
import { getWardsWithBeds } from '@/app/actions/ipd-actions';

const NEWS_COLOR = (level: string) =>
    level === 'Critical' ? 'bg-red-100 text-red-700 border border-red-300' :
    level === 'High' ? 'bg-orange-100 text-orange-700' :
    level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
    'bg-emerald-100 text-emerald-700';

export default function ShiftHandoverPage() {
    const [wards, setWards] = useState<any[]>([]);
    const [selectedWard, setSelectedWard] = useState('');
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [recentHandovers, setRecentHandovers] = useState<any[]>([]);
    const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

    const [handoverForm, setHandoverForm] = useState({
        from_nurse: '',
        to_nurse: '',
        shift_type: 'Day',
        critical_alert: '',
    });

    useEffect(() => {
        getWardsWithBeds().then(res => {
            if (res.success) setWards(res.data as any[]);
        });
    }, []);

    const loadPatients = useCallback(async () => {
        if (!selectedWard) return;
        setLoading(true);
        const res = await getShiftHandoverData(Number(selectedWard));
        if (res.success) setPatients(res.data as any[]);
        const recent = await getRecentHandovers(Number(selectedWard));
        if (recent.success) setRecentHandovers(recent.data as any[]);
        setLoading(false);
    }, [selectedWard]);

    useEffect(() => { loadPatients(); }, [loadPatients]);

    const updatePatient = (admissionId: string, field: string, value: string) => {
        setPatients(ps => ps.map(p => p.admission_id === admissionId ? { ...p, [field]: value } : p));
    };

    const handleSave = async () => {
        if (!selectedWard || !handoverForm.from_nurse || !handoverForm.to_nurse) return;
        setSaving(true);
        const alerts = handoverForm.critical_alert ? [{ alert: handoverForm.critical_alert, time: new Date().toISOString() }] : [];
        await saveShiftHandover({
            ward_id: Number(selectedWard),
            from_nurse_id: handoverForm.from_nurse,
            to_nurse_id: handoverForm.to_nurse,
            shift_type: handoverForm.shift_type,
            patients,
            critical_alerts: alerts,
        });
        setSaved(true);
        setSaving(false);
        setTimeout(() => setSaved(false), 4000);
    };

    return (
        <AppShell pageTitle="Shift Handover" pageIcon={<ArrowRight className="h-5 w-5" />} onRefresh={loadPatients} refreshing={loading}>
            <div className="space-y-6">
                {/* Handover header form */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-gray-900 text-sm">Handover Details</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Ward</label>
                            <select value={selectedWard} onChange={e => setSelectedWard(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                <option value="">Select ward</option>
                                {wards.map((w: any) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Shift</label>
                            <select value={handoverForm.shift_type} onChange={e => setHandoverForm(f => ({ ...f, shift_type: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400">
                                {['Day', 'Evening', 'Night'].map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Handover From</label>
                            <input type="text" value={handoverForm.from_nurse} placeholder="Nurse name / ID"
                                onChange={e => setHandoverForm(f => ({ ...f, from_nurse: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Handover To</label>
                            <input type="text" value={handoverForm.to_nurse} placeholder="Nurse name / ID"
                                onChange={e => setHandoverForm(f => ({ ...f, to_nurse: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Critical Alerts (Ward-Level)</label>
                        <input type="text" value={handoverForm.critical_alert} placeholder="Any ward-wide alerts (e.g. crash cart checked, isolation breach)"
                            onChange={e => setHandoverForm(f => ({ ...f, critical_alert: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400" />
                    </div>
                </div>

                {/* Patient handover cards */}
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                ) : !selectedWard ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <ClipboardList className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">Select a ward to start handover</p>
                    </div>
                ) : patients.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <p className="text-gray-400">No admitted patients in this ward</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-700">{patients.length} Patients — {selectedWard ? wards.find(w => w.ward_id === Number(selectedWard))?.ward_name : ''}</h3>
                        </div>
                        {patients.map((p: any) => {
                            const isExpanded = expandedPatient === p.admission_id;
                            const newsLevel = p.news_level ?? 'Low';
                            return (
                                <div key={p.admission_id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between p-4 cursor-pointer"
                                        onClick={() => setExpandedPatient(isExpanded ? null : p.admission_id)}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
                                                <User className="h-4 w-4 text-gray-500" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{p.patient_name}</p>
                                                <p className="text-xs text-gray-400">Bed {p.bed_id} · {p.diagnosis ?? 'Diagnosis pending'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {p.news_score != null && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${NEWS_COLOR(newsLevel)}`}>
                                                    NEWS {p.news_score}
                                                </span>
                                            )}
                                            {p.fall_risk > 45 && (
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                    FALL RISK
                                                </span>
                                            )}
                                            {p.code_status && p.code_status !== 'Full' && (
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                                    {p.code_status}
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                                <Clock className="h-3 w-3" />
                                                {p.pending_tasks} tasks
                                            </div>
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                                            {/* Medications due */}
                                            {p.medications_due?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Medications Due Next</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {p.medications_due.map((m: any, i: number) => (
                                                            <span key={i} className="flex items-center gap-1 text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-gray-700">
                                                                <HeartPulse className="h-3 w-3 text-blue-500" />
                                                                {m.name} {m.dose} · {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Key concerns */}
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Key Concerns for Incoming Nurse</label>
                                                <textarea rows={2} value={p.key_concerns ?? ''}
                                                    onChange={e => updatePatient(p.admission_id, 'key_concerns', e.target.value)}
                                                    placeholder="e.g. Wound dressing due at 22:00, family anxious, pending CRP result"
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white resize-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Plan for This Shift</label>
                                                <textarea rows={2} value={p.plan_for_shift ?? ''}
                                                    onChange={e => updatePatient(p.admission_id, 'plan_for_shift', e.target.value)}
                                                    placeholder="e.g. Monitor BP hourly, NPO after midnight, prep for OT tomorrow 8AM"
                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white resize-none" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Save handover */}
                {patients.length > 0 && (
                    <div className="flex justify-end gap-3">
                        {saved && (
                            <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold">
                                <CheckCircle2 className="h-4 w-4" /> Handover saved successfully
                            </div>
                        )}
                        <button onClick={handleSave} disabled={saving || !handoverForm.from_nurse || !handoverForm.to_nurse}
                            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            Complete Handover
                        </button>
                    </div>
                )}

                {/* Recent handovers */}
                {recentHandovers.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 text-sm">Recent Handovers</h3>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {recentHandovers.slice(0, 5).map((h: any) => (
                                <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {h.shift_type ?? 'Shift'} Handover — {h.from_nurse_id} → {h.to_nurse_id}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {new Date(h.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                            {h.acknowledged_by && <span className="ml-2 text-emerald-600 font-semibold">✓ Acknowledged</span>}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
