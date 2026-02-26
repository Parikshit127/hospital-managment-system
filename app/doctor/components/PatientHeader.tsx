'use client';

import React from 'react';
import { User, Clock, Stethoscope, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface PatientHeaderProps {
    patient: any;
    isSubmitting: boolean;
    isDischarging: boolean;
    onStatusUpdate: (status: string) => void;
    onAdmit: () => void;
    onDischarge: () => void;
}

export function PatientHeader({ patient, isSubmitting, isDischarging, onStatusUpdate, onAdmit, onDischarge }: PatientHeaderProps) {
    return (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-teal-500/20 transition-all">
            <div className="flex items-center gap-5">
                <div className="h-14 w-14 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-2xl border border-gray-200 flex items-center justify-center"><User className="h-7 w-7 text-violet-400" /></div>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{patient.full_name}</h1>
                        <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-black px-2 py-1 rounded-lg">ID: {patient.digital_id || patient.patient_id}</span>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                        {patient.age && <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><User className="h-3 w-3" /> {patient.age}y{patient.gender ? ` / ${patient.gender}` : ''}</span>}
                        <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><Clock className="h-3 w-3" /> {new Date(patient.created_at).toLocaleTimeString()}</span>
                        <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200"><Stethoscope className="h-3 w-3" /> {patient.department}</span>
                    </div>
                </div>
            </div>
            <div className="flex gap-3 items-center">
                <select value={patient.status || 'Pending'} onChange={(e) => onStatusUpdate(e.target.value)} disabled={isSubmitting} className="bg-white border border-gray-300 text-gray-900 text-sm rounded-xl focus:ring-teal-500 p-2.5 font-bold outline-none appearance-none">
                    {['Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'Admitted'].map(s => <option key={s} value={s} className="bg-white text-gray-900">{s}</option>)}
                </select>
                {patient.status === 'Admitted' ? (
                    <button onClick={onDischarge} disabled={isDischarging} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm rounded-xl hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50">
                        {isDischarging ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> DISCHARGE</>}
                    </button>
                ) : (
                    <button onClick={onAdmit} disabled={isSubmitting} className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold text-sm rounded-xl hover:from-rose-400 hover:to-rose-500 shadow-lg shadow-rose-500/20 flex items-center gap-2 disabled:opacity-50">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><AlertTriangle className="h-4 w-4" /> ADMIT</>}
                    </button>
                )}
            </div>
        </div>
    );
}
