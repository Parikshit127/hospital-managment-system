'use client';

import React from 'react';
import { Clipboard, Save, Loader2 } from 'lucide-react';

const inputCls = "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";
const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1 block mb-1.5";

interface NotesTabProps {
    patient: any;
    diagnosis: string;
    setDiagnosis: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    medicalNoteType: string;
    setMedicalNoteType: (v: string) => void;
    medicalNoteDetails: string;
    setMedicalNoteDetails: (v: string) => void;
    isSubmitting: boolean;
    onSave: () => void;
}

export function NotesTab({ patient, diagnosis, setDiagnosis, notes, setNotes, medicalNoteType, setMedicalNoteType, medicalNoteDetails, setMedicalNoteDetails, isSubmitting, onSave }: NotesTabProps) {
    return (
        <div className="max-w-3xl space-y-6">
            {patient.status === 'Admitted' ? (<>
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
                <button onClick={onSave} disabled={isSubmitting} className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save Record</>}
                </button>
            </div>
        </div>
    );
}
