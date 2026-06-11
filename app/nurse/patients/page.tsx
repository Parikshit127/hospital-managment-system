'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Users, Search, X, FileText, Loader2, Clock, User,
    BedDouble, Building2, Stethoscope, Plus, Save, Calendar, Activity
} from 'lucide-react';
import {
    getWardPatients, getWardsList, getNursingNotes, addNursingNote
} from '@/app/actions/nurse-actions';

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
    const [notes, setNotes] = useState<any[]>([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [noteType, setNoteType] = useState('General');
    const [noteDetails, setNoteDetails] = useState('');
    const [savingNote, setSavingNote] = useState(false);

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

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [patientsRes, wardsRes] = await Promise.all([
                getWardPatients(selectedWard, statusFilter),
                getWardsList(),
            ]);
            if (patientsRes.success) setPatients(patientsRes.data || []);
            if (wardsRes.success) setWards(wardsRes.data || []);
        } catch (e) {
            console.error('Failed to load data', e);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [selectedWard, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openPatientModal = async (patient: any) => {
        setSelectedPatient(patient);
        setShowModal(true);
        setNoteType('General');
        setNoteDetails('');
        setLoadingNotes(true);
        try {
            const res = await getNursingNotes(patient.admissionId);
            if (res.success) setNotes(res.data || []);
        } catch (e) {
            console.error('Failed to load notes', e);
        } finally {
            setLoadingNotes(false);
        }
    };

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
                // Refresh notes
                const notesRes = await getNursingNotes(selectedPatient.admissionId);
                if (notesRes.success) setNotes(notesRes.data || []);
            }
        } catch (e) {
            console.error('Failed to save note', e);
        } finally {
            setSavingNote(false);
        }
    };

    const filteredPatients = patients.filter(p => {
        // Admission-date range (local calendar date)
        if (fromDate || toDate) {
            const d = p.admissionDate ? new Date(p.admissionDate) : null;
            const day = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
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

    const inputCls = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";
    const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1 block mb-1.5";

    return (
        <AppShell
            pageTitle="Ward Patients"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            {/* Patient Detail Modal */}
            {showModal && selectedPatient && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-black text-lg flex items-center gap-2">
                                    <User className="h-5 w-5 text-teal-400" />
                                    {selectedPatient.patientName}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {selectedPatient.wardName} &middot; Bed #{selectedPatient.bedId || 'N/A'} &middot; Dr. {selectedPatient.doctorName || 'Unassigned'}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full hover:bg-gray-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Patient Info Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Age</p>
                                    <p className="text-sm font-black text-gray-700">{selectedPatient.age || 'N/A'}</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Gender</p>
                                    <p className="text-sm font-black text-gray-700">{selectedPatient.gender || 'N/A'}</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Ward Type</p>
                                    <p className="text-sm font-black text-gray-700">{selectedPatient.wardType || 'N/A'}</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Admitted</p>
                                    <p className="text-sm font-black text-gray-700">
                                        {selectedPatient.admissionDate ? new Date(selectedPatient.admissionDate).toLocaleDateString('en-GB') : 'N/A'}
                                    </p>
                                </div>
                            </div>

                            {/* Diagnosis */}
                            {selectedPatient.diagnosis && (
                                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-wider mb-1">Diagnosis</p>
                                    <p className="text-sm font-bold text-orange-700">{selectedPatient.diagnosis}</p>
                                </div>
                            )}

                            {/* Add Nursing Note */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <Plus className="h-3 w-3 text-teal-400" /> Add Nursing Note
                                </h4>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <label className={labelCls}>Note Type</label>
                                        <select
                                            value={noteType}
                                            onChange={e => setNoteType(e.target.value)}
                                            className={inputCls}
                                        >
                                            <option>General</option>
                                            <option>Assessment</option>
                                            <option>Intervention</option>
                                            <option>Observation</option>
                                            <option>Medication</option>
                                            <option>Incident</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className={labelCls}>Details</label>
                                        <textarea
                                            value={noteDetails}
                                            onChange={e => setNoteDetails(e.target.value)}
                                            className={inputCls}
                                            placeholder="Enter nursing note details..."
                                            rows={2}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleSaveNote}
                                        disabled={!noteDetails.trim() || savingNote}
                                        className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-sm rounded-xl hover:from-teal-400 hover:to-emerald-500 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-500/20"
                                    >
                                        {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Save Note
                                    </button>
                                </div>
                            </div>

                            {/* Nursing Notes History */}
                            <div>
                                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <FileText className="h-3 w-3 text-violet-400" /> Nursing Notes History
                                </h4>
                                {loadingNotes ? (
                                    <div className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" />
                                    </div>
                                ) : notes.length === 0 ? (
                                    <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                                        No nursing notes recorded yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {notes.map((note: any, i: number) => (
                                            <div key={note.id || i} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-orange-500/20 transition-all">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-50 text-violet-500 border border-violet-200">
                                                        {note.note_type || 'General'}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-medium">
                                                        {note.created_at ? new Date(note.created_at).toLocaleString() : ''}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 leading-relaxed">{note.details}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row gap-3 lg:items-center justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by Name, IPD ID, or Mobile..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        />
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Status chips */}
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

                        {/* Ward */}
                        <select
                            value={selectedWard ?? ''}
                            onChange={e => setSelectedWard(e.target.value ? Number(e.target.value) : undefined)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        >
                            <option value="">All Wards / Units</option>
                            {wards.map((w: any) => (
                                <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>
                            ))}
                        </select>

                        {/* Admission date range */}
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5">
                            <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                            <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} title="Admitted from"
                                className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none w-[110px]" />
                            <span className="text-gray-300 text-xs">–</span>
                            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} title="Admitted up to"
                                className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none w-[110px]" />
                            {(fromDate || toDate) && (
                                <button onClick={() => { setFromDate(''); setToDate(''); }} title="Clear dates" className="text-gray-400 hover:text-rose-500 shrink-0">
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
                                    <tr
                                        key={p.admissionId}
                                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                                        onClick={() => openPatientModal(p)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-black shrink-0">
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
                                                <Building2 className="h-3 w-3 text-gray-400" />
                                                {p.wardName}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                                                <BedDouble className="h-3 w-3 text-blue-400" />
                                                {p.bedLabel || p.bedId || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 font-medium max-w-[200px] truncate">
                                            {p.diagnosis || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                                                <Stethoscope className="h-3 w-3 text-gray-400" />
                                                {p.doctorName || 'Unassigned'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-xs">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString('en-GB') : 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all">
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
