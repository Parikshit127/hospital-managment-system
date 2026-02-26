'use client';

import React, { useState } from 'react';
import {
    Zap, AlertTriangle, CheckCircle, Users, ArrowRight, X,
    Plus, Shield, Stethoscope, FlaskConical,
    HeartPulse, Loader2, FileText, ChevronRight,
    Siren, Clipboard
} from 'lucide-react';
import { performTriage } from '@/app/actions/triage-actions';
import { AppShell } from '@/app/components/layout/AppShell';

const COMMON_SYMPTOMS = [
    'Fever', 'Headache', 'Cough', 'Chest Pain', 'Abdominal Pain',
    'Back Pain', 'Nausea', 'Vomiting', 'Diarrhea', 'Dizziness',
    'Shortness of Breath', 'Fatigue', 'Joint Pain', 'Skin Rash',
    'Sore Throat', 'Eye Pain', 'Ear Pain', 'Difficulty Breathing',
    'High Fever', 'Severe Headache', 'Seizure', 'Severe Bleeding',
    'Loss of Consciousness', 'Broken Bone'
];

export default function TriagePage() {
    // Patient Info
    const [patientName, setPatientName] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    // Symptoms
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
    const [customSymptom, setCustomSymptom] = useState('');
    const [duration, setDuration] = useState('');
    const [severity, setSeverity] = useState('Moderate');

    // Medical History
    const [pmh, setPmh] = useState('');
    const [currentMeds, setCurrentMeds] = useState('');
    const [allergies, setAllergies] = useState('');

    // Vitals
    const [bp, setBp] = useState('');
    const [hr, setHr] = useState('');
    const [temp, setTemp] = useState('');
    const [spo2, setSpo2] = useState('');

    // UI State
    const [isTriaging, setIsTriaging] = useState(false);
    const [triageResult, setTriageResult] = useState<any>(null);
    const [step, setStep] = useState(1); // 1=patient info, 2=symptoms, 3=history+vitals

    const toggleSymptom = (symptom: string) => {
        setSelectedSymptoms(prev =>
            prev.includes(symptom)
                ? prev.filter(s => s !== symptom)
                : [...prev, symptom]
        );
    };

    const addCustomSymptom = () => {
        if (customSymptom.trim() && !selectedSymptoms.includes(customSymptom.trim())) {
            setSelectedSymptoms(prev => [...prev, customSymptom.trim()]);
            setCustomSymptom('');
        }
    };

    const handleTriage = async () => {
        if (!patientName || selectedSymptoms.length === 0) {
            alert('Please provide patient name and at least one symptom');
            return;
        }
        setIsTriaging(true);
        try {
            const result = await performTriage({
                patientName,
                phone,
                email,
                symptoms: selectedSymptoms,
                duration,
                severity,
                pastMedicalHistory: pmh,
                currentMedications: currentMeds,
                allergies,
                age: age ? parseInt(age) : undefined,
                gender,
                vitals: {
                    bloodPressure: bp || undefined,
                    heartRate: hr ? parseInt(hr) : undefined,
                    temperature: temp ? parseFloat(temp) : undefined,
                    oxygenSat: spo2 ? parseInt(spo2) : undefined,
                }
            });

            if (result.success) {
                setTriageResult(result.data);
            } else {
                alert('Triage failed: ' + result.error);
            }
        } catch (err) {
            console.error(err);
            alert('Error performing triage');
        } finally {
            setIsTriaging(false);
        }
    };

    const handleRegisterAndTriage = async () => {
        // First register, then triage
        handleTriage();
    };

    const resetForm = () => {
        setPatientName(''); setAge(''); setGender(''); setPhone(''); setEmail('');
        setSelectedSymptoms([]); setDuration(''); setSeverity('Moderate');
        setPmh(''); setCurrentMeds(''); setAllergies('');
        setBp(''); setHr(''); setTemp(''); setSpo2('');
        setTriageResult(null); setStep(1);
    };

    const getTriageBadge = (level: string) => {
        const config: Record<string, { bg: string; border: string; text: string; icon: any; pulse: string }> = {
            'Emergency': { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: Siren, pulse: 'animate-pulse' },
            'Urgent': { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle, pulse: '' },
            'Routine': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle, pulse: '' },
        };
        const c = config[level] || config['Routine'];
        const Icon = c.icon;
        return (
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${c.bg} ${c.border} border ${c.text} ${c.pulse}`}>
                <Icon className="h-4 w-4" />
                <span className="font-black text-sm uppercase tracking-wider">{level}</span>
            </div>
        );
    };

    return (
        <AppShell pageTitle="AI Triage" pageIcon={<Zap className="h-5 w-5" />}>

            <div className="max-w-7xl mx-auto">
                {triageResult ? (
                    /* ============== TRIAGE RESULT VIEW ============== */
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black tracking-tight text-gray-900">Triage Assessment Complete</h2>
                                <p className="text-gray-500 font-medium mt-1">AI-generated clinical triage for {patientName}</p>
                            </div>
                            <button onClick={resetForm} className="px-5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all flex items-center gap-2">
                                <Plus className="h-3.5 w-3.5" /> New Patient
                            </button>
                        </div>

                        {/* TRIAGE LEVEL BANNER */}
                        <div className={`rounded-2xl p-6 border ${triageResult.triageLevel === 'Emergency' ? 'bg-red-500/5 border-red-500/20' :
                            triageResult.triageLevel === 'Urgent' ? 'bg-amber-500/5 border-amber-500/20' :
                                'bg-emerald-500/5 border-emerald-500/20'
                            }`}>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    {getTriageBadge(triageResult.triageLevel)}
                                    <div>
                                        <h3 className="font-black text-gray-900 text-lg">{patientName}</h3>
                                        <p className="text-gray-500 text-sm font-medium">
                                            {age && `${age}y`}{gender && ` / ${gender}`} · {selectedSymptoms.length} symptoms reported
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    {triageResult.patientId && (
                                        <div className="px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                                            <span className="text-[10px] font-black text-teal-400/60 uppercase tracking-wider block">Patient ID</span>
                                            <span className="text-sm font-black text-teal-400 font-mono">{triageResult.patientId}</span>
                                        </div>
                                    )}
                                    {triageResult.appointmentId && (
                                        <div className="px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                            <span className="text-[10px] font-black text-violet-400/60 uppercase tracking-wider block">Appointment</span>
                                            <span className="text-sm font-black text-violet-400 font-mono">{triageResult.appointmentId}</span>
                                        </div>
                                    )}
                                    {triageResult.generatedPassword && (
                                        <div className="px-4 py-2 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                                            <span className="text-[10px] font-black text-pink-500/80 uppercase tracking-wider block">Portal Password (Give to Patient)</span>
                                            <span className="text-sm font-black text-pink-600 font-mono">{triageResult.generatedPassword}</span>
                                        </div>
                                    )}
                                    <div className="px-4 py-2 bg-gray-100 border border-gray-200 rounded-xl">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Department</span>
                                        <span className="text-sm font-black text-gray-900">{triageResult.recommendedDepartment}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* RISK ALERTS */}
                            {triageResult.riskAlerts.length > 0 && (
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden lg:col-span-2">
                                    <div className="p-4 border-b border-gray-200">
                                        <h4 className="font-black text-rose-400 text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5" /> Risk Alerts ({triageResult.riskAlerts.length})
                                        </h4>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        {triageResult.riskAlerts.map((alert: string, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                <Shield className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                                                <span className="text-sm text-gray-700 font-medium">{alert}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* POSSIBLE CONDITIONS */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-4 border-b border-gray-200">
                                    <h4 className="font-black text-violet-400 text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                                        <Stethoscope className="h-3.5 w-3.5" /> Possible Conditions
                                    </h4>
                                </div>
                                <div className="p-4 space-y-2">
                                    {triageResult.possibleConditions.map((cond: string, i: number) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                                            <div className="h-6 w-6 rounded-full bg-violet-500/10 flex items-center justify-center text-[10px] font-black text-violet-400">
                                                {i + 1}
                                            </div>
                                            <span className="text-sm text-gray-700 font-medium">{cond}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* RECOMMENDED TESTS */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-4 border-b border-gray-200">
                                    <h4 className="font-black text-amber-400 text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                                        <FlaskConical className="h-3.5 w-3.5" /> Recommended Tests
                                    </h4>
                                </div>
                                <div className="p-4 flex flex-wrap gap-2">
                                    {triageResult.recommendedTests.map((test: string, i: number) => (
                                        <span key={i} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/15 rounded-xl text-xs font-bold text-amber-300">
                                            {test}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SOAP NOTE */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                                <h4 className="font-black text-teal-400 text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5" /> Clinical Summary (SOAP)
                                </h4>
                                <button onClick={() => navigator.clipboard.writeText(triageResult.clinicalSummary)} className="text-[10px] font-bold text-gray-400 hover:text-gray-900 px-3 py-1 rounded-lg hover:bg-gray-100 transition-all">
                                    Copy
                                </button>
                            </div>
                            <pre className="p-6 text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-[500px]">
                                {triageResult.clinicalSummary}
                            </pre>
                        </div>

                        <div className="text-center py-4">
                            <p className="text-[10px] text-gray-300 font-medium">
                                This is an AI-assisted assessment. Final clinical decisions must be made by a qualified physician.
                            </p>
                        </div>
                    </div>
                ) : (
                    /* ============== TRIAGE INPUT FORM ============== */
                    <div className="max-w-3xl mx-auto space-y-8">
                        <div className="text-center">
                            <h2 className="text-3xl font-black tracking-tight text-gray-900">AI Patient Intake</h2>
                            <p className="text-gray-500 font-medium mt-2">
                                Smart triage with automated risk assessment & department routing
                            </p>
                        </div>

                        {/* STEPPER */}
                        <div className="flex items-center justify-center gap-2">
                            {[
                                { n: 1, label: 'Patient Info' },
                                { n: 2, label: 'Symptoms' },
                                { n: 3, label: 'History & Vitals' }
                            ].map((s, i) => (
                                <React.Fragment key={s.n}>
                                    <button
                                        onClick={() => setStep(s.n)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${step === s.n
                                            ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300'
                                            : step > s.n
                                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                                : 'bg-gray-100 border border-gray-200 text-gray-400'
                                            }`}
                                    >
                                        <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === s.n ? 'bg-violet-500 text-white' :
                                            step > s.n ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
                                            }`}>
                                            {step > s.n ? '\u2713' : s.n}
                                        </span>
                                        {s.label}
                                    </button>
                                    {i < 2 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* STEP 1: Patient Info */}
                        {step === 1 && (
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 space-y-6 animate-in fade-in duration-300">
                                <h3 className="font-black text-gray-700 text-lg flex items-center gap-2">
                                    <Users className="h-5 w-5 text-violet-400" /> Patient Information
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Full Name *</label>
                                        <input
                                            value={patientName} onChange={e => setPatientName(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                                            placeholder="Enter patient's full name"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Age</label>
                                        <input
                                            type="number" value={age} onChange={e => setAge(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                            placeholder="e.g. 42"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Gender</label>
                                        <select
                                            value={gender} onChange={e => setGender(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold focus:border-violet-500/50 outline-none transition-all"
                                        >
                                            <option value="" className="bg-white text-gray-900">Select</option>
                                            <option value="Male" className="bg-white text-gray-900">Male</option>
                                            <option value="Female" className="bg-white text-gray-900">Female</option>
                                            <option value="Other" className="bg-white text-gray-900">Other</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Phone</label>
                                        <input
                                            value={phone} onChange={e => setPhone(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                            placeholder="+91 XXXXX XXXXX"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Email (For Portal & Reminders)</label>
                                        <input
                                            type="email" value={email} onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                            placeholder="patient@example.com"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        onClick={() => patientName ? setStep(2) : alert('Please enter patient name')}
                                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center gap-2 transition-all active:scale-95"
                                    >
                                        Continue <ArrowRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Symptoms */}
                        {step === 2 && (
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 space-y-6 animate-in fade-in duration-300">
                                <h3 className="font-black text-gray-700 text-lg flex items-center gap-2">
                                    <Clipboard className="h-5 w-5 text-amber-400" /> Symptoms & Complaints
                                </h3>

                                {/* Selected chips */}
                                {selectedSymptoms.length > 0 && (
                                    <div className="flex flex-wrap gap-2 p-4 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                                        {selectedSymptoms.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => toggleSymptom(s)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded-lg text-xs font-bold hover:bg-rose-500/20 hover:border-rose-500/30 hover:text-rose-300 transition-all"
                                            >
                                                {s} <X className="h-3 w-3" />
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Symptom grid */}
                                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                                    {COMMON_SYMPTOMS.map(s => (
                                        <button
                                            key={s}
                                            onClick={() => toggleSymptom(s)}
                                            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${selectedSymptoms.includes(s)
                                                ? 'bg-violet-500/20 border-violet-500/30 text-violet-300'
                                                : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>

                                {/* Custom symptom */}
                                <div className="flex gap-2">
                                    <input
                                        value={customSymptom} onChange={e => setCustomSymptom(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addCustomSymptom()}
                                        className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                        placeholder="Add custom symptom..."
                                    />
                                    <button onClick={addCustomSymptom} className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all">
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>

                                {/* Duration & Severity */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Duration</label>
                                        <input
                                            value={duration} onChange={e => setDuration(e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                            placeholder="e.g. 3 days"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Severity</label>
                                        <div className="flex gap-2">
                                            {['Mild', 'Moderate', 'Severe'].map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => setSeverity(s)}
                                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${severity === s
                                                        ? s === 'Severe' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                                                            s === 'Moderate' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' :
                                                                'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                                        : 'bg-gray-100 border-gray-200 text-gray-400'
                                                        }`}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between pt-2">
                                    <button onClick={() => setStep(1)} className="px-5 py-3 text-gray-400 text-sm font-bold hover:text-gray-900 transition-all">
                                        ← Back
                                    </button>
                                    <button
                                        onClick={() => selectedSymptoms.length > 0 ? setStep(3) : alert('Select at least one symptom')}
                                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center gap-2 transition-all active:scale-95"
                                    >
                                        Continue <ArrowRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: History & Vitals */}
                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                {/* Medical History */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 space-y-5">
                                    <h3 className="font-black text-gray-700 text-lg flex items-center gap-2">
                                        <Shield className="h-5 w-5 text-blue-400" /> Medical History
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Past Medical History</label>
                                            <textarea
                                                value={pmh} onChange={e => setPmh(e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all resize-none"
                                                placeholder="e.g. Diabetes Type 2, Hypertension..."
                                                rows={2}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Current Medications</label>
                                                <input
                                                    value={currentMeds} onChange={e => setCurrentMeds(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all"
                                                    placeholder="e.g. Metformin 500mg"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                                                    Allergies <AlertTriangle className="h-2.5 w-2.5 text-rose-400" />
                                                </label>
                                                <input
                                                    value={allergies} onChange={e => setAllergies(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-rose-500/50 outline-none transition-all"
                                                    placeholder="e.g. Penicillin, Sulfa drugs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Vitals */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 space-y-5">
                                    <h3 className="font-black text-gray-700 text-lg flex items-center gap-2">
                                        <HeartPulse className="h-5 w-5 text-rose-400" /> Vitals <span className="text-gray-300 text-xs font-medium">(Optional)</span>
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">BP (mmHg)</label>
                                            <input
                                                value={bp} onChange={e => setBp(e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all text-center"
                                                placeholder="120/80"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Heart Rate</label>
                                            <input
                                                type="number" value={hr} onChange={e => setHr(e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all text-center"
                                                placeholder="72"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Temp (°C)</label>
                                            <input
                                                type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all text-center"
                                                placeholder="37.0"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">SpO2 (%)</label>
                                            <input
                                                type="number" value={spo2} onChange={e => setSpo2(e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 font-mono font-bold placeholder:text-gray-400 focus:border-violet-500/50 outline-none transition-all text-center"
                                                placeholder="98"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-between pt-2">
                                    <button onClick={() => setStep(2)} className="px-5 py-3 text-gray-400 text-sm font-bold hover:text-gray-900 transition-all">
                                        ← Back
                                    </button>
                                    <button
                                        onClick={handleTriage}
                                        disabled={isTriaging}
                                        className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {isTriaging ? (
                                            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
                                        ) : (
                                            <><Zap className="h-4 w-4" /> Run AI Triage</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

        </AppShell>
    );
}
