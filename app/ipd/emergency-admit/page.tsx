'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { AlertTriangle, Zap, Search, Bed, User, CheckCircle, UserPlus, Loader2 } from 'lucide-react';
import { admitEmergency, getAllBeds, searchPatientsForAdmission } from '@/app/actions/ipd-actions';
import { useRouter } from 'next/navigation';

export default function EmergencyAdmitPage() {
    const router = useRouter();
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [beds, setBeds] = useState<any[]>([]);
    const [admissionId, setAdmissionId] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // Live patient lookup state
    const [patientLookup, setPatientLookup] = useState<'idle' | 'loading' | 'found' | 'not_found'>('idle');
    const [foundPatient, setFoundPatient] = useState<any>(null);
    const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [form, setForm] = useState({
        is_unknown: false,
        patient_id: '',
        unknown_name: '',
        unknown_age: '',
        unknown_gender: '',
        unknown_phone: '',
        bed_id: '',
        ward_id: '',
        chief_complaint: '',
        doctor_name: '',
        deposit_amount: '',
    });

    useEffect(() => {
        getAllBeds().then(res => {
            if (res.success) {
                const available = (res.data as any[]).filter((b: any) => b.status === 'Available');
                setBeds(available);
            }
        });
    }, []);

    function setField(k: string, v: string | boolean) {
        setForm(f => ({ ...f, [k]: v }));
        // Reset patient lookup when patient_id changes
        if (k === 'patient_id') {
            setFoundPatient(null);
            if (typeof v === 'string' && v.trim().length >= 2) {
                setPatientLookup('loading');
                if (lookupTimer.current) clearTimeout(lookupTimer.current);
                lookupTimer.current = setTimeout(async () => {
                    const res = await searchPatientsForAdmission(v.trim());
                    if (res.success && res.data && res.data.length > 0) {
                        // Try exact match first, then first result
                        const exact = res.data.find((p: any) => p.patient_id === v.trim());
                        const match = exact || res.data[0];
                        setFoundPatient(match);
                        setPatientLookup('found');
                    } else {
                        setPatientLookup('not_found');
                    }
                }, 400);
            } else {
                setPatientLookup('idle');
            }
        }
    }

    function selectBed(bed: any) {
        setForm(f => ({ ...f, bed_id: bed.bed_id, ward_id: String(bed.ward_id) }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.is_unknown && !form.patient_id.trim()) { setToast('Patient ID required'); return; }
        if (!form.bed_id) { setToast('Select a bed'); return; }
        if (!form.chief_complaint.trim()) { setToast('Chief complaint required'); return; }
        setSaving(true);
        const res = await admitEmergency({
            patient_id: form.is_unknown ? undefined : form.patient_id.trim(),
            unknown_patient: form.is_unknown,
            unknown_name: form.unknown_name,
            unknown_age: form.unknown_age,
            unknown_gender: form.unknown_gender,
            unknown_phone: form.unknown_phone,
            bed_id: form.bed_id,
            ward_id: Number(form.ward_id),
            chief_complaint: form.chief_complaint,
            doctor_name: form.doctor_name || undefined,
            deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : undefined,
        });
        setSaving(false);
        if (res.success && res.data) {
            setAdmissionId(res.data.admission_id);
            setStep('success');
        } else {
            setToast(res.error || 'Admission failed');
            setTimeout(() => setToast(null), 4000);
        }
    }

    if (step === 'success') {
        return (
            <AppShell>
                <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center space-y-4">
                        <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto" />
                        <h2 className="text-xl font-black text-gray-900">Emergency Admission Created</h2>
                        <p className="text-sm text-gray-500">Admission ID: <span className="font-mono font-bold text-gray-900">{admissionId}</span></p>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => router.push(`/ipd/admission/${admissionId}`)}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700">
                                Open Admission
                            </button>
                            <button onClick={() => { setStep('form'); setForm({ is_unknown: false, patient_id: '', unknown_name: '', unknown_age: '', unknown_gender: '', unknown_phone: '', bed_id: '', ward_id: '', chief_complaint: '', doctor_name: '', deposit_amount: '' }); }}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-200">
                                New Patient
                            </button>
                        </div>
                    </div>
                </div>
            </AppShell>
        );
    }

    const availableByWard = beds.reduce((acc: any, b: any) => {
        const key = b.wards?.ward_name ?? 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(b);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <AppShell>
            <div className="min-h-screen bg-red-50 p-4">
                {toast && (
                    <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
                        {toast}
                    </div>
                )}
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3 bg-red-600 text-white rounded-2xl p-4">
                        <Zap className="h-6 w-6 flex-shrink-0" />
                        <div>
                            <h1 className="text-lg font-black">Emergency Admission</h1>
                            <p className="text-red-100 text-xs">Fast-path ER admit — minimal required fields</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Patient */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <User className="h-3.5 w-3.5" /> Patient Details
                                </h3>
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={form.is_unknown} 
                                        onChange={(e) => setField('is_unknown', e.target.checked)}
                                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    />
                                    Unknown / Unregistered Patient
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {!form.is_unknown ? (
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Patient ID *</label>
                                        <input
                                            type="text"
                                            inputMode="text"
                                            autoComplete="off"
                                            spellCheck={false}
                                            maxLength={50}
                                            required={!form.is_unknown}
                                            value={form.patient_id}
                                            onChange={e => setField('patient_id', e.target.value)}
                                            placeholder="Scan wristband or enter patient ID"
                                            className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                        {/* Live patient lookup feedback */}
                                        {patientLookup === 'loading' && (
                                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Looking up patient…
                                            </div>
                                        )}
                                        {patientLookup === 'found' && foundPatient && (
                                            <div className="mt-1.5 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                                                <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                                <span>{foundPatient.full_name}</span>
                                                {foundPatient.age && <span className="font-normal text-emerald-500">· {foundPatient.age}y</span>}
                                                {foundPatient.gender && <span className="font-normal text-emerald-500">· {foundPatient.gender}</span>}
                                            </div>
                                        )}
                                        {patientLookup === 'not_found' && form.patient_id.trim().length >= 2 && (
                                            <div className="mt-1.5 flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                                                <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
                                                Patient not in database — a new record will be auto-created on admission.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Estimated Name</label>
                                            <input
                                                type="text"
                                                inputMode="text"
                                                autoComplete="name"
                                                maxLength={100}
                                                value={form.unknown_name}
                                                onChange={e => {
                                                    // Only letters, spaces, dots, hyphens, apostrophes
                                                    const val = e.target.value.replace(/[^a-zA-Z\s.\-'()]/g, '');
                                                    setField('unknown_name', val);
                                                }}
                                                placeholder="e.g., John Doe (Unknown)"
                                                className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Estimated Age</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={4}
                                                value={form.unknown_age}
                                                onChange={e => {
                                                    // Only digits, optional leading ~, max 3 digits
                                                    const val = e.target.value.replace(/[^~0-9]/g, '');
                                                    // Allow at most one ~ at the start
                                                    const cleaned = val.replace(/~+/g, '~').replace(/^([^~]*)~(.*)$/, '$1$2');
                                                    const final = cleaned.startsWith('~')
                                                        ? '~' + cleaned.slice(1).replace(/\D/g, '').slice(0, 3)
                                                        : cleaned.replace(/\D/g, '').slice(0, 3);
                                                    setField('unknown_age', final);
                                                }}
                                                placeholder="e.g., ~30"
                                                className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Gender</label>
                                            <select value={form.unknown_gender} onChange={e => setField('unknown_gender', e.target.value)}
                                                className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400">
                                                <option value="">Select</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Contact Phone (if available)</label>
                                            <input
                                                type="tel"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                maxLength={15}
                                                value={form.unknown_phone}
                                                onChange={e => {
                                                    // Only digits, +, spaces, hyphens
                                                    const val = e.target.value.replace(/[^0-9+\-\s]/g, '');
                                                    setField('unknown_phone', val);
                                                }}
                                                placeholder="e.g., 9876543210"
                                                className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                        </div>
                                    </>
                                )}
                                <div className="col-span-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Chief Complaint *</label>
                                    <textarea
                                        required
                                        rows={2}
                                        maxLength={500}
                                        value={form.chief_complaint}
                                        onChange={e => setField('chief_complaint', e.target.value)}
                                        placeholder="Presenting complaint / reason for emergency admission"
                                        className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Attending Doctor</label>
                                    <input
                                        type="text"
                                        inputMode="text"
                                        autoComplete="off"
                                        maxLength={100}
                                        value={form.doctor_name}
                                        onChange={e => setField('doctor_name', e.target.value)}
                                        placeholder="Doctor name (optional)"
                                        className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Emergency Deposit (₹)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={9999999}
                                        step={1}
                                        value={form.deposit_amount}
                                        onChange={e => setField('deposit_amount', e.target.value)}
                                        placeholder="0"
                                        className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                                </div>
                            </div>
                        </div>

                        {/* Bed selection */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Bed className="h-3.5 w-3.5" /> Bed Assignment *
                                {form.bed_id && <span className="ml-auto text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Selected: {form.bed_id}</span>}
                            </h3>
                            {beds.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">No available beds</p>
                            ) : (
                                Object.entries(availableByWard).map(([ward, wardBeds]: [string, any]) => (
                                    <div key={ward}>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">{ward}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(wardBeds as any[]).map((b: any) => (
                                                <button key={b.bed_id} type="button" onClick={() => selectBed(b)}
                                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                                                        form.bed_id === b.bed_id
                                                            ? 'bg-red-600 border-red-600 text-white'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:border-red-400 hover:bg-red-50'
                                                    }`}>
                                                    {b.bed_id}
                                                    {b.is_isolation && <span className="ml-1 text-[9px]">🔒</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <button type="submit" disabled={saving || !form.bed_id}
                            className="w-full py-4 bg-red-600 text-white font-black text-sm rounded-2xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-200">
                            <AlertTriangle className="h-4 w-4" />
                            {saving ? 'Creating Emergency Admission…' : 'Create Emergency Admission'}
                        </button>
                    </form>
                </div>
            </div>
        </AppShell>
    );
}
