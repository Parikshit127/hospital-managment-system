'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, User, Clock, CreditCard } from 'lucide-react';
import { getPatientAllergies } from '@/app/actions/emr-actions';

type Allergy = { id: string; allergen_name: string; severity: string };

interface PatientSummaryBarProps {
    patient: {
        patient_id: string;
        full_name: string;
        age?: string | null;
        gender?: string | null;
        patient_type?: string;
        department?: string | null;
    };
    lastVisit?: { date: string; diagnosis: string } | null;
    activeMedCount?: number;
}

const PT_BADGE: Record<string, string> = {
    cash: 'bg-teal-100 text-teal-700',
    corporate: 'bg-blue-100 text-blue-700',
    tpa_insurance: 'bg-amber-100 text-amber-700',
};
const PT_LABEL: Record<string, string> = {
    cash: 'Cash',
    corporate: 'Corporate',
    tpa_insurance: 'TPA',
};

export function PatientSummaryBar({ patient, lastVisit, activeMedCount = 0 }: PatientSummaryBarProps) {
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [loadingAllergies, setLoadingAllergies] = useState(true);

    useEffect(() => {
        setLoadingAllergies(true);
        getPatientAllergies(patient.patient_id).then(r => {
            if (r.success) setAllergies(r.data as Allergy[]);
            setLoadingAllergies(false);
        });
    }, [patient.patient_id]);

    const hasSevereAllergy = allergies.some(a => a.severity === 'severe' || a.severity === 'life_threatening');

    return (
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3 mb-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
                {/* Patient Info */}
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-violet-500" />
                    </div>
                    <div>
                        <p className="font-black text-gray-900 text-sm leading-tight">{patient.full_name}</p>
                        <p className="text-xs text-gray-500 font-medium">
                            {patient.age ? `${patient.age}y` : ''}{patient.gender ? ` · ${patient.gender}` : ''} · {patient.patient_id}
                        </p>
                    </div>
                </div>

                <div className="w-px h-8 bg-gray-200 hidden sm:block" />

                {/* Patient Type */}
                {patient.patient_type && (
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide flex items-center gap-1 ${PT_BADGE[patient.patient_type] || 'bg-gray-100 text-gray-600'}`}>
                        <CreditCard className="h-3 w-3" />
                        {PT_LABEL[patient.patient_type] || patient.patient_type}
                    </span>
                )}

                <div className="w-px h-8 bg-gray-200 hidden sm:block" />

                {/* Allergy Strip */}
                <div className="flex items-center gap-2">
                    {loadingAllergies ? (
                        <span className="text-xs text-gray-400">Loading...</span>
                    ) : allergies.length === 0 ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-700">NKA</span>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border ${hasSevereAllergy ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}`}>
                            <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${hasSevereAllergy ? 'text-red-600' : 'text-amber-600'}`} />
                            <div className="flex gap-1 flex-wrap max-w-[300px]">
                                {allergies.map(a => (
                                    <span key={a.id} className={`text-[10px] font-black ${hasSevereAllergy ? 'text-red-700' : 'text-amber-700'}`}>
                                        {a.allergen_name} ({a.severity})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-8 bg-gray-200 hidden sm:block" />

                {/* Last Visit */}
                {lastVisit && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>Last: <span className="font-bold text-gray-700">{lastVisit.date}</span></span>
                        {lastVisit.diagnosis && (
                            <span className="text-gray-400">· {lastVisit.diagnosis}</span>
                        )}
                    </div>
                )}

                {/* Active Meds */}
                {activeMedCount > 0 && (
                    <span className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg">
                        {activeMedCount} Active Med{activeMedCount !== 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </div>
    );
}
