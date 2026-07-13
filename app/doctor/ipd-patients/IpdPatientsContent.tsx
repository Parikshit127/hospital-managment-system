'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, BedDouble, Loader2, Users } from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

interface IpdAdmissionRow {
    admission_id: string;
    patient_id: string;
    status: string;
    diagnosis: string | null;
    doctor_name: string | null;
    admission_date: string;
    daysAdmitted: number;
    wardName: string;
    bed_id: string | null;
    patient: {
        full_name: string;
        patient_id: string;
        age: string | null;
        gender: string | null;
    };
}

export default function IpdPatientsContent() {
    const toast = useToast();
    const [admissions, setAdmissions] = useState<IpdAdmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const res = await getIPDAdmissions('Admitted');
            if (cancelled) return;
            if (res.success) {
                setAdmissions(res.data as IpdAdmissionRow[]);
            } else {
                toast.error(res.error || 'Failed to load IPD patients');
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return admissions;
        return admissions.filter((a) =>
            a.patient.full_name.toLowerCase().includes(term) ||
            a.patient.patient_id.toLowerCase().includes(term)
        );
    }, [admissions, searchTerm]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                    <BedDouble className="h-6 w-6 text-teal-500" /> IPD Patients
                </h1>
                <span className="bg-orange-500/10 text-teal-600 text-xs px-3 py-1 rounded-lg font-black border border-orange-500/20">
                    {filtered.length} Admitted
                </span>
            </div>

            <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                    type="text"
                    placeholder="Search by patient name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900"
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading IPD patients...
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-gray-200" />
                    No IPD patients currently admitted.
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">
                                <th className="px-5 py-3">Patient</th>
                                <th className="px-5 py-3">Ward / Bed</th>
                                <th className="px-5 py-3">Admitted</th>
                                <th className="px-5 py-3">Diagnosis</th>
                                <th className="px-5 py-3">Attending Doctor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((a) => (
                                <tr key={a.admission_id} className="border-b border-gray-100 last:border-0 hover:bg-orange-500/5 transition-colors">
                                    <td className="px-5 py-4">
                                        <Link href={`/doctor/ipd-patients/${a.admission_id}`} className="font-bold text-gray-900 hover:text-orange-600 hover:underline underline-offset-2">
                                            {a.patient.full_name}
                                        </Link>
                                        <div className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                            {a.patient.patient_id}
                                            {a.patient.age ? ` • ${a.patient.age}y` : ''}
                                            {a.patient.gender ? ` / ${a.patient.gender}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {a.wardName}{a.bed_id ? ` • ${a.bed_id}` : ''}
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {new Date(a.admission_date).toLocaleDateString('en-GB')}
                                        <div className="text-[10px] text-gray-400 font-semibold">{a.daysAdmitted} day{a.daysAdmitted === 1 ? '' : 's'}</div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium max-w-xs truncate">
                                        {a.diagnosis || <span className="text-gray-300">Not recorded</span>}
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {a.doctor_name || <span className="text-gray-300">Unassigned</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
