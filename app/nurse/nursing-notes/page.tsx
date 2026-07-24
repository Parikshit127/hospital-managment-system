'use client';

// Dedicated Nursing Notes section — pick an admitted patient on the left, read
// and record their nursing notes on the right. Reuses the existing
// addNursingNote / getNursingNotes actions (same data the "Nursing Notes" tab
// under My Patients writes to), so nurses have one obvious place to find them.

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ScrollText, Search, Loader2, Clock, User, BedDouble, Plus, Save, FileText,
} from 'lucide-react';
import { getWardPatients, getNursingNotes, addNursingNote } from '@/app/actions/nurse-actions';
import { useToast } from '@/app/components/ui/Toast';

const NOTE_TYPES = ['General', 'Assessment', 'Intervention', 'Observation', 'Medication', 'Incident', 'Discharge Note'];

function formatWhen(d: string | Date): string {
    return new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export default function NurseNursingNotesPage() {
    const toast = useToast();
    const [nurseId, setNurseId] = useState('');
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<any | null>(null);

    const [notes, setNotes] = useState<any[]>([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [noteType, setNoteType] = useState('General');
    const [details, setDetails] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/session');
                if (res.ok) { const d = await res.json(); setNurseId(d.id || ''); }
            } catch (e) { console.error(e); }
        })();
    }, []);

    const loadPatients = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getWardPatients(undefined, 'Admitted');
            if (res.success) setPatients(res.data || []);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => { setLoading(true); loadPatients(); }, [loadPatients]);

    const loadNotes = useCallback(async (admissionId: string) => {
        setNotesLoading(true);
        try {
            const res = await getNursingNotes(admissionId);
            if (res.success) setNotes(res.data || []);
        } finally {
            setNotesLoading(false);
        }
    }, []);

    const selectPatient = (p: any) => {
        setSelected(p);
        setNotes([]);
        setDetails('');
        setNoteType('General');
        loadNotes(p.admissionId);
    };

    const handleAdd = async () => {
        if (!selected) return;
        const text = details.trim();
        if (!text) return;
        if (!nurseId) { toast.error('Session not ready — please refresh.'); return; }
        setSaving(true);
        try {
            const res = await addNursingNote({ admissionId: selected.admissionId, nurseId, noteType, details: text });
            if (res.success) {
                setDetails('');
                await loadNotes(selected.admissionId);
                toast.success('Nursing note added.');
            } else {
                toast.error(res.error || 'Failed to add note.');
            }
        } finally {
            setSaving(false);
        }
    };

    const filtered = patients.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.patientName?.toLowerCase().includes(q) || p.patientId?.toLowerCase().includes(q) || p.bedLabel?.toLowerCase?.().includes(q);
    });

    return (
        <AppShell
            pageTitle="Nursing Notes"
            pageIcon={<ScrollText className="h-5 w-5" />}
            onRefresh={loadPatients}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                {/* Patient list */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-160px)]">
                    <div className="p-3 border-b border-gray-100 bg-gray-50/60">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search admitted patients…"
                                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-teal-400" /></div>
                        ) : filtered.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-10">No admitted patients found.</p>
                        ) : filtered.map(p => (
                            <button
                                key={p.admissionId}
                                onClick={() => selectPatient(p)}
                                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${selected?.admissionId === p.admissionId ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-teal-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-gray-800 truncate">{p.patientName}</p>
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <BedDouble className="h-3 w-3" /> {p.wardName} · {p.bedLabel || 'No bed'}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notes panel */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 min-h-[300px]">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-16">
                            <ScrollText className="h-10 w-10 text-gray-200 mb-3" />
                            <p className="font-bold text-gray-600">Select a patient to view and add nursing notes</p>
                            <p className="text-xs text-gray-400 mt-1">Notes you add here also appear on the patient&apos;s Patient Details.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
                                    <User className="h-4 w-4 text-teal-500" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">{selected.patientName}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{selected.admissionId}</p>
                                </div>
                            </div>

                            {/* Add note */}
                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Note Type</label>
                                        <select value={noteType} onChange={e => setNoteType(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 outline-none">
                                            {NOTE_TYPES.map(t => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Note</label>
                                        <textarea
                                            value={details}
                                            onChange={e => setDetails(e.target.value)}
                                            rows={3}
                                            maxLength={2000}
                                            placeholder="Write the nursing note…"
                                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 outline-none resize-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleAdd}
                                        disabled={saving || !details.trim()}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        Add Note
                                    </button>
                                </div>
                            </div>

                            {/* History */}
                            <div className="mt-5">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" /> Notes History {notes.length > 0 && <span className="text-gray-300">({notes.length})</span>}
                                </h3>
                                {notesLoading ? (
                                    <div className="flex items-center justify-center h-16"><Loader2 className="h-4 w-4 animate-spin text-teal-400" /></div>
                                ) : notes.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic py-3">No nursing notes yet for this patient.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {notes.map((n: any) => (
                                            <div key={n.id} className="border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-wide text-teal-600 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">{n.note_type || 'General'}</span>
                                                    <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {formatWhen(n.created_at)}</span>
                                                </div>
                                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.details}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
