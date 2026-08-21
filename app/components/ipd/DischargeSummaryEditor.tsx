'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Sparkles, Save, Printer, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import {
    getDischargeSummary,
    saveDischargeSummary,
    generateDischargeSummaryDraft,
} from '@/app/actions/discharge-summary-actions';
import { emptyDischargeData, toIstLocalInput, DISCHARGE_TYPES, type DischargeSummaryData } from '@/app/lib/discharge-summary';
import { DischargeMicButton } from './DischargeMicButton';

type Header = {
    patient_name: string; age_gender: string; indoor_no: string; uhid: string;
    consulting_doctor: string; ward: string; bed_no: string; floor: string;
    class_applicable: string; admission_dt: string; discharge_dt: string; discharge_status: string;
    discharge_type: string;
    discharge_dt_input: string;
};

const nowIstLocal = () => toIstLocalInput(new Date());

export function DischargeSummaryEditor({ admissionId }: { admissionId: string }) {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [drafting, setDrafting] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [savedOnce, setSavedOnce] = useState(false);
    const [showProcedure, setShowProcedure] = useState(false);
    const [header, setHeader] = useState<Header | null>(null);
    const [data, setData] = useState<DischargeSummaryData>(emptyDischargeData());
    // Discharge date/time captured here. Saving it moves the patient to
    // "Semi Discharged" — bed stays occupied, bill stays Draft.
    const [dischargeDateTime, setDischargeDateTime] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getDischargeSummary(admissionId);
        if (res.success) {
            setData(res.data as DischargeSummaryData);
            setHeader(res.header as Header);
            setSavedOnce(!!res.saved);
            setDischargeDateTime((res.header as Header)?.discharge_dt_input || nowIstLocal());
            // Auto-expand the procedure block if it already has content.
            const d = res.data as DischargeSummaryData;
            if (d.procedure_name || d.operative_notes || d.surgeon) setShowProcedure(true);
        } else {
            toast.error(res.error || 'Failed to load discharge summary');
        }
        setLoading(false);
        setDirty(false);
    }, [admissionId, toast]);

    useEffect(() => { load(); }, [load]);

    const set = (k: keyof DischargeSummaryData, v: string) => {
        setData(prev => ({ ...prev, [k]: v }));
        setDirty(true);
    };

    // Voice dictation appends onto existing text instead of overwriting it, so a
    // doctor can click the mic multiple times to build up a multi-line field
    // (e.g. dictate one complaint per click). Single-line Field-type fields join
    // with ", " instead of a newline since they render as one line.
    const appendField = (k: keyof DischargeSummaryData, text: string, separator: '\n' | ', ') => {
        setData(prev => {
            const existing = prev[k];
            return { ...prev, [k]: existing ? `${existing}${separator}${text}` : text };
        });
        setDirty(true);
    };

    async function handleSave(): Promise<boolean> {
        if (!dischargeDateTime) {
            toast.error('Please enter the discharge date and time.');
            return false;
        }
        setSaving(true);
        const res = await saveDischargeSummary(admissionId, data, dischargeDateTime);
        setSaving(false);
        if (res.success) {
            toast.success('Discharge summary saved');
            setDirty(false);
            setSavedOnce(true);
            return true;
        }
        toast.error(res.error || 'Failed to save');
        return false;
    }

    async function handleAiDraft() {
        if (!confirm('Generate an AI draft from the patient\'s clinical data? It will fill empty narrative fields — your existing text is kept.')) return;
        setDrafting(true);
        const res = await generateDischargeSummaryDraft(admissionId);
        setDrafting(false);
        if (!res.success || !res.data) {
            toast.error(res.error || 'AI draft failed');
            return;
        }
        // Merge: only fill fields the doctor hasn't already written.
        const ai = res.data as DischargeSummaryData;
        const narrativeKeys: (keyof DischargeSummaryData)[] = [
            'final_diagnosis_primary', 'final_diagnosis_secondary', 'icd_code', 'complaints',
            'medical_history', 'investigations', 'operative_notes', 'course',
            'discharge_medications', 'follow_up', 'discharge_condition',
        ];
        setData(prev => {
            const next = { ...prev };
            for (const k of narrativeKeys) {
                if (!String(prev[k] || '').trim() && String(ai[k] || '').trim()) next[k] = ai[k];
            }
            return next;
        });
        setDirty(true);
        if (ai.operative_notes?.trim()) setShowProcedure(true);
        toast.success('AI draft inserted into empty fields — review before saving');
    }

    async function handlePrint() {
        // Print reads the saved DB row, so persist any pending edits first.
        if (dirty || !savedOnce) {
            const ok = await handleSave();
            if (!ok) return;
        }
        window.open(`/api/discharge/${admissionId}/summary`, '_blank');
    }

    if (loading) {
        return (
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Action bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <FileText className="h-4.5 w-4.5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900">Discharge Summary</h3>
                        <p className="text-[11px] text-gray-500">{savedOnce ? 'Saved' : 'Not yet saved'}{dirty ? ' · unsaved changes' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleAiDraft} disabled={drafting || saving}
                        className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl disabled:opacity-50">
                        {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI Draft
                    </button>
                    <button onClick={handleSave} disabled={saving || drafting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                    </button>
                    <button onClick={handlePrint} disabled={saving || drafting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-xs font-bold rounded-xl disabled:opacity-50">
                        <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                </div>
            </div>

            {/* Patient header (auto-filled, a few editable overrides) */}
            {header && (
                <Section title="Patient Information">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                        <Info label="Patient" value={header.patient_name} />
                        <Info label="Age / Gender" value={header.age_gender} />
                        <Info label="UHID" value={header.uhid} />
                        <Info label="Ward" value={header.ward} />
                        <Info label="Bed" value={header.bed_no} />
                        <Info label="Floor" value={header.floor} />
                        <Info label="Admitted" value={header.admission_dt} />
                        <div>
                            <p className="text-gray-500">Discharge Date &amp; Time</p>
                            <input
                                type="datetime-local"
                                value={dischargeDateTime}
                                max={nowIstLocal()}
                                onChange={e => { setDischargeDateTime(e.target.value); setDirty(true); }}
                                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                            />
                        </div>
                        <Info label="Status" value={header.discharge_status} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                        <Field label={`Indoor No. (default: ${header.indoor_no})`} value={data.indoor_no} onChange={v => set('indoor_no', v)} placeholder={header.indoor_no} />
                        <Field label={`Consulting Doctor (default: ${header.consulting_doctor})`} value={data.consulting_doctor} onChange={v => set('consulting_doctor', v)} placeholder={header.consulting_doctor} />
                        <Field label={`Class Applicable (default: ${header.class_applicable})`} value={data.class_applicable} onChange={v => set('class_applicable', v)} placeholder={header.class_applicable} />
                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 mb-1">
                                {`Discharge Type (default: ${header.discharge_type})`}
                            </label>
                            <select
                                value={data.discharge_type}
                                onChange={e => set('discharge_type', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                <option value="">— Leave unchanged —</option>
                                {DISCHARGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                </Section>
            )}

            <Section title="Final Diagnosis">
                <Field label="Primary Diagnosis" value={data.final_diagnosis_primary} onChange={v => set('final_diagnosis_primary', v)}
                    mic={{ onResult: t => appendField('final_diagnosis_primary', t, ', ') }} />
                <Field label="Secondary Diagnosis (if any)" value={data.final_diagnosis_secondary} onChange={v => set('final_diagnosis_secondary', v)}
                    mic={{ onResult: t => appendField('final_diagnosis_secondary', t, ', ') }} />
                <Field label="ICD Code" value={data.icd_code} onChange={v => set('icd_code', v)} />
            </Section>

            <Section title="Complaints on Admission">
                <Area value={data.complaints} onChange={v => set('complaints', v)} rows={3} hint="One complaint per line"
                    mic={{ onResult: t => appendField('complaints', t, '\n') }} />
            </Section>

            <Section title="Medical History">
                <Area value={data.medical_history} onChange={v => set('medical_history', v)} rows={2} placeholder="Past medical history / N/A"
                    mic={{ onResult: t => appendField('medical_history', t, '\n') }} />
            </Section>

            <Section title="Investigations">
                <Area value={data.investigations} onChange={v => set('investigations', v)} rows={3} hint="One investigation per line"
                    mic={{ onResult: t => appendField('investigations', t, '\n') }} />
            </Section>

            {/* Surgery / procedure — collapsible (optional for medical-only admissions) */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <button onClick={() => setShowProcedure(s => !s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Surgery / Procedure Performed</span>
                    {showProcedure ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {showProcedure && (
                    <div className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Name of Surgery / Procedure" value={data.procedure_name} onChange={v => set('procedure_name', v)} />
                            <Field label="Procedure Date" value={data.procedure_date} onChange={v => set('procedure_date', v)} placeholder="DD/MM/YYYY" />
                            <Field label="Surgeon" value={data.surgeon} onChange={v => set('surgeon', v)} />
                            <Field label="Assistant Surgeon" value={data.assistant_surgeon} onChange={v => set('assistant_surgeon', v)} />
                            <Field label="Anaesthetist" value={data.anaesthetist} onChange={v => set('anaesthetist', v)} />
                            <Field label="Anaesthesia Type" value={data.anaesthesia_type} onChange={v => set('anaesthesia_type', v)} placeholder="General / Spinal / Local" />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 mb-1">
                                Operative Notes
                                <DischargeMicButton onResult={t => appendField('operative_notes', t, '\n')} />
                            </label>
                            <Area value={data.operative_notes} onChange={v => set('operative_notes', v)} rows={3} />
                        </div>
                    </div>
                )}
            </div>

            <Section title="Course During Hospitalization">
                <Area value={data.course} onChange={v => set('course', v)} rows={6}
                    hint="Admission condition, assessment, procedure, post-op recovery, monitoring, condition at discharge, follow-up"
                    mic={{ onResult: t => appendField('course', t, '\n') }} />
            </Section>

            <Section title="Discharge Medications">
                <Area value={data.discharge_medications} onChange={v => set('discharge_medications', v)} rows={4} hint="One per line: Name – Dose – Frequency – Duration"
                    mic={{ onResult: t => appendField('discharge_medications', t, '\n') }} />
            </Section>

            <Section title="Discharge Instructions">
                <Area value={data.discharge_instructions} onChange={v => set('discharge_instructions', v)} rows={4} hint="One instruction per line"
                    mic={{ onResult: t => appendField('discharge_instructions', t, '\n') }} />
            </Section>

            <Section title="Follow-Up">
                <Area value={data.follow_up} onChange={v => set('follow_up', v)} rows={2} placeholder="Review after X days with Dr. ... in OPD."
                    mic={{ onResult: t => appendField('follow_up', t, '\n') }} />
            </Section>

            <Section title="Discharge Condition">
                <Area value={data.discharge_condition} onChange={v => set('discharge_condition', v)} rows={2}
                    mic={{ onResult: t => appendField('discharge_condition', t, '\n') }} />
            </Section>

            <Section title="Sign-off">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Prepared By" value={data.prepared_by} onChange={v => set('prepared_by', v)} />
                    <Field label="Verified By" value={data.verified_by} onChange={v => set('verified_by', v)} placeholder="Hospital authority" />
                </div>
            </Section>

            <div className="flex justify-end gap-2 pb-4">
                <button onClick={handleSave} disabled={saving || drafting}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Summary
                </button>
                <button onClick={handlePrint} disabled={saving || drafting}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-bold rounded-xl disabled:opacity-50">
                    <Printer className="h-4 w-4" /> Save & Print
                </button>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{title}</h4>
            {children}
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className="block text-[10px] font-bold text-gray-400 uppercase">{label}</span>
            <span className="text-gray-900 font-medium">{value}</span>
        </div>
    );
}

type MicProp = { onResult: (text: string) => void };

function Field({ label, value, onChange, placeholder, mic }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mic?: MicProp }) {
    return (
        <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 mb-1">
                {label}
                {mic && <DischargeMicButton onResult={mic.onResult} />}
            </label>
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
        </div>
    );
}

function Area({ value, onChange, rows = 3, hint, placeholder, mic }: { value: string; onChange: (v: string) => void; rows?: number; hint?: string; placeholder?: string; mic?: MicProp }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                {hint ? <p className="text-[10px] text-gray-400">{hint}</p> : <span />}
                {mic && <DischargeMicButton onResult={mic.onResult} />}
            </div>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={rows}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
        </div>
    );
}
