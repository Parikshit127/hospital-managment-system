'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Users, Search, X, FileText, Loader2, Clock, User,
    BedDouble, Building2, Stethoscope, Plus, Save, Calendar,
    Activity, Heart, Thermometer, Wind, Droplets, Weight,
    AlertTriangle, CheckCircle2, ShoppingCart, Trash2, ChevronDown,
    Package, FlaskConical, Send, ClipboardList,
} from 'lucide-react';
import {
    getWardPatients, getWardsList, getNursingNotes, addNursingNote,
    recordVitals, getPatientVitals, searchMedicines, checkMedicineStock,
    createPharmacyIndent, getPatientIndentHistory, type PharmacyIndentItem,
} from '@/app/actions/nurse-actions';
import { getNursesForDropdown } from '@/app/actions/admin-actions';
import { formatDoctorName } from '@/app/lib/format-name';

type TabId = 'vitals' | 'notes' | 'pharmacy';

// ─── helpers ────────────────────────────────────────────────────────────────

const inputCls =
    'w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all';
const labelCls =
    'text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-0.5 block mb-1';

function Tab({
    id, active, icon, label, onClick,
}: { id: string; active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all ${
                active
                    ? 'bg-teal-500 text-white shadow-md shadow-teal-500/30'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

// ─── Stock badge ─────────────────────────────────────────────────────────────

function StockBadge({ stock, requested }: { stock: number; requested: number }) {
    if (stock === 0)
        return (
            <span className="flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                <AlertTriangle className="h-3 w-3" /> Out of Stock
            </span>
        );
    if (stock < requested)
        return (
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                <AlertTriangle className="h-3 w-3" /> Only {stock} available
            </span>
        );
    return (
        <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
            <CheckCircle2 className="h-3 w-3" /> {stock} in stock
        </span>
    );
}

// ─── Pharmacy Indent Line Item ─────────────────────────────────────────────

interface IndentLine {
    medicineId: number;
    medicineName: string;
    genericName?: string;
    form?: string;
    strength?: string;
    quantityRequested: number;
    stockChecked: boolean;
    stockAvailable: number;
    checkingStock: boolean;
    notes: string;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NursePatientsPage() {
    const [nurseId, setNurseId] = useState('');
    const [patients, setPatients] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    const [selectedWard, setSelectedWard] = useState<number | undefined>(undefined);
    const [statusFilter, setStatusFilter] = useState<string>('Admitted');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<TabId>('vitals');

    // ── Vitals tab ──
    const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
    const [loadingVitals, setLoadingVitals] = useState(false);
    const [savingVitals, setSavingVitals] = useState(false);
    const [vitalsForm, setVitalsForm] = useState({
        bloodPressure: '',
        heartRate: '',
        temperature: '',
        oxygenSat: '',
        respiratoryRate: '',
        weight: '',
        height: '',
    });

    // ── Notes tab ──
    const [notes, setNotes] = useState<any[]>([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [noteType, setNoteType] = useState('General');
    const [noteDetails, setNoteDetails] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    // ── Pharmacy tab ──
    const [medSearch, setMedSearch] = useState('');
    const [medSuggestions, setMedSuggestions] = useState<any[]>([]);
    const [searchingMed, setSearchingMed] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [indentLines, setIndentLines] = useState<IndentLine[]>([]);
    const [submittingIndent, setSubmittingIndent] = useState(false);
    const [indentSuccess, setIndentSuccess] = useState<string | null>(null);
    const [indentError, setIndentError] = useState<string | null>(null);
    const [indentHistory, setIndentHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const medSearchRef = useRef<HTMLDivElement>(null);
    const medDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Session ──
    const [nursesList, setNursesList] = useState<{ id: string; name: string }[]>([]);
    const [selectedNurseName, setSelectedNurseName] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const d = await res.json();
                    setNurseId(d.id || '');
                    setSelectedNurseName(d.name || '');
                }
            } catch {}
            // Load all nurses for dropdown
            const nRes = await getNursesForDropdown();
            if (nRes.success) setNursesList(nRes.data || []);
        })();
    }, []);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [pRes, wRes] = await Promise.all([
                getWardPatients(selectedWard, statusFilter),
                getWardsList(),
            ]);
            if (pRes.success) setPatients(pRes.data || []);
            if (wRes.success) setWards(wRes.data || []);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [selectedWard, statusFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── open modal ──
    const openPatientModal = async (patient: any) => {
        setSelectedPatient(patient);
        setShowModal(true);
        setActiveTab('vitals');
        setVitalsForm({ bloodPressure: '', heartRate: '', temperature: '', oxygenSat: '', respiratoryRate: '', weight: '', height: '' });
        setNoteType('General');
        setNoteDetails('');
        setIndentLines([]);
        setMedSearch('');
        setMedSuggestions([]);
        setIndentSuccess(null);
        setIndentError(null);
        setIndentHistory([]);

        // preload vitals, notes & indent history in parallel
        setLoadingVitals(true);
        setLoadingNotes(true);
        setLoadingHistory(true);
        const [vRes, nRes, hRes] = await Promise.all([
            getPatientVitals(patient.patientId),
            getNursingNotes(patient.admissionId),
            getPatientIndentHistory(patient.patientId),
        ]);
        if (vRes.success) setVitalsHistory(vRes.data || []);
        if (nRes.success) setNotes(nRes.data || []);
        if (hRes.success) setIndentHistory(hRes.data || []);
        setLoadingVitals(false);
        setLoadingNotes(false);
        setLoadingHistory(false);
    };

    const closeModal = () => { setShowModal(false); setSelectedPatient(null); };

    // ── Save Vitals ──
    const handleSaveVitals = async () => {
        if (!selectedPatient || !nurseId) return;
        const anyFilled = Object.values(vitalsForm).some((v) => v.trim() !== '');
        if (!anyFilled) return;
        setSavingVitals(true);
        try {
            const res = await recordVitals({
                patientId: selectedPatient.patientId,
                bloodPressure: vitalsForm.bloodPressure || undefined,
                heartRate: vitalsForm.heartRate ? Number(vitalsForm.heartRate) : undefined,
                temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : undefined,
                oxygenSat: vitalsForm.oxygenSat ? Number(vitalsForm.oxygenSat) : undefined,
                respiratoryRate: vitalsForm.respiratoryRate ? Number(vitalsForm.respiratoryRate) : undefined,
                weight: vitalsForm.weight ? Number(vitalsForm.weight) : undefined,
                height: vitalsForm.height ? Number(vitalsForm.height) : undefined,
                recordedBy: nurseId,
            });
            if (res.success) {
                setVitalsForm({ bloodPressure: '', heartRate: '', temperature: '', oxygenSat: '', respiratoryRate: '', weight: '', height: '' });
                const vRes = await getPatientVitals(selectedPatient.patientId);
                if (vRes.success) setVitalsHistory(vRes.data || []);
            }
        } finally {
            setSavingVitals(false);
        }
    };

    // ── Save Note ──
    const handleSaveNote = async () => {
        if (!selectedPatient || !noteDetails.trim() || !nurseId) return;
        setSavingNote(true);
        try {
            const res = await addNursingNote({
                admissionId: selectedPatient.admissionId,
                nurseId,
                noteType,
                details: noteDetails.trim(),
            });
            if (res.success) {
                setNoteDetails('');
                const nRes = await getNursingNotes(selectedPatient.admissionId);
                if (nRes.success) setNotes(nRes.data || []);
            }
        } finally {
            setSavingNote(false);
        }
    };

    // ── Medicine search (debounced) ──
    const handleMedSearch = (val: string) => {
        setMedSearch(val);
        if (medDebounce.current) clearTimeout(medDebounce.current);
        if (!val.trim()) { setMedSuggestions([]); setShowSuggestions(false); return; }
        medDebounce.current = setTimeout(async () => {
            setSearchingMed(true);
            try {
                const res = await searchMedicines(val);
                if (res.success) setMedSuggestions((res.data as any[]) || []);
                setShowSuggestions(true);
            } finally {
                setSearchingMed(false);
            }
        }, 350);
    };

    const addMedicineToIndent = async (med: any) => {
        setShowSuggestions(false);
        setMedSearch('');
        // Check stock immediately
        const line: IndentLine = {
            medicineId: med.id,
            medicineName: med.brand_name,
            genericName: med.generic_name,
            form: med.form,
            strength: med.strength,
            quantityRequested: 1,
            stockChecked: false,
            stockAvailable: 0,
            checkingStock: true,
            notes: '',
        };
        setIndentLines((prev) => [...prev, line]);
        const idx = indentLines.length; // current last index
        const stockRes = await checkMedicineStock(med.id);
        setIndentLines((prev) =>
            prev.map((l, i) =>
                i === idx
                    ? {
                          ...l,
                          stockChecked: true,
                          stockAvailable: stockRes.success ? (stockRes.data as any).totalStock : 0,
                          checkingStock: false,
                      }
                    : l
            )
        );
    };

    const updateLine = (idx: number, field: keyof IndentLine, value: any) => {
        setIndentLines((prev) =>
            prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
        );
    };

    const recheckStock = async (idx: number) => {
        const line = indentLines[idx];
        setIndentLines((prev) => prev.map((l, i) => (i === idx ? { ...l, checkingStock: true } : l)));
        const stockRes = await checkMedicineStock(line.medicineId);
        setIndentLines((prev) =>
            prev.map((l, i) =>
                i === idx
                    ? {
                          ...l,
                          stockChecked: true,
                          stockAvailable: stockRes.success ? (stockRes.data as any).totalStock : 0,
                          checkingStock: false,
                      }
                    : l
            )
        );
    };

    const removeLine = (idx: number) => setIndentLines((prev) => prev.filter((_, i) => i !== idx));

    // ── Submit indent ──
    const handleSubmitIndent = async () => {
        if (!selectedPatient || indentLines.length === 0 || !nurseId) return;
        setSubmittingIndent(true);
        setIndentSuccess(null);
        setIndentError(null);
        try {
            const items: PharmacyIndentItem[] = indentLines.map((l) => ({
                medicineId: l.medicineId,
                medicineName: l.medicineName,
                quantityRequested: l.quantityRequested,
                quantityApproved: Math.min(l.quantityRequested, l.stockAvailable),
                notes: l.notes,
            }));
            const res = await createPharmacyIndent({
                patientId: selectedPatient.patientId,
                admissionId: selectedPatient.admissionId,
                nurseId,
                nurseName: selectedNurseName || undefined,
                doctorName: selectedPatient.doctorName || '',
                items,
            });
            if (res.success) {
                const shortItems = indentLines.filter((l) => l.stockAvailable < l.quantityRequested);
                setIndentLines([]);
                setIndentSuccess(
                    shortItems.length > 0
                        ? `Indent #${res.orderId} submitted. ⚠️ ${shortItems.map((l) => l.medicineName).join(', ')} had insufficient stock — pharmacy notified.`
                        : `Indent #${res.orderId} submitted successfully to pharmacy.`
                );
                // Refresh history
                getPatientIndentHistory(selectedPatient.patientId).then(h => {
                    if (h.success) setIndentHistory(h.data || []);
                });
            } else {
                setIndentError('Failed to submit indent. Please try again.');
            }
        } finally {
            setSubmittingIndent(false);
        }
    };

    // ── Filtered patients ──
    const filteredPatients = patients.filter((p) => {
        if (fromDate || toDate) {
            const d = p.admissionDate ? new Date(p.admissionDate) : null;
            const day = d
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                : '';
            if (!day) return false;
            if (fromDate && day < fromDate) return false;
            if (toDate && day > toDate) return false;
        }
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            p.patientName?.toLowerCase().includes(q) ||
            p.admissionId?.toLowerCase().includes(q) ||
            p.patientId?.toLowerCase().includes(q) ||
            p.diagnosis?.toLowerCase().includes(q) ||
            p.wardName?.toLowerCase().includes(q) ||
            p.doctorName?.toLowerCase().includes(q)
        );
    });

    return (
        <AppShell
            pageTitle="Ward Patients"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            {/* ─────────────── Patient Action Modal ─────────────── */}
            {showModal && selectedPatient && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-200 overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-teal-50 to-emerald-50 shrink-0">
                            <div>
                                <h3 className="font-black text-lg flex items-center gap-2 text-gray-800">
                                    <User className="h-5 w-5 text-teal-500" />
                                    {selectedPatient.patientName}
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                    {selectedPatient.wardName} &middot; Bed #{selectedPatient.bedLabel || selectedPatient.bedId || 'N/A'} &middot; {formatDoctorName(selectedPatient.doctorName) || 'Unassigned'} &middot; {selectedPatient.diagnosis || 'No diagnosis'}
                                </p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full hover:bg-gray-100 transition-all border border-gray-200"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Patient info chips */}
                        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap bg-gray-50 shrink-0">
                            {[
                                { label: 'Age', value: selectedPatient.age ? `${selectedPatient.age}y` : 'N/A' },
                                { label: 'Gender', value: selectedPatient.gender || 'N/A' },
                                { label: 'Ward Type', value: selectedPatient.wardType || 'N/A' },
                                { label: 'Admitted', value: selectedPatient.admissionDate ? new Date(selectedPatient.admissionDate).toLocaleDateString('en-GB') : 'N/A' },
                            ].map((chip) => (
                                <div key={chip.label} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-center">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{chip.label}</p>
                                    <p className="text-xs font-black text-gray-700">{chip.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Tabs */}
                        <div className="px-6 pt-3 pb-0 flex items-center gap-2 border-b border-gray-100 bg-gray-50 shrink-0">
                            <Tab id="vitals" active={activeTab === 'vitals'} icon={<Activity className="h-3.5 w-3.5" />} label="Record Vitals" onClick={() => setActiveTab('vitals')} />
                            <Tab id="notes" active={activeTab === 'notes'} icon={<FileText className="h-3.5 w-3.5" />} label="Medical Notes" onClick={() => setActiveTab('notes')} />
                            <Tab id="pharmacy" active={activeTab === 'pharmacy'} icon={<ShoppingCart className="h-3.5 w-3.5" />} label="Pharmacy Indent" onClick={() => setActiveTab('pharmacy')} />
                            <div className="ml-auto pb-2">
                                <span className="text-[10px] text-gray-400 font-mono">{selectedPatient.admissionId}</span>
                            </div>
                        </div>

                        {/* Tab Body */}
                        <div className="flex-1 overflow-y-auto p-6">

                            {/* ═══════ VITALS TAB ═══════ */}
                            {activeTab === 'vitals' && (
                                <div className="space-y-5">
                                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 rounded-2xl p-5">
                                        <h4 className="text-xs font-black text-teal-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Activity className="h-3.5 w-3.5" /> Record Vitals
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className={labelCls}><Heart className="inline h-3 w-3 mr-1 text-rose-400" />Blood Pressure</label>
                                                <input className={inputCls} placeholder="120/80 mmHg" value={vitalsForm.bloodPressure} onChange={(e) => setVitalsForm((p) => ({ ...p, bloodPressure: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className={labelCls}><Activity className="inline h-3 w-3 mr-1 text-rose-400" />Heart Rate</label>
                                                <input className={inputCls} type="number" placeholder="bpm" value={vitalsForm.heartRate} onChange={(e) => setVitalsForm((p) => ({ ...p, heartRate: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className={labelCls}><Thermometer className="inline h-3 w-3 mr-1 text-orange-400" />Temperature (°F)</label>
                                                <input className={inputCls} type="number" step="0.1" placeholder="98.6" value={vitalsForm.temperature} onChange={(e) => setVitalsForm((p) => ({ ...p, temperature: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className={labelCls}><Droplets className="inline h-3 w-3 mr-1 text-blue-400" />SpO₂ (%)</label>
                                                <input className={inputCls} type="number" placeholder="98" value={vitalsForm.oxygenSat} onChange={(e) => setVitalsForm((p) => ({ ...p, oxygenSat: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className={labelCls}><Wind className="inline h-3 w-3 mr-1 text-teal-400" />Resp. Rate / min</label>
                                                <input className={inputCls} type="number" placeholder="16" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm((p) => ({ ...p, respiratoryRate: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className={labelCls}><Weight className="inline h-3 w-3 mr-1 text-violet-400" />Weight (kg)</label>
                                                <input className={inputCls} type="number" step="0.1" placeholder="70" value={vitalsForm.weight} onChange={(e) => setVitalsForm((p) => ({ ...p, weight: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-4">
                                            <button
                                                onClick={handleSaveVitals}
                                                disabled={savingVitals || !Object.values(vitalsForm).some((v) => v.trim())}
                                                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 transition-all"
                                            >
                                                {savingVitals ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                Save Vitals
                                            </button>
                                        </div>
                                    </div>

                                    {/* Vitals History */}
                                    <div>
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 text-gray-400" /> Vitals History
                                        </h4>
                                        {loadingVitals ? (
                                            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" /></div>
                                        ) : vitalsHistory.length === 0 ? (
                                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm font-medium">
                                                No vitals recorded yet.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {vitalsHistory.slice(0, 8).map((v: any, i: number) => (
                                                    <div key={v.id || i} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-200 transition-all">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[10px] font-black text-gray-400">{v.created_at ? new Date(v.created_at).toLocaleString() : ''}</span>
                                                            <span className="text-[10px] text-gray-400">by {v.recorded_by || 'Nurse'}</span>
                                                        </div>
                                                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                                                            {v.blood_pressure && <div><p className="text-[9px] text-gray-400 font-bold">BP</p><p className="text-xs font-black text-rose-600">{v.blood_pressure}</p></div>}
                                                            {v.heart_rate && <div><p className="text-[9px] text-gray-400 font-bold">HR</p><p className="text-xs font-black text-rose-600">{v.heart_rate} bpm</p></div>}
                                                            {v.temperature && <div><p className="text-[9px] text-gray-400 font-bold">Temp</p><p className="text-xs font-black text-orange-500">{v.temperature}°F</p></div>}
                                                            {v.oxygen_sat && <div><p className="text-[9px] text-gray-400 font-bold">SpO₂</p><p className="text-xs font-black text-blue-600">{v.oxygen_sat}%</p></div>}
                                                            {v.respiratory_rate && <div><p className="text-[9px] text-gray-400 font-bold">RR</p><p className="text-xs font-black text-teal-600">{v.respiratory_rate}/m</p></div>}
                                                            {v.weight && <div><p className="text-[9px] text-gray-400 font-bold">Wt</p><p className="text-xs font-black text-violet-600">{v.weight} kg</p></div>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ═══════ NOTES TAB ═══════ */}
                            {activeTab === 'notes' && (
                                <div className="space-y-5">
                                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
                                        <h4 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-2">
                                            <Plus className="h-3.5 w-3.5 text-violet-400" /> Add Medical Note
                                        </h4>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className={labelCls}>Note Type</label>
                                                <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className={inputCls}>
                                                    <option>General</option>
                                                    <option>Assessment</option>
                                                    <option>Intervention</option>
                                                    <option>Observation</option>
                                                    <option>Medication</option>
                                                    <option>Incident</option>
                                                    <option>Discharge Note</option>
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className={labelCls}>Details</label>
                                                <textarea
                                                    value={noteDetails}
                                                    onChange={(e) => setNoteDetails(e.target.value)}
                                                    className={inputCls}
                                                    placeholder="Enter medical note details..."
                                                    rows={3}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                onClick={handleSaveNote}
                                                disabled={!noteDetails.trim() || savingNote}
                                                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/25 hover:from-violet-400 hover:to-purple-500 disabled:opacity-50 transition-all"
                                            >
                                                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                Save Note
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 text-violet-400" /> Notes History
                                        </h4>
                                        {loadingNotes ? (
                                            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin text-violet-400 mx-auto" /></div>
                                        ) : notes.length === 0 ? (
                                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm font-medium">
                                                No notes recorded yet.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {notes.map((note: any, i: number) => (
                                                    <div key={note.id || i} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-violet-200 transition-all">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 border border-violet-100">
                                                                {note.note_type || 'General'}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 font-medium">{note.created_at ? new Date(note.created_at).toLocaleString() : ''}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-600 leading-relaxed">{note.details}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ═══════ PHARMACY INDENT TAB ═══════ */}
                            {activeTab === 'pharmacy' && (
                                <div className="space-y-5">
                                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-5">
                                        <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Package className="h-3.5 w-3.5" /> Search & Add Medicines
                                        </h4>

                                        {/* Medicine Search */}
                                        <div ref={medSearchRef} className="relative">
                                            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-400/20 transition-all">
                                                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                                                <input
                                                    type="text"
                                                    value={medSearch}
                                                    onChange={(e) => handleMedSearch(e.target.value)}
                                                    onFocus={() => medSuggestions.length > 0 && setShowSuggestions(true)}
                                                    placeholder="Search medicine by brand or generic name..."
                                                    className="flex-1 text-sm font-medium text-gray-800 outline-none bg-transparent placeholder:text-gray-400"
                                                />
                                                {searchingMed && <Loader2 className="h-4 w-4 animate-spin text-orange-400 shrink-0" />}
                                            </div>

                                            {showSuggestions && medSuggestions.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                                                    {medSuggestions.map((med: any) => (
                                                        <button
                                                            key={med.id}
                                                            onClick={() => addMedicineToIndent(med)}
                                                            className="w-full text-left px-4 py-3 hover:bg-orange-50 border-b border-gray-100 last:border-0 transition-colors"
                                                        >
                                                            <p className="text-sm font-bold text-gray-800">{med.brand_name}</p>
                                                            <p className="text-[10px] text-gray-500 font-medium">{med.generic_name} &middot; {med.strength} &middot; {med.form}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Indent Lines */}
                                    {indentLines.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                <FlaskConical className="h-3.5 w-3.5 text-orange-400" /> Medicine Request List
                                            </h4>
                                            {indentLines.map((line, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`bg-white border rounded-xl p-4 transition-all ${
                                                        line.stockChecked && line.stockAvailable === 0
                                                            ? 'border-red-200 bg-red-50/30'
                                                            : line.stockChecked && line.stockAvailable < line.quantityRequested
                                                            ? 'border-amber-200 bg-amber-50/30'
                                                            : 'border-gray-200'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-black text-gray-800 truncate">{line.medicineName}</p>
                                                            <p className="text-[10px] text-gray-500 font-medium">{line.genericName} &middot; {line.strength} &middot; {line.form}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {line.checkingStock ? (
                                                                <span className="text-[10px] text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking...</span>
                                                            ) : line.stockChecked ? (
                                                                <StockBadge stock={line.stockAvailable} requested={line.quantityRequested} />
                                                            ) : null}
                                                            <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className={labelCls}>Quantity Required</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={line.quantityRequested}
                                                                onChange={(e) => {
                                                                    updateLine(idx, 'quantityRequested', Math.max(1, Number(e.target.value)));
                                                                    updateLine(idx, 'stockChecked', false);
                                                                    recheckStock(idx);
                                                                }}
                                                                className={inputCls}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className={labelCls}>Notes (optional)</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. After meals"
                                                                value={line.notes}
                                                                onChange={(e) => updateLine(idx, 'notes', e.target.value)}
                                                                className={inputCls}
                                                            />
                                                        </div>
                                                    </div>
                                                    {/* Partial stock warning */}
                                                    {line.stockChecked && line.stockAvailable > 0 && line.stockAvailable < line.quantityRequested && (
                                                        <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                            Only <strong>{line.stockAvailable}</strong> units available. Intent will be submitted for {line.stockAvailable} units; pharmacy will be notified of the shortfall of <strong>{line.quantityRequested - line.stockAvailable}</strong> units.
                                                        </div>
                                                    )}
                                                    {line.stockChecked && line.stockAvailable === 0 && (
                                                        <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
                                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                            <strong>Out of stock.</strong> Pharmacy will be notified to procure this medicine urgently.
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {/* Indent success / error */}
                                            {indentSuccess && (
                                                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
                                                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                                                    {indentSuccess}
                                                </div>
                                            )}
                                            {indentError && (
                                                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
                                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                                    {indentError}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between gap-3">
                                                {/* Nurse selector */}
                                                <div className="flex items-center gap-2">
                                                    <label className="text-xs font-bold text-gray-500 whitespace-nowrap">Requested by:</label>
                                                    <select
                                                        value={nurseId}
                                                        onChange={e => {
                                                            const nurse = nursesList.find(n => n.id === e.target.value);
                                                            setNurseId(e.target.value);
                                                            setSelectedNurseName(nurse?.name || '');
                                                        }}
                                                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-400 min-w-[160px]"
                                                    >
                                                        <option value="">— Select Nurse —</option>
                                                        {nursesList.map(n => (
                                                            <option key={n.id} value={n.id}>{n.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={handleSubmitIndent}
                                                    disabled={submittingIndent || indentLines.some((l) => l.checkingStock) || !nurseId}
                                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-500/25 hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 transition-all"
                                                >
                                                    {submittingIndent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                    Send to Pharmacy
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {indentLines.length === 0 && !indentSuccess && (
                                        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-400">
                                            <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                            <p className="text-sm font-medium">Search and add medicines above to create a pharmacy request.</p>
                                        </div>
                                    )}

                                    {indentSuccess && indentLines.length === 0 && (
                                        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                                            {indentSuccess}
                                        </div>
                                    )}

                                    {/* ── Indent History ── */}
                                    <div className="mt-4">
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                                            <ClipboardList className="h-3.5 w-3.5 text-gray-400" /> Indent History
                                        </h4>
                                        {loadingHistory ? (
                                            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
                                            </div>
                                        ) : indentHistory.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No indents placed yet for this patient.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {indentHistory.map((order: any) => (
                                                    <div key={order.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono font-bold text-gray-500">#{order.id}</span>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                                    order.status === 'Completed' || order.status === 'Dispensed'
                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                        : order.status === 'Pending'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : 'bg-blue-100 text-blue-700'
                                                                }`}>{order.status}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] text-gray-400">
                                                                    {new Date(order.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                                {order.requested_by_name && (
                                                                    <p className="text-[10px] font-bold text-teal-700">👤 {order.requested_by_name}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {order.items?.map((item: any, i: number) => (
                                                                <span key={i} className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border ${
                                                                    item.status === 'Dispensed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                    item.status === 'OutOfStock' ? 'bg-red-50 text-red-600 border-red-200' :
                                                                    'bg-white text-gray-700 border-gray-200'
                                                                }`}>
                                                                    {item.medicine_name} × {item.quantity_requested}
                                                                    {item.status === 'OutOfStock' && ' ⚠'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─────────────── Summary strip ─────────────── */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                    { label: statusFilter === 'All' ? 'Patients' : `${statusFilter}`, value: filteredPatients.length, icon: Users, color: 'text-teal-500', bg: 'bg-teal-50' },
                    { label: 'Wards / Units', value: wards.length, icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'On This Screen', value: patients.length, icon: BedDouble, color: 'text-violet-500', bg: 'bg-violet-50' },
                ].map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-center justify-between">
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-0.5 truncate">{s.label}</p>
                                <p className="text-2xl font-black text-gray-900">{s.value}</p>
                            </div>
                            <div className={`p-2.5 rounded-xl ${s.bg} shrink-0`}>
                                <Icon className={`h-5 w-5 ${s.color}`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─────────────── Filters ─────────────── */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row gap-3 lg:items-center justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by Name, IPD ID, Diagnosis..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                            {['All', 'Admitted', 'Discharged', 'Cancelled'].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === s ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        <select
                            value={selectedWard ?? ''}
                            onChange={(e) => setSelectedWard(e.target.value ? Number(e.target.value) : undefined)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        >
                            <option value="">All Wards / Units</option>
                            {wards.map((w: any) => (
                                <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5">
                            <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                            <DateField value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} title="Admitted from" className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none w-[110px]" />
                            <span className="text-gray-300 text-xs">–</span>
                            <DateField value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} title="Admitted up to" className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none w-[110px]" />
                            {(fromDate || toDate) && (
                                <button onClick={() => { setFromDate(''); setToDate(''); }} className="text-gray-400 hover:text-rose-500 shrink-0">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Age / Gender</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Ward</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Bed</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Diagnosis</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Doctor</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Admitted</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-teal-400 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredPatients.length > 0 ? (
                                filteredPatients.map((p: any) => (
                                    <tr key={p.admissionId} className="hover:bg-teal-50/40 transition-colors cursor-pointer" onClick={() => openPatientModal(p)}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-black shrink-0 text-sm">
                                                    {p.patientName?.charAt(0) || 'P'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{p.patientName}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">{p.admissionId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 font-medium">
                                            {p.age ? `${p.age}y` : ''}{p.gender ? ` / ${p.gender}` : ''}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                                                <Building2 className="h-3 w-3 text-gray-400" />{p.wardName}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                                                <BedDouble className="h-3 w-3 text-blue-400" />{p.bedLabel || p.bedId || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 font-medium max-w-[200px] truncate">{p.diagnosis || 'N/A'}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                                                <Stethoscope className="h-3 w-3 text-gray-400" />{p.doctorName || 'Unassigned'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-xs">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString('en-GB') : 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="inline-flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm shadow-teal-500/20 transition-all">
                                                <Activity className="h-3.5 w-3.5" /> Nursing Action
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        <Users className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No patients found for this filter.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
