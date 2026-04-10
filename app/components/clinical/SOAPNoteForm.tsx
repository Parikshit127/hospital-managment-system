'use client';

import React, { useState } from 'react';
import { Save, Loader2, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { ICD10Search, type ICD10Selection } from './ICD10Search';
import { AllergyManager, useDrugAllergyCheck } from './AllergyManager';
import { updateEncounter, signEncounter, recordVitals } from '@/app/actions/emr-actions';
import { useToast } from '@/app/components/ui/Toast';

interface SOAPNoteFormProps {
    encounterId: string;
    patientId: string;
    doctorId: string;
    appointmentId?: string;
    initialData?: {
        subjective?: Record<string, unknown>;
        objective?: Record<string, unknown>;
        assessment?: ICD10Selection[];
        plan?: Record<string, unknown>;
        status?: string;
    };
    onSaved?: () => void;
}

type Tab = 'subjective' | 'objective' | 'assessment' | 'plan';

const TABS: { id: Tab; label: string }[] = [
    { id: 'subjective', label: 'S — Subjective' },
    { id: 'objective', label: 'O — Objective' },
    { id: 'assessment', label: 'A — Assessment' },
    { id: 'plan', label: 'P — Plan' },
];

const inputCls = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-medium outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 resize-none";
const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] block mb-1.5";

export function SOAPNoteForm({ encounterId, patientId, doctorId, initialData, onSaved }: SOAPNoteFormProps) {
    const toast = useToast();
    const isLocked = initialData?.status === 'completed';
    const { checkDrug, modal: allergyModal } = useDrugAllergyCheck(patientId);

    const [activeTab, setActiveTab] = useState<Tab>('subjective');
    const [isSaving, setIsSaving] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const [showVitals, setShowVitals] = useState(false);

    // Subjective
    const [chiefComplaint, setChiefComplaint] = useState(
        (initialData?.subjective as Record<string, string>)?.chief_complaint || ''
    );
    const [hpi, setHpi] = useState((initialData?.subjective as Record<string, string>)?.hpi || '');
    const [socialHistory, setSocialHistory] = useState(
        (initialData?.subjective as Record<string, string>)?.social_history || ''
    );
    const [familyHistory, setFamilyHistory] = useState(
        (initialData?.subjective as Record<string, string>)?.family_history || ''
    );

    // Objective / Vitals
    const [bp, setBp] = useState('');
    const [hr, setHr] = useState('');
    const [temp, setTemp] = useState('');
    const [spo2, setSpo2] = useState('');
    const [rr, setRr] = useState('');
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [bloodSugar, setBloodSugar] = useState('');
    const [painScale, setPainScale] = useState('');
    const [physicalExam, setPhysicalExam] = useState(
        (initialData?.objective as Record<string, string>)?.physical_exam || ''
    );

    // Assessment
    const [diagnoses, setDiagnoses] = useState<ICD10Selection[]>(
        (initialData?.assessment as ICD10Selection[]) || []
    );

    // Plan
    const [medications, setMedications] = useState(
        ((initialData?.plan as Record<string, string[]>)?.medications || []).join('\n')
    );
    const [labOrders, setLabOrders] = useState(
        ((initialData?.plan as Record<string, string[]>)?.lab_orders || []).join('\n')
    );
    const [instructions, setInstructions] = useState(
        (initialData?.plan as Record<string, string>)?.instructions || ''
    );
    const [followUp, setFollowUp] = useState(
        (initialData?.plan as Record<string, string>)?.follow_up || ''
    );

    async function handleSaveVitals() {
        if (!bp && !hr && !temp) return;
        await recordVitals({
            patient_id: patientId,
            encounter_id: encounterId,
            blood_pressure: bp || undefined,
            heart_rate: hr ? parseInt(hr) : undefined,
            temperature: temp ? parseFloat(temp) : undefined,
            oxygen_sat: spo2 ? parseInt(spo2) : undefined,
            respiratory_rate: rr ? parseInt(rr) : undefined,
            weight: weight ? parseFloat(weight) : undefined,
            height: height ? parseFloat(height) : undefined,
            blood_sugar: bloodSugar ? parseFloat(bloodSugar) : undefined,
            pain_scale: painScale ? parseInt(painScale) : undefined,
        });
        toast.success('Vitals saved');
    }

    async function handleSave() {
        setIsSaving(true);
        const res = await updateEncounter(encounterId, {
            subjective: { chief_complaint: chiefComplaint, hpi, social_history: socialHistory, family_history: familyHistory },
            objective: { physical_exam: physicalExam },
            assessment: diagnoses.map(d => ({
                diagnosis_text: d.name,
                icd10_code: d.code,
                icd10_description: d.name,
                type: d.type,
                status: d.status,
            })),
            plan: {
                medications: medications.split('\n').filter(Boolean),
                lab_orders: labOrders.split('\n').filter(Boolean),
                instructions,
                follow_up: followUp,
            },
        });
        if (res.success) {
            toast.success('Encounter saved');
            onSaved?.();
        } else {
            toast.error('Failed to save encounter');
        }
        setIsSaving(false);
    }

    async function handleSign() {
        setIsSigning(true);
        await handleSave();
        const res = await signEncounter(encounterId, doctorId);
        if (res.success) {
            toast.success('Encounter signed and locked');
            onSaved?.();
        } else {
            toast.error('Failed to sign encounter');
        }
        setIsSigning(false);
    }

    async function handleAddMedication(med: string) {
        const proceed = await checkDrug(med);
        if (proceed) {
            setMedications(prev => prev ? `${prev}\n${med}` : med);
        }
    }

    return (
        <div className="space-y-4">
            {allergyModal}

            {/* Allergy section (always visible) */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className={labelCls}>Patient Allergies</p>
                <AllergyManager patientId={patientId} readonly={isLocked} />
            </div>

            {/* SOAP Tabs */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {/* Tab headers */}
                <div className="flex border-b border-gray-200 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                                activeTab === tab.id
                                    ? 'border-b-2 border-teal-500 text-teal-600 bg-teal-50/50'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {/* Subjective */}
                    {activeTab === 'subjective' && (
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>Chief Complaint *</label>
                                <input
                                    className={inputCls}
                                    value={chiefComplaint}
                                    onChange={e => setChiefComplaint(e.target.value)}
                                    placeholder="Primary reason for visit..."
                                    disabled={isLocked}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>History of Present Illness</label>
                                <textarea
                                    className={inputCls}
                                    rows={4}
                                    value={hpi}
                                    onChange={e => setHpi(e.target.value)}
                                    placeholder="Onset, duration, character, aggravating/relieving factors..."
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Social History</label>
                                    <textarea
                                        className={inputCls}
                                        rows={2}
                                        value={socialHistory}
                                        onChange={e => setSocialHistory(e.target.value)}
                                        placeholder="Smoking, alcohol, occupation..."
                                        disabled={isLocked}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Family History</label>
                                    <textarea
                                        className={inputCls}
                                        rows={2}
                                        value={familyHistory}
                                        onChange={e => setFamilyHistory(e.target.value)}
                                        placeholder="Relevant family medical history..."
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Objective */}
                    {activeTab === 'objective' && (
                        <div className="space-y-4">
                            {/* Vitals collapsible */}
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowVitals(!showVitals)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all"
                                >
                                    <span>Vitals Entry</span>
                                    {showVitals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                                {showVitals && (
                                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'BP (mmHg)', value: bp, set: setBp, placeholder: '120/80' },
                                            { label: 'Heart Rate', value: hr, set: setHr, placeholder: '72 bpm' },
                                            { label: 'Temp (°F)', value: temp, set: setTemp, placeholder: '98.6' },
                                            { label: 'SpO₂ (%)', value: spo2, set: setSpo2, placeholder: '98' },
                                            { label: 'RR (/min)', value: rr, set: setRr, placeholder: '16' },
                                            { label: 'Weight (kg)', value: weight, set: setWeight, placeholder: '70' },
                                            { label: 'Height (cm)', value: height, set: setHeight, placeholder: '170' },
                                            { label: 'Blood Sugar', value: bloodSugar, set: setBloodSugar, placeholder: 'mg/dL' },
                                            { label: 'Pain (0-10)', value: painScale, set: setPainScale, placeholder: '0' },
                                        ].map(v => (
                                            <div key={v.label}>
                                                <label className={labelCls}>{v.label}</label>
                                                <input
                                                    className={`${inputCls} py-2`}
                                                    value={v.value}
                                                    onChange={e => v.set(e.target.value)}
                                                    placeholder={v.placeholder}
                                                    disabled={isLocked}
                                                />
                                            </div>
                                        ))}
                                        {!isLocked && (
                                            <div className="col-span-2 md:col-span-4 flex justify-end">
                                                <button
                                                    onClick={handleSaveVitals}
                                                    className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700"
                                                >
                                                    Save Vitals
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className={labelCls}>Physical Examination</label>
                                <textarea
                                    className={inputCls}
                                    rows={6}
                                    value={physicalExam}
                                    onChange={e => setPhysicalExam(e.target.value)}
                                    placeholder="General appearance, systemic examination findings..."
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                    )}

                    {/* Assessment */}
                    {activeTab === 'assessment' && (
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>ICD-10 Diagnoses</label>
                                <p className="text-xs text-gray-400 mb-2">First diagnosis is Primary. Click type badge to cycle (Primary → Secondary → Rule Out).</p>
                                <ICD10Search
                                    selected={diagnoses}
                                    onChange={setDiagnoses}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                    )}

                    {/* Plan */}
                    {activeTab === 'plan' && (
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>Medications (one per line)</label>
                                <textarea
                                    className={inputCls}
                                    rows={4}
                                    value={medications}
                                    onChange={e => setMedications(e.target.value)}
                                    onBlur={async e => {
                                        const lines = e.target.value.split('\n').filter(Boolean);
                                        const last = lines[lines.length - 1];
                                        if (last) await handleAddMedication(last);
                                    }}
                                    placeholder="Tab. Paracetamol 500mg TDS x 5 days&#10;Syrup Amoxicillin 125mg BD x 7 days"
                                    disabled={isLocked}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Drug-allergy check runs on blur from this field.</p>
                            </div>
                            <div>
                                <label className={labelCls}>Lab Orders (one per line)</label>
                                <textarea
                                    className={inputCls}
                                    rows={3}
                                    value={labOrders}
                                    onChange={e => setLabOrders(e.target.value)}
                                    placeholder="CBC&#10;LFT&#10;Chest X-Ray"
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Follow-up</label>
                                    <input
                                        className={inputCls}
                                        value={followUp}
                                        onChange={e => setFollowUp(e.target.value)}
                                        placeholder="After 7 days / as needed"
                                        disabled={isLocked}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Patient Instructions</label>
                                    <textarea
                                        className={inputCls}
                                        rows={2}
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                        placeholder="Rest, hydration, diet instructions..."
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Actions */}
            {!isLocked && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-gray-400">Auto-saved on tab change. Sign to lock the record.</p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Draft
                        </button>
                        <button
                            onClick={handleSign}
                            disabled={isSigning || diagnoses.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50"
                            title={diagnoses.length === 0 ? 'Add at least one diagnosis before signing' : ''}
                        >
                            {isSigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                            Sign & Lock
                        </button>
                    </div>
                </div>
            )}
            {isLocked && (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl">
                    <Lock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-bold text-gray-600">Encounter signed and locked. Editing requires an addendum.</span>
                </div>
            )}
        </div>
    );
}
