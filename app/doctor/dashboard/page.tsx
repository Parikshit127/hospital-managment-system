'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, Search, Plus, X, FileText, Activity, Clock, Stethoscope,
    Save, Loader2, AlertTriangle, CheckCircle2, FlaskConical, Pill,
    History, User, Clipboard, Printer, RefreshCw, HeartPulse,
    Brain, Shield, Thermometer, Heart, Wind, Zap
} from 'lucide-react';
import {
    getPatientQueue, saveClinicalNotes, orderLabTest,
    updateAppointmentStatus, admitPatient,
    getPatientHistory, getPatientLabOrders, getMedicineList, createPharmacyOrder,
    saveMedicalNote
} from '@/app/actions/doctor-actions';
import { dischargePatient } from '@/app/actions/discharge-actions';
import { registerPatient } from '@/app/actions/register-patient';
import { getPatientTriageData } from '@/app/actions/triage-actions';
import { Sidebar } from '@/app/components/layout/Sidebar';

export default function DoctorDashboard() {
    // ─── SESSION STATE ───
    const [session, setSession] = useState<{ id: string; username: string; role: string; name?: string; specialty?: string } | null>(null);
    const [doctorName, setDoctorName] = useState('Doctor');
    const [doctorId, setDoctorId] = useState('');
    const [doctorSpecialty, setDoctorSpecialty] = useState('');

    // ─── VIEW MODE ───
    const [viewMode, setViewMode] = useState<'my' | 'all'>('all');

    const [queue, setQueue] = useState<any[]>([]);
    const [activePatient, setActivePatient] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'notes' | 'history' | 'lab' | 'pharmacy' | 'triage'>('triage');
    const [triageData, setTriageData] = useState<any>(null);
    const [loadingTriage, setLoadingTriage] = useState(false);
    const [diagnosis, setDiagnosis] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedTest, setSelectedTest] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [labOrders, setLabOrders] = useState<any[]>([]);
    const [loadingLabs, setLoadingLabs] = useState(false);
    const [showAdmitModal, setShowAdmitModal] = useState(false);
    const [admitDiagnosis, setAdmitDiagnosis] = useState('');
    const [medicines, setMedicines] = useState<any[]>([]);
    const [selectedMedicine, setSelectedMedicine] = useState('');
    const [medicineQty, setMedicineQty] = useState(1);
    const [pharmacyCart, setPharmacyCart] = useState<any[]>([]);
    const [pharmacyOrderResult, setPharmacyOrderResult] = useState<any>(null);
    const [showWalkinModal, setShowWalkinModal] = useState(false);
    const [walkinFormData, setWalkinFormData] = useState({ full_name: '', phone: '', age: '', gender: 'Male', address: '', department: 'General' });
    const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
    const [medicalNoteType, setMedicalNoteType] = useState('Routine Check');
    const [medicalNoteDetails, setMedicalNoteDetails] = useState('');
    const [showDischargeModal, setShowDischargeModal] = useState(false);
    const [dischargePdfUrl, setDischargePdfUrl] = useState('');
    const [isDischarging, setIsDischarging] = useState(false);

    // ─── FETCH SESSION ───
    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setSession(data);
                    setDoctorName(data.name || data.username || 'Doctor');
                    setDoctorId(data.id || '');
                    setDoctorSpecialty(data.specialty || '');
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    // ─── REFRESH QUEUE ───
    const refreshQueue = useCallback(async () => {
        try {
            const queueRes = await getPatientQueue({ doctor_id: doctorId, view: viewMode, specialty: doctorSpecialty });
            if (queueRes.success) {
                setQueue(queueRes.data as any);
            }
        } catch (e) {
            console.error('Failed to refresh queue', e);
        }
    }, [doctorId, viewMode, doctorSpecialty]);

    // ─── INITIAL LOAD ───
    useEffect(() => {
        async function init() {
            try {
                const [queueRes, medsRes] = await Promise.all([
                    getPatientQueue({ doctor_id: doctorId, view: viewMode, specialty: doctorSpecialty }),
                    getMedicineList(),
                ]);
                if (queueRes.success) {
                    setQueue(queueRes.data as any);
                    if (queueRes.data.length > 0) setActivePatient(queueRes.data[0] as any);
                }
                if (medsRes.success) setMedicines(medsRes.data as any);
            } finally { setLoading(false); }
        }
        init();
    }, [doctorId, viewMode, doctorSpecialty]);

    // ─── AUTO-REFRESH EVERY 60s ───
    useEffect(() => {
        const interval = setInterval(refreshQueue, 60000);
        return () => clearInterval(interval);
    }, [viewMode, refreshQueue]);

    useEffect(() => {
        if (activePatient && activeTab === 'history') {
            async function loadHistory() { setLoadingHistory(true); const res = await getPatientHistory(activePatient!.patient_id); if (res.success) setHistory(res.data as any); setLoadingHistory(false); }
            loadHistory();
        }
    }, [activePatient, activeTab]);

    useEffect(() => {
        if (activePatient && activeTab === 'triage') {
            async function loadTriage() {
                setLoadingTriage(true);
                const res = await getPatientTriageData(activePatient!.patient_id);
                if (res.success) setTriageData(res.data);
                setLoadingTriage(false);
            }
            loadTriage();
        }
    }, [activePatient, activeTab]);

    useEffect(() => { if (activePatient && activeTab === 'lab') { fetchLabs(activePatient.patient_id); } }, [activePatient, activeTab]);

    async function fetchLabs(patientId: string) { setLoadingLabs(true); const res = await getPatientLabOrders(patientId); if (res.success) setLabOrders(res.data as any); setLoadingLabs(false); }

    const withSubmission = async (fn: () => Promise<void>) => {
        if (isSubmitting) return; setIsSubmitting(true);
        try { await fn(); } catch (error) { console.error(error); alert('An unexpected error occurred.'); } finally { setIsSubmitting(false); }
    };

    const handleSaveNotes = () => withSubmission(async () => {
        if (!activePatient?.appointment_id) return alert('Error: No Appointment ID.');
        if (activePatient.status === 'Admitted') {
            await saveMedicalNote({ admission_id: 'LOOKUP_BY_PATIENT:' + activePatient.patient_id, note_type: medicalNoteType, details: medicalNoteDetails });
            alert('Medical Note Saved'); setMedicalNoteDetails('');
        } else {
            await saveClinicalNotes({ patient_id: activePatient.patient_id, appointment_id: activePatient.appointment_id, diagnosis, notes, doctor: doctorName });
            alert('Clinical Notes Saved');
        }
    });

    const handleOrderLab = () => withSubmission(async () => {
        if (!activePatient) return;
        await orderLabTest({ patient_id: activePatient.patient_id, test_type: selectedTest, doctor_id: doctorId });
        alert(`Ordered ${selectedTest}`); fetchLabs(activePatient.patient_id);
    });

    const handleAdmitSubmit = () => withSubmission(async () => {
        if (!activePatient) return;
        await admitPatient(activePatient.patient_id, doctorName, admitDiagnosis);
        alert('Patient Admitted'); setShowAdmitModal(false); handleStatusUpdate('Admitted');
    });

    const handleWalkinSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); if (isSubmitting) return; setIsSubmitting(true);
        try {
            const formData = new FormData();
            Object.entries(walkinFormData).forEach(([k, v]) => formData.append(k, v));
            const res = await registerPatient(formData);
            if (res.success) { alert(`Walk-in Registered! Patient ID: ${res.patient_id}`); setShowWalkinModal(false); const q = await getPatientQueue({ doctor_id: doctorId, view: viewMode, specialty: doctorSpecialty }); if (q.success) setQueue(q.data as any); }
            else { alert('Registration Failed: ' + res.error); }
        } finally { setIsSubmitting(false); }
    };

    const handleStatusUpdate = async (newStatus: string) => {
        if (!activePatient?.appointment_id || isSubmitting) return;
        const updatedQueue = queue.map(p => p.appointment_id === activePatient.appointment_id ? { ...p, status: newStatus } : p);
        setQueue(updatedQueue); setActivePatient((prev: any) => prev ? { ...prev, status: newStatus } : null);
        await updateAppointmentStatus(activePatient.appointment_id, newStatus);
    };

    const addToCart = () => {
        if (!selectedMedicine) return; const med = medicines.find((m: any) => m.brand_name === selectedMedicine); if (!med) return;
        setPharmacyCart(prev => { const existing = prev.find(i => i.name === selectedMedicine); if (existing) { return prev.map(i => i.name === selectedMedicine ? { ...i, qty: i.qty + medicineQty } : i); } return [...prev, { name: selectedMedicine, qty: medicineQty, price: med.price_per_unit }]; });
        setMedicineQty(1); setSelectedMedicine('');
    };
    const removeFromCart = (name: string) => { setPharmacyCart(prev => prev.filter(i => i.name !== name)); };

    const handlePlaceOrder = () => withSubmission(async () => {
        if (!activePatient || pharmacyCart.length === 0) return;
        const res = await createPharmacyOrder(activePatient.patient_id, doctorName, pharmacyCart);
        if (res.success) { setPharmacyOrderResult(res.agentResponse); setPharmacyCart([]); alert('Order Sent to Pharmacy!'); } else { alert('Order Failed'); }
    });

    const handlePrintPrescription = () => { if (pharmacyCart.length === 0) return alert("Add medicines first!"); setShowPrescriptionModal(true); };

    const filteredQueue = queue.filter(p => p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.digital_id && p.digital_id.toLowerCase().includes(searchTerm.toLowerCase())));

    const getStatusStyle = (status?: string) => {
        switch (status?.toLowerCase()) {
            case 'in progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'cancelled': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            case 'admitted': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        }
    };

    const handleDischarge = async () => {
        if (!activePatient || activePatient.status !== 'Admitted') return;
        if (!confirm(`Discharge ${activePatient.full_name}?`)) return;
        setIsDischarging(true);
        try {
            const res = await dischargePatient(activePatient.patient_id);
            if (res.success && res.pdfBase64) {
                const byteCharacters = atob(res.pdfBase64); const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
                const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
                setDischargePdfUrl(URL.createObjectURL(blob)); setShowDischargeModal(true); handleStatusUpdate('Completed');
            } else { alert('Failed: ' + res.error); }
        } catch (e) { console.error(e); alert('Error during discharge.'); } finally { setIsDischarging(false); }
    };

    // ─── INPUT STYLES ───
    const inputCls = "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";
    const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1 block mb-1.5";

    return (
        <div className="flex h-[calc(100vh-52px)] bg-gray-50 font-sans text-gray-900 overflow-hidden relative lg:pl-60">
            <style jsx global>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; } .no-print { display: none !important; } }`}</style>

            {/* ── NAV SIDEBAR ── */}
            <Sidebar session={session} />

            {/* ── DISCHARGE PDF MODAL ── */}
            {showDischargeModal && dischargePdfUrl && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                            <h3 className="font-black text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-teal-400" /> Discharge Summary</h3>
                            <button onClick={() => setShowDischargeModal(false)} className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="flex-1 bg-gray-50 p-0 relative"><iframe src={dischargePdfUrl} className="w-full h-full" title="Discharge Summary PDF"></iframe></div>
                        <div className="p-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                            <button onClick={() => setShowDischargeModal(false)} className="px-6 py-2.5 font-bold text-gray-400 hover:text-gray-600 rounded-xl">Close</button>
                            <a href={dischargePdfUrl} download={`Discharge_${activePatient?.full_name}.pdf`} className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2"><Clipboard className="h-4 w-4" /> Download PDF</a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── WALK-IN MODAL ── */}
            {showWalkinModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-black text-lg flex items-center gap-2"><Plus className="h-5 w-5 text-teal-400" /> Walk-in Registration</h3>
                            <button onClick={() => setShowWalkinModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={handleWalkinSubmit} className="p-6 space-y-4">
                            <input required placeholder="Full Name" className={inputCls} value={walkinFormData.full_name} onChange={e => setWalkinFormData({ ...walkinFormData, full_name: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input required placeholder="Phone" className={inputCls} value={walkinFormData.phone} onChange={e => setWalkinFormData({ ...walkinFormData, phone: e.target.value })} />
                                <input required placeholder="Age" type="number" min="0" className={inputCls} value={walkinFormData.age} onChange={e => setWalkinFormData({ ...walkinFormData, age: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <select className={inputCls} value={walkinFormData.gender} onChange={e => setWalkinFormData({ ...walkinFormData, gender: e.target.value })}><option className="bg-white text-gray-900">Male</option><option className="bg-white text-gray-900">Female</option><option className="bg-white text-gray-900">Other</option></select>
                                <select className={inputCls} value={walkinFormData.department} onChange={e => setWalkinFormData({ ...walkinFormData, department: e.target.value })}><option className="bg-white text-gray-900">General</option><option className="bg-white text-gray-900">Cardiology</option><option className="bg-white text-gray-900">Orthopedics</option></select>
                            </div>
                            <textarea placeholder="Address" className={inputCls} rows={2} value={walkinFormData.address} onChange={e => setWalkinFormData({ ...walkinFormData, address: e.target.value })} />
                            <button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-3.5 rounded-xl hover:from-teal-400 hover:to-emerald-500 disabled:opacity-70 flex justify-center items-center gap-2 shadow-lg shadow-teal-500/20">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register Patient'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── ADMIT MODAL ── */}
            {showAdmitModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-black text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-400" /> Admit Patient</h3>
                            <button onClick={() => setShowAdmitModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-500">Enter provisional diagnosis to admit <strong className="text-gray-700">{activePatient?.full_name}</strong>.</p>
                            <textarea autoFocus className={inputCls} rows={4} placeholder="Provisional Diagnosis..." value={admitDiagnosis} onChange={e => setAdmitDiagnosis(e.target.value)} />
                            <button onClick={handleAdmitSubmit} disabled={!admitDiagnosis.trim() || isSubmitting} className="w-full bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold py-3 rounded-xl hover:from-rose-400 hover:to-rose-500 disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-rose-500/20">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Admission'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── PRESCRIPTION MODAL ── */}
            {showPrescriptionModal && activePatient && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden print-area">
                        <div className="p-8 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div><h2 className="text-2xl font-bold text-slate-900">Rx Prescription</h2><p className="text-sm text-slate-500">Official Prescription</p></div>
                            <div className="text-right"><h3 className="font-bold text-lg text-slate-900">Avani Hospital</h3><p className="text-xs text-slate-500">{doctorName} &bull; {new Date().toLocaleDateString()}</p></div>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <div><p className="text-xs font-bold text-slate-400 uppercase">Patient</p><p className="font-bold text-lg text-slate-800">{activePatient.full_name}</p></div>
                                <div className="text-right"><p className="text-xs font-bold text-slate-400 uppercase">ID</p><p className="font-mono text-slate-800">{activePatient.digital_id || activePatient.patient_id}</p></div>
                            </div>
                            <div><h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Pill className="h-4 w-4" /> Medicines</h4>
                                <ul className="divide-y divide-dashed divide-slate-300">{pharmacyCart.map((item, i) => (<li key={i} className="py-2 flex justify-between"><span className="font-medium text-slate-700">{item.name}</span><span className="font-bold text-slate-900">Qty: {item.qty}</span></li>))}</ul>
                            </div>
                            <div className="mt-8 pt-8 border-t border-slate-200"><p className="text-sm text-slate-500 italic text-center">Take exactly as prescribed.</p></div>
                        </div>
                        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 no-print">
                            <button onClick={() => setShowPrescriptionModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Close</button>
                            <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center gap-2"><Printer className="h-4 w-4" /> Print</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LEFT SIDEBAR — QUEUE ── */}
            <aside className="w-80 flex flex-col border-r border-gray-200 bg-white">
                <div className="p-5 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-500 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-teal-400" /> Patient Queue</h3>
                        <span className="bg-teal-500/10 text-teal-400 text-[10px] px-2.5 py-1 rounded-lg font-black border border-teal-500/20">{filteredQueue.length}</span>
                    </div>
                    {/* ── VIEW MODE TOGGLE ── */}
                    <div className="flex mb-3 bg-gray-100 rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('my')}
                            className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${viewMode === 'my' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            My Patients
                        </button>
                        <button
                            onClick={() => setViewMode('all')}
                            className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            All Patients
                        </button>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-teal-400 transition-colors" />
                        <input type="text" placeholder="Search patient..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-gray-400 font-medium text-gray-900" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {loading ? <div className="text-center p-8 text-gray-400 animate-pulse font-bold">Loading queue...</div> : (
                        filteredQueue.length === 0 ? (
                            <div className="text-center p-12 text-gray-400 text-sm flex flex-col items-center gap-2"><Users className="h-8 w-8 text-gray-200" />No patients found</div>
                        ) : filteredQueue.map((p) => (
                            <div key={p.patient_id} onClick={isSubmitting ? undefined : () => setActivePatient(p)}
                                className={`p-4 rounded-xl cursor-pointer transition-all border group ${activePatient?.patient_id === p.patient_id ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/30' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-teal-500/20'} ${isSubmitting ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusStyle(p.status)}`}>{p.status || 'Pending'}</span>
                                    <span className="text-[10px] text-gray-300 font-mono">#{p.digital_id ? p.digital_id : p.patient_id.slice(0, 4)}</span>
                                </div>
                                <h4 className="font-bold text-sm truncate text-gray-700 group-hover:text-teal-400 transition-colors">{p.full_name}</h4>
                                <div className="flex gap-2 mt-1 items-center">
                                    <span className="text-[10px] text-gray-400">{p.age ? `${p.age}y` : ''}{p.gender ? ` / ${p.gender}` : ''}</span>
                                    <span className="text-[10px] text-gray-200">&bull;</span>
                                    <span className="text-[10px] text-gray-400">{p.department || 'General'}</span>
                                </div>
                                {p.reason_for_visit && (
                                    <p className="text-[10px] text-teal-400/50 mt-1.5 truncate flex items-center gap-1"><Brain className="h-3 w-3 shrink-0" />{p.reason_for_visit}</p>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="p-4 border-t border-gray-200">
                    <button onClick={() => setShowWalkinModal(true)} disabled={isSubmitting} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold hover:bg-gray-100 hover:text-teal-400 hover:border-teal-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                        <Plus className="h-4 w-4" /> Add Walk-in
                    </button>
                </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <main className="flex-1 flex flex-col min-w-0 relative">
                {activePatient ? (
                    <div className="flex-1 overflow-y-auto p-6 z-10 relative">
                        {/* Patient Header Card */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-teal-500/20 transition-all">
                            <div className="flex items-center gap-5">
                                <div className="h-14 w-14 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-2xl border border-gray-200 flex items-center justify-center"><User className="h-7 w-7 text-violet-400" /></div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{activePatient.full_name}</h1>
                                        <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-black px-2 py-1 rounded-lg">ID: {activePatient.digital_id || activePatient.patient_id}</span>
                                    </div>
                                    <div className="flex gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                                        {activePatient.age && <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><User className="h-3 w-3" /> {activePatient.age}y{activePatient.gender ? ` / ${activePatient.gender}` : ''}</span>}
                                        <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><Clock className="h-3 w-3" /> {new Date(activePatient.created_at).toLocaleTimeString()}</span>
                                        <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><Stethoscope className="h-3 w-3" /> {activePatient.department}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 items-center">
                                <select value={activePatient.status || 'Pending'} onChange={(e) => handleStatusUpdate(e.target.value)} disabled={isSubmitting} className="bg-white border border-gray-300 text-gray-900 text-sm rounded-xl focus:ring-teal-500 p-2.5 font-bold outline-none appearance-none">
                                    {['Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'Admitted'].map(s => <option key={s} value={s} className="bg-white text-gray-900">{s}</option>)}
                                </select>
                                {activePatient.status === 'Admitted' ? (
                                    <button onClick={handleDischarge} disabled={isDischarging} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm rounded-xl hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50">
                                        {isDischarging ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> DISCHARGE</>}
                                    </button>
                                ) : (
                                    <button onClick={() => setShowAdmitModal(true)} disabled={isSubmitting} className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold text-sm rounded-xl hover:from-rose-400 hover:to-rose-500 shadow-lg shadow-rose-500/20 flex items-center gap-2 disabled:opacity-50">
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><AlertTriangle className="h-4 w-4" /> ADMIT</>}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl min-h-[500px] flex flex-col overflow-hidden">
                            <div className="flex border-b border-gray-200 px-2 pt-2 overflow-x-auto">
                                {(['triage', 'notes', 'history', 'lab', 'pharmacy'] as const).map((tab) => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center gap-2 transition-all outline-none whitespace-nowrap ${activeTab === tab ? 'border-teal-400 text-teal-400 bg-teal-500/5 rounded-t-lg' : 'border-transparent text-gray-400 hover:text-gray-600 rounded-t-lg'}`}>
                                        {tab === 'triage' && <Brain className="h-4 w-4" />}{tab === 'notes' && <FileText className="h-4 w-4" />}{tab === 'history' && <History className="h-4 w-4" />}{tab === 'lab' && <FlaskConical className="h-4 w-4" />}{tab === 'pharmacy' && <Pill className="h-4 w-4" />}
                                        {tab === 'triage' ? 'AI Assessment' : tab === 'notes' ? (activePatient.status === 'Admitted' ? 'Medical Notes' : 'Clinical Notes') : tab === 'history' ? 'History' : tab === 'lab' ? 'Labs' : 'Pharmacy'}
                                    </button>
                                ))}
                            </div>

                            <div className="p-8 flex-1">
                                {/* AI ASSESSMENT TAB */}
                                {activeTab === 'triage' && (
                                    <div className="max-w-4xl space-y-6">
                                        {loadingTriage ? (
                                            <div className="text-center py-16 text-gray-400 font-bold flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-teal-400" />Loading AI Assessment...</div>
                                        ) : !triageData ? (
                                            <div className="bg-gray-100 border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                                                <Brain className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                                <h3 className="font-black text-gray-500 text-lg mb-1">No AI Assessment Found</h3>
                                                <p className="text-gray-400 text-sm font-medium">This patient was registered without AI triage. Proceed to Clinical Notes.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Triage Level Banner */}
                                                <div className={`rounded-2xl p-5 border flex items-center justify-between ${triageData.triageLevel === 'Emergency' ? 'bg-red-500/5 border-red-500/20' : triageData.triageLevel === 'Urgent' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-3 rounded-xl ${triageData.triageLevel === 'Emergency' ? 'bg-red-500/10' : triageData.triageLevel === 'Urgent' ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                                                            <Shield className={`h-6 w-6 ${triageData.triageLevel === 'Emergency' ? 'text-red-400' : triageData.triageLevel === 'Urgent' ? 'text-amber-400' : 'text-emerald-400'}`} />
                                                        </div>
                                                        <div>
                                                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] block ${triageData.triageLevel === 'Emergency' ? 'text-red-400/60' : triageData.triageLevel === 'Urgent' ? 'text-amber-400/60' : 'text-emerald-400/60'}`}>Triage Level</span>
                                                            <span className={`text-xl font-black ${triageData.triageLevel === 'Emergency' ? 'text-red-400' : triageData.triageLevel === 'Urgent' ? 'text-amber-400' : 'text-emerald-400'}`}>{triageData.triageLevel}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Department</span>
                                                        <span className="text-sm font-black text-gray-700">{triageData.recommendedDepartment}</span>
                                                        <span className="text-[10px] text-gray-300 block mt-0.5">{triageData.triageDate ? new Date(triageData.triageDate).toLocaleString() : ''}</span>
                                                    </div>
                                                </div>

                                                {/* Vitals Row */}
                                                {triageData.vitals && (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                                                            <HeartPulse className="h-5 w-5 text-rose-400 mx-auto mb-2" />
                                                            <span className="text-[10px] font-black text-gray-400 uppercase block">Blood Pressure</span>
                                                            <span className="text-lg font-black text-gray-700">{triageData.vitals.bloodPressure || 'N/A'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                                                            <Heart className="h-5 w-5 text-pink-400 mx-auto mb-2" />
                                                            <span className="text-[10px] font-black text-gray-400 uppercase block">Heart Rate</span>
                                                            <span className="text-lg font-black text-gray-700">{triageData.vitals.heartRate ? `${triageData.vitals.heartRate} BPM` : 'N/A'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                                                            <Thermometer className="h-5 w-5 text-orange-400 mx-auto mb-2" />
                                                            <span className="text-[10px] font-black text-gray-400 uppercase block">Temperature</span>
                                                            <span className="text-lg font-black text-gray-700">{triageData.vitals.temperature ? `${triageData.vitals.temperature}°C` : 'N/A'}</span>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                                                            <Wind className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
                                                            <span className="text-[10px] font-black text-gray-400 uppercase block">SpO2</span>
                                                            <span className="text-lg font-black text-gray-700">{triageData.vitals.oxygenSat ? `${triageData.vitals.oxygenSat}%` : 'N/A'}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    {/* Symptoms */}
                                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                                        <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-teal-400" /> Reported Symptoms</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {triageData.symptoms?.map((s: string, i: number) => (
                                                                <span key={i} className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold px-3 py-1.5 rounded-lg">{s}</span>
                                                            ))}
                                                        </div>
                                                        <div className="mt-3 text-xs text-gray-400"><span className="font-bold">Duration:</span> {triageData.duration || 'Not specified'} &middot; <span className="font-bold">Severity:</span> {triageData.severity || 'N/A'}</div>
                                                    </div>

                                                    {/* Possible Conditions */}
                                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                                        <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-violet-400" /> Possible Conditions</h4>
                                                        <div className="space-y-2">
                                                            {triageData.possibleConditions?.map((c: string, i: number) => (
                                                                <div key={i} className="flex items-center gap-2 text-sm text-gray-500"><div className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />{c}</div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Recommended Tests */}
                                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                                        <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-400" /> Recommended Tests</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {triageData.recommendedTests?.map((t: string, i: number) => (
                                                                <span key={i} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-3 py-1.5 rounded-lg">{t}</span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Medical History */}
                                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                                                        <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-400" /> Medical History</h4>
                                                        <div className="space-y-2 text-sm text-gray-500">
                                                            <div><span className="font-bold text-gray-400 text-xs">PMH: </span>{triageData.pastMedicalHistory || 'None reported'}</div>
                                                            <div><span className="font-bold text-gray-400 text-xs">Medications: </span>{triageData.currentMedications || 'None'}</div>
                                                            <div><span className="font-bold text-gray-400 text-xs">Allergies: </span>{triageData.allergies || 'NKDA'}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Risk Alerts */}
                                                {triageData.riskAlerts?.length > 0 && (
                                                    <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-5">
                                                        <h4 className="font-black text-rose-400/80 text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Alerts</h4>
                                                        <div className="space-y-2">
                                                            {triageData.riskAlerts.map((a: string, i: number) => (
                                                                <div key={i} className="text-sm text-rose-300/70 font-medium">{a}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Professional Clinical Summary */}
                                                <div className="space-y-4">
                                                    <h4 className="font-black text-gray-500 text-xs uppercase tracking-[0.15em] flex items-center gap-2"><Brain className="h-4 w-4 text-teal-400" /> AI Clinical Assessment — Detailed Report</h4>

                                                    {/* Parse and render the clinical summary in sections */}
                                                    {(() => {
                                                        const summary = triageData.clinicalSummary || '';
                                                        const sections = [
                                                            { key: 'SUBJECTIVE', icon: <User className="h-4 w-4" />, color: 'teal', label: 'Subjective — History of Present Illness' },
                                                            { key: 'OBJECTIVE', icon: <Activity className="h-4 w-4" />, color: 'cyan', label: 'Objective — Examination & Vitals' },
                                                            { key: 'ASSESSMENT', icon: <Stethoscope className="h-4 w-4" />, color: 'violet', label: 'Assessment — Clinical Impression' },
                                                            { key: 'PLAN', icon: <Clipboard className="h-4 w-4" />, color: 'amber', label: 'Plan — Investigations & Management' },
                                                            { key: 'IMMEDIATE ACTIONS', icon: <Zap className="h-4 w-4" />, color: 'rose', label: 'Immediate Actions Required' },
                                                            { key: 'CLINICAL REASONING', icon: <Brain className="h-4 w-4" />, color: 'emerald', label: 'Clinical Reasoning' },
                                                        ];

                                                        // Try to parse sections from the summary
                                                        const parsed: Record<string, string> = {};
                                                        let currentKey = '';

                                                        summary.split('\n').forEach((line: string) => {
                                                            const trimmed = line.trim();
                                                            const matchedSection = sections.find(s => trimmed.toUpperCase().startsWith(s.key + ':') || trimmed.toUpperCase() === s.key);
                                                            if (matchedSection) {
                                                                currentKey = matchedSection.key;
                                                                const afterColon = trimmed.substring(trimmed.indexOf(':') + 1).trim();
                                                                parsed[currentKey] = afterColon ? afterColon + '\n' : '';
                                                            } else if (currentKey && trimmed) {
                                                                parsed[currentKey] = (parsed[currentKey] || '') + trimmed + '\n';
                                                            }
                                                        });

                                                        const hasParsed = Object.keys(parsed).length > 0;

                                                        if (!hasParsed) {
                                                            // Fallback: render as plain text if parsing fails
                                                            return (
                                                                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                                                                    <pre className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed font-sans">{summary}</pre>
                                                                </div>
                                                            );
                                                        }

                                                        const colorMap: Record<string, string> = {
                                                            teal: 'border-teal-500/20 bg-teal-500/[0.03]',
                                                            cyan: 'border-cyan-500/20 bg-cyan-500/[0.03]',
                                                            violet: 'border-violet-500/20 bg-violet-500/[0.03]',
                                                            amber: 'border-amber-500/20 bg-amber-500/[0.03]',
                                                            rose: 'border-rose-500/20 bg-rose-500/[0.03]',
                                                            emerald: 'border-emerald-500/20 bg-emerald-500/[0.03]',
                                                        };
                                                        const textColorMap: Record<string, string> = {
                                                            teal: 'text-teal-400',
                                                            cyan: 'text-cyan-400',
                                                            violet: 'text-violet-400',
                                                            amber: 'text-amber-400',
                                                            rose: 'text-rose-400',
                                                            emerald: 'text-emerald-400',
                                                        };

                                                        return sections.filter(s => parsed[s.key]).map(section => (
                                                            <div key={section.key} className={`border rounded-xl p-5 ${colorMap[section.color]} transition-all hover:border-opacity-40`}>
                                                                <div className={`flex items-center gap-2 mb-3 ${textColorMap[section.color]}`}>
                                                                    {section.icon}
                                                                    <span className="font-black text-xs uppercase tracking-wider">{section.label}</span>
                                                                </div>
                                                                <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{parsed[section.key]?.trim()}</div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>

                                                {/* AI Disclaimer + Action */}
                                                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-4">
                                                    <p className="text-[11px] text-gray-400 font-medium max-w-lg">This is an AI-assisted clinical assessment. All findings should be verified through physical examination and diagnostic confirmation. Final clinical decision rests with the attending physician.</p>
                                                    <button onClick={() => setActiveTab('notes')} className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 shrink-0 ml-4">
                                                        <FileText className="h-4 w-4" /> Proceed to Clinical Notes
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                {/* NOTES TAB */}
                                {activeTab === 'notes' && (
                                    <div className="max-w-3xl space-y-6">
                                        {activePatient.status === 'Admitted' ? (<>
                                            <div className="bg-violet-500/5 border border-violet-500/10 p-4 rounded-xl flex items-center gap-3">
                                                <div className="bg-violet-500/10 p-2 rounded-lg"><Clipboard className="h-5 w-5 text-violet-400" /></div>
                                                <div><span className="text-violet-300 text-sm font-bold block">Admitted Patient Record</span><span className="text-violet-400/60 text-xs">Document routine checks and nursing notes.</span></div>
                                            </div>
                                            <div><label className={labelCls}>Note Type</label><select value={medicalNoteType} onChange={e => setMedicalNoteType(e.target.value)} className={inputCls}><option className="bg-white text-gray-900">Routine Check</option><option className="bg-white text-gray-900">Admission Note</option><option className="bg-white text-gray-900">Nursing</option><option className="bg-white text-gray-900">Discharge Advice</option></select></div>
                                            <div><label className={labelCls}>Details</label><textarea value={medicalNoteDetails} onChange={e => setMedicalNoteDetails(e.target.value)} className={inputCls} placeholder="Enter routine check details..." rows={8} /></div>
                                        </>) : (<>
                                            <div><label className={labelCls}>Diagnosis</label><input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className={inputCls} placeholder="Primary Diagnosis..." /></div>
                                            <div><label className={labelCls}>Doctor Notes & Observations</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Enter clinical observations..." rows={8} /></div>
                                        </>)}
                                        <div className="flex justify-end pt-4">
                                            <button onClick={handleSaveNotes} disabled={isSubmitting} className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50">
                                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save Record</>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {/* HISTORY TAB */}
                                {activeTab === 'history' && (
                                    <div className="max-w-4xl space-y-6">
                                        <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2 text-lg"><History className="h-5 w-5 text-violet-400" /> Patient History</h3>
                                        {loadingHistory ? <div className="text-center py-12 text-gray-400 font-bold">Loading history...</div> : history.length === 0 ? (
                                            <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">No previous records found.</div>
                                        ) : (<div className="space-y-4">{history.map((record, i) => (
                                            <div key={i} className="bg-gray-50 border border-gray-200 p-5 rounded-xl hover:border-teal-500/20 transition-all">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div><p className="font-bold text-teal-400 text-base">{record.diagnosis || 'No Diagnosis'}</p><p className="text-xs text-gray-400 mt-1">{new Date(record.created_at).toLocaleDateString()} &bull; {record.doctor_name || 'Dr. Unknown'}</p></div>
                                                    <div className="bg-gray-100 text-gray-400 text-[10px] uppercase font-black px-2 py-1 rounded-lg border border-gray-200">#{record.appointment_id}</div>
                                                </div>
                                                <p className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">{record.doctor_notes}</p>
                                            </div>
                                        ))}</div>)}
                                    </div>
                                )}
                                {/* LAB TAB */}
                                {activeTab === 'lab' && (
                                    <div className="max-w-3xl space-y-8">
                                        <div className="bg-violet-500/5 p-6 rounded-2xl border border-violet-500/10">
                                            <h3 className="font-black text-violet-300 mb-4 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-violet-400" /> Order New Test</h3>
                                            <div className="flex gap-4">
                                                <select value={selectedTest} onChange={e => setSelectedTest(e.target.value)} className={`flex-1 ${inputCls}`}>
                                                    <option value="" className="bg-white text-gray-900">Select Test Type...</option><option value="Complete Blood Count (CBC)" className="bg-white text-gray-900">Complete Blood Count (CBC)</option><option value="Lipid Profile" className="bg-white text-gray-900">Lipid Profile</option><option value="Dengue NS1 Antigen" className="bg-white text-gray-900">Dengue NS1 Antigen</option><option value="Liver Function Test" className="bg-white text-gray-900">Liver Function Test</option>
                                                </select>
                                                <button onClick={handleOrderLab} disabled={!selectedTest || isSubmitting} className="px-6 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-violet-500/20 flex items-center gap-2">
                                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Order Test'}
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="font-black text-gray-700 text-lg">Lab History</h3>
                                                <button onClick={() => fetchLabs(activePatient.patient_id)} className="text-teal-400 hover:bg-teal-500/10 p-2 rounded-lg transition-colors"><RefreshCw className={`h-4 w-4 ${loadingLabs ? 'animate-spin' : ''}`} /></button>
                                            </div>
                                            <div className="space-y-3">
                                                {labOrders.length === 0 ? <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">No lab orders found.</div> : labOrders.map(order => (
                                                    <div key={order.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 p-4 rounded-xl hover:border-teal-500/20 transition-all">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`h-3 w-3 rounded-full ${order.status === 'Completed' ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-amber-500 shadow-amber-500/30'} shadow-sm`} />
                                                            <div><p className="font-bold text-gray-700">{order.test_type}</p><p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">{order.barcode && <span className="font-mono bg-gray-100 px-1 rounded border border-gray-200">#{order.barcode}</span>}<span className="text-gray-200">&bull;</span>{new Date(order.created_at).toLocaleDateString()}</p></div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${order.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{order.status}</span>
                                                            {order.result_value && <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200 inline-block">{order.result_value}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* PHARMACY TAB */}
                                {activeTab === 'pharmacy' && (
                                    <div className="max-w-4xl space-y-6">
                                        <div className="flex gap-8">
                                            <div className="flex-1 space-y-6">
                                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                                                    <div className="flex justify-between items-center mb-6">
                                                        <h3 className="font-black text-gray-700 flex items-center gap-2"><Pill className="h-5 w-5 text-teal-400" /> Prescribe Medicine</h3>
                                                        {pharmacyCart.length > 0 && <button onClick={handlePrintPrescription} className="text-xs font-bold text-gray-400 flex items-center gap-1 hover:text-gray-600"><Printer className="h-3 w-3" /> Preview Rx</button>}
                                                    </div>
                                                    <div className="flex gap-3 mb-4">
                                                        <select value={selectedMedicine} onChange={e => setSelectedMedicine(e.target.value)} className={`flex-[2] ${inputCls}`}>
                                                            <option value="" className="bg-white text-gray-900">Select Medicine...</option>{medicines.map((m: any) => <option key={m.id} value={m.brand_name} className="bg-white text-gray-900">{m.brand_name} ({'\u20B9'}{m.price_per_unit})</option>)}
                                                        </select>
                                                        <input type="number" min="1" value={medicineQty} onChange={e => setMedicineQty(parseInt(e.target.value) || 1)} className={`w-20 text-center ${inputCls}`} />
                                                        <button onClick={addToCart} disabled={!selectedMedicine} className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"><Plus className="h-5 w-5" /></button>
                                                    </div>
                                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                                        <div className="bg-gray-100 px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] flex justify-between border-b border-gray-200"><span>Current Rx Cart</span><span>{pharmacyCart.length} Items</span></div>
                                                        {pharmacyCart.length === 0 ? <div className="p-8 text-center text-gray-300 text-sm font-bold">Add medicines to create prescription</div> : (
                                                            <div className="divide-y divide-gray-100">{pharmacyCart.map((item, idx) => (
                                                                <div key={idx} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                                                    <div><span className="font-bold text-gray-700 text-sm block">{item.name}</span><span className="text-xs text-gray-400">Qty: {item.qty}</span></div>
                                                                    <button onClick={() => removeFromCart(item.name)} className="text-rose-400 hover:text-rose-300 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-lg hover:bg-rose-500/20 transition-colors border border-rose-500/20">REMOVE</button>
                                                                </div>
                                                            ))}</div>
                                                        )}
                                                        {pharmacyCart.length > 0 && (
                                                            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                                                                <button onClick={handlePlaceOrder} disabled={isSubmitting} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold px-6 py-3 rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-lg shadow-teal-500/20 w-full flex justify-center items-center gap-2 disabled:opacity-50">
                                                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to Pharmacy'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {pharmacyOrderResult && (
                                                <div className="flex-1 bg-white border border-gray-200 shadow-sm rounded-2xl p-6 h-fit">
                                                    <div className="flex items-center gap-3 mb-6 text-emerald-400 font-bold border-b border-gray-200 pb-4">
                                                        <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="h-6 w-6" /></div>
                                                        <div><span className="block text-lg">Order Processed</span><span className="text-xs text-emerald-400/60 font-normal">Sent to Pharmacy Queue</span></div>
                                                    </div>
                                                    <div className="space-y-4 text-sm">
                                                        <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Total Requested</span><span className="font-bold bg-gray-100 px-2 py-0.5 rounded-lg text-gray-500 border border-gray-200">{pharmacyOrderResult.bill_summary?.total_items_requested}</span></div>
                                                        <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Items Dispensed</span><span className="font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-lg">{pharmacyOrderResult.bill_summary?.items_dispensed}</span></div>
                                                        <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Unavailable</span><span className="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg">{pharmacyOrderResult.bill_summary?.items_missing}</span></div>
                                                        <div className="pt-6 flex justify-between items-end"><span className="font-bold text-gray-300 uppercase text-[10px] tracking-[0.15em] block">Total Bill</span><span className="text-3xl font-black text-gray-900 tracking-tight">{'\u20B9'}{pharmacyOrderResult.bill_summary?.total_amount_to_collect}</span></div>
                                                        <button onClick={handlePrintPrescription} className="w-full mt-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 border border-gray-200 flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> Print Receipt</button>
                                                        <button onClick={() => setPharmacyOrderResult(null)} className="w-full py-3 text-gray-400 hover:text-gray-600 text-xs font-bold">New Order</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 relative">
                        <div className="z-10 flex flex-col items-center">
                            <div className="h-24 w-24 bg-gray-100 rounded-full mb-6 border border-gray-200 flex items-center justify-center"><Users className="h-10 w-10 text-gray-200" /></div>
                            <h2 className="text-xl font-black text-gray-500 mb-2">Ready for Consultation</h2>
                            <p className="text-gray-400 max-w-xs text-center font-medium">Select a patient from the queue to start consultation.</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
