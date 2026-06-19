'use client';

import React, { useEffect, useState } from 'react';
import { StickyNote, Loader2, Plus, Clock } from 'lucide-react';
import {
    addPatientNote,
    getPatientNotes,
    type PatientNoteDTO,
} from '@/app/actions/patient-note-actions';

interface PatientNotesProps {
    patientId: string;
    /** Where the note is being added from — stored for context. */
    source?: 'admission' | 'registration' | 'profile';
    /** Optional heading override. */
    title?: string;
    className?: string;
}

function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export function PatientNotes({
    patientId,
    source = 'profile',
    title = 'Patient Notes',
    className = '',
}: PatientNotesProps) {
    const [notes, setNotes] = useState<PatientNoteDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!patientId) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            const res = await getPatientNotes(patientId);
            if (cancelled) return;
            if (res.success) setNotes(res.data);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [patientId]);

    async function handleAdd() {
        const text = draft.trim();
        if (!text) return;
        setSaving(true);
        setError(null);
        const res = await addPatientNote(patientId, text, source);
        setSaving(false);
        if (res.success) {
            setNotes(prev => [res.data, ...prev]);
            setDraft('');
        } else {
            setError(res.error || 'Failed to add note');
        }
    }

    return (
        <div className={`bg-white border border-gray-200 rounded-2xl p-5 ${className}`}>
            <div className="flex items-center gap-2 mb-4">
                <StickyNote className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h3>
                {!loading && notes.length > 0 && (
                    <span className="ml-auto text-xs text-gray-400">{notes.length}</span>
                )}
            </div>

            {/* Add box */}
            <div className="space-y-2">
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Add a note about this patient…"
                    rows={2}
                    maxLength={2000}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10 outline-none transition resize-none"
                />
                <div className="flex items-center justify-between">
                    {error ? (
                        <span className="text-xs text-red-600">{error}</span>
                    ) : <span />}
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={saving || !draft.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Add Note
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="mt-4 space-y-2">
                {loading ? (
                    <div className="flex items-center justify-center h-16">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    </div>
                ) : notes.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">No notes yet.</p>
                ) : (
                    notes.map(n => (
                        <div key={n.id} className="border border-gray-100 bg-gray-50 rounded-xl px-3 py-2">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-400">
                                <Clock className="h-3 w-3" />
                                <span>{formatWhen(n.created_at)}</span>
                                {(n.created_by_name || n.created_by) && (
                                    <>
                                        <span>·</span>
                                        <span>
                                            {n.created_by_name || n.created_by}
                                            {n.created_by_role ? ` (${n.created_by_role})` : ''}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default PatientNotes;
