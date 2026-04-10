'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, X, CheckCircle, Shield, Loader2 } from 'lucide-react';
import { getPatientAllergies, addPatientAllergy, resolveAllergy, checkDrugAllergyInteraction } from '@/app/actions/emr-actions';

export type Allergy = {
    id: string;
    allergen_name: string;
    allergen_type: string;
    reaction: string | null;
    severity: string;
    status: string;
};

interface AllergyManagerProps {
    patientId: string;
    readonly?: boolean;
    onAllergyCheck?: (drugName: string) => Promise<{ blocked: boolean; alert?: { allergen: string; severity: string; reaction: string | null } }>;
}

const SEVERITY_COLOR: Record<string, string> = {
    mild: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    moderate: 'bg-orange-100 text-orange-700 border-orange-200',
    severe: 'bg-red-100 text-red-700 border-red-200',
    life_threatening: 'bg-red-600 text-white border-red-700',
};

const EMPTY_FORM = {
    allergen_name: '',
    allergen_type: 'drug',
    reaction: '',
    severity: 'moderate',
};

export function AllergyManager({ patientId, readonly }: AllergyManagerProps) {
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        load();
    }, [patientId]);

    async function load() {
        setLoading(true);
        const r = await getPatientAllergies(patientId);
        if (r.success) setAllergies(r.data as Allergy[]);
        setLoading(false);
    }

    async function handleAdd() {
        if (!form.allergen_name.trim()) { setError('Allergen name is required'); return; }
        setSaving(true);
        setError('');
        const r = await addPatientAllergy({ patient_id: patientId, ...form });
        if (r.success) {
            setShowAddForm(false);
            setForm(EMPTY_FORM);
            await load();
        } else {
            setError(r.error || 'Failed to add allergy');
        }
        setSaving(false);
    }

    async function handleResolve(id: string) {
        await resolveAllergy(id);
        await load();
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-xs text-gray-400">Loading allergies...</span>
            </div>
        );
    }

    const hasSevere = allergies.some(a => a.severity === 'severe' || a.severity === 'life_threatening');

    return (
        <div className="space-y-3">
            {/* Allergy Banner */}
            {allergies.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-bold text-emerald-700">No Known Allergies (NKA)</span>
                </div>
            ) : (
                <div className={`px-3 py-2.5 rounded-xl border ${hasSevere ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${hasSevere ? 'text-red-600' : 'text-amber-600'}`} />
                        <span className={`text-sm font-black ${hasSevere ? 'text-red-700' : 'text-amber-700'}`}>
                            Known Allergies ({allergies.length})
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {allergies.map(a => (
                            <span key={a.id} className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.moderate}`}>
                                <Shield className="h-2.5 w-2.5" />
                                {a.allergen_name}
                                <span className="opacity-60 text-[9px] uppercase">({a.severity})</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Allergy List (detailed) */}
            {allergies.length > 0 && (
                <div className="space-y-2">
                    {allergies.map(a => (
                        <div key={a.id} className="flex items-start justify-between p-2.5 bg-white border border-gray-200 rounded-xl">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900">{a.allergen_name}</span>
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.moderate}`}>
                                        {a.severity}
                                    </span>
                                    <span className="text-[10px] text-gray-400 capitalize">{a.allergen_type}</span>
                                </div>
                                {a.reaction && <p className="text-xs text-gray-500 mt-0.5">Reaction: {a.reaction}</p>}
                            </div>
                            {!readonly && (
                                <button
                                    onClick={() => handleResolve(a.id)}
                                    className="text-xs text-gray-400 hover:text-gray-600 ml-3 flex-shrink-0"
                                    title="Mark as resolved"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add Allergy Form */}
            {!readonly && (
                <>
                    {!showAddForm ? (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add Allergy
                        </button>
                    ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
                            {error && <p className="text-xs text-red-600">{error}</p>}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Allergen *</label>
                                    <input
                                        className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-500"
                                        value={form.allergen_name}
                                        onChange={e => setForm(f => ({ ...f, allergen_name: e.target.value }))}
                                        placeholder="e.g. Penicillin"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Type</label>
                                    <select className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none" value={form.allergen_type} onChange={e => setForm(f => ({ ...f, allergen_type: e.target.value }))}>
                                        <option value="drug">Drug</option>
                                        <option value="food">Food</option>
                                        <option value="environmental">Environmental</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Severity</label>
                                    <select className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                                        <option value="mild">Mild</option>
                                        <option value="moderate">Moderate</option>
                                        <option value="severe">Severe</option>
                                        <option value="life_threatening">Life Threatening</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Reaction</label>
                                    <input
                                        className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-teal-500"
                                        value={form.reaction}
                                        onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))}
                                        placeholder="e.g. Anaphylaxis"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleAdd} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50">
                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                    Add
                                </button>
                                <button onClick={() => { setShowAddForm(false); setError(''); }} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Drug-Allergy Alert Modal ───────────────────────────────────────────────

interface DrugAllergyAlertProps {
    drugName: string;
    alert: { allergen: string; severity: string; reaction: string | null };
    onConfirm: () => void;
    onCancel: () => void;
}

export function DrugAllergyAlertModal({ drugName, alert, onConfirm, onCancel }: DrugAllergyAlertProps) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="bg-red-600 p-5">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-white" />
                        <div>
                            <h3 className="text-lg font-black text-white">⚠ ALLERGY ALERT</h3>
                            <p className="text-red-100 text-sm">Drug-Allergy Interaction Detected</p>
                        </div>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-sm font-bold text-red-900">
                            Patient is allergic to <span className="underline">{alert.allergen}</span>
                        </p>
                        <p className="text-sm text-red-700 mt-1">
                            Severity: <span className="font-black uppercase">{alert.severity}</span>
                        </p>
                        {alert.reaction && (
                            <p className="text-sm text-red-700">Reaction: {alert.reaction}</p>
                        )}
                        <p className="text-xs text-red-600 mt-2">
                            Prescribed drug <strong>{drugName}</strong> may trigger this allergy.
                        </p>
                    </div>
                    <p className="text-sm text-gray-700">
                        Do you want to proceed with prescribing <strong>{drugName}</strong> despite the known allergy?
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                        >
                            Cancel — Do Not Prescribe
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all"
                        >
                            Override — Prescribe Anyway
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Hook for drug-allergy checking ────────────────────────────────────────

export function useDrugAllergyCheck(patientId: string) {
    const [alertState, setAlertState] = useState<{
        drugName: string;
        alert: { allergen: string; severity: string; reaction: string | null };
        resolve: (confirmed: boolean) => void;
    } | null>(null);

    async function checkDrug(drugName: string): Promise<boolean> {
        const result = await checkDrugAllergyInteraction(patientId, drugName);
        if (!result.success || !result.alert) return true; // no allergy → proceed

        return new Promise<boolean>(resolve => {
            setAlertState({
                drugName,
                alert: result.alert!,
                resolve: (confirmed: boolean) => {
                    setAlertState(null);
                    resolve(confirmed);
                },
            });
        });
    }

    const modal = alertState ? (
        <DrugAllergyAlertModal
            drugName={alertState.drugName}
            alert={alertState.alert}
            onConfirm={() => alertState.resolve(true)}
            onCancel={() => alertState.resolve(false)}
        />
    ) : null;

    return { checkDrug, modal };
}
