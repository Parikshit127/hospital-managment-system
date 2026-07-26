'use client';

import { useRouter } from 'next/navigation';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, BedDouble, Loader2, Users } from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';
import { fmtIstDate } from '@/app/lib/ist';

interface IpdAdmissionRow {
    admission_id: string;
    patient_id: string;
    status: string;
    diagnosis: string | null;
    doctor_name: string | null;
    admission_date: string;
    discharge_date: string | null;
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

type StatusFilter = 'Admitted' | 'Discharged' | 'All';

export default function IpdPatientsContent() {
    const router = useRouter();
    const toast = useToast();
    const [admissions, setAdmissions] = useState<IpdAdmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    // Was hardcoded to 'Admitted', so a patient vanished from the doctor's list
    // the moment they were discharged -- taking the only route to their discharge
    // summary with them (the detail page itself works fine for any status).
    // Defaults to 'Admitted' to preserve the ward-round view.
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('Admitted');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const res = await getIPDAdmissions(statusFilter === 'All' ? undefined : statusFilter);
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
    }, [statusFilter]);

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
                    {filtered.length} {statusFilter === 'All' ? 'Total' : statusFilter}
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative max-w-md flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input
                        type="text"
                        placeholder="Search by patient name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-900 focus:ring-2 focus:ring-orange-500/20 outline-none"
                >
                    <option value="Admitted">Currently Admitted</option>
                    <option value="Discharged">Discharged</option>
                    <option value="All">All</option>
                </select>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading IPD patients...
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-gray-200" />
                    {statusFilter === 'Admitted' ? 'No IPD patients currently admitted.'
                        : statusFilter === 'Discharged' ? 'No discharged IPD patients found.'
                        : 'No IPD patients found.'}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">
                                <th className="px-5 py-3">Patient</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Ward / Bed</th>
                                <th className="px-5 py-3">Admitted</th>
                                <th className="px-5 py-3">Diagnosis</th>
                                <th className="px-5 py-3">Attending Doctor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((a) => (
                                // The whole row opens the patient. Only the name was
                                // clickable, so a click anywhere else did nothing and
                                // looked broken.
                                <tr key={a.admission_id}
                                    onClick={() => router.push(`/doctor/ipd-patients/${a.admission_id}`)}
                                    className="border-b border-gray-100 last:border-0 hover:bg-orange-500/5 transition-colors cursor-pointer">
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
                                    <td className="px-5 py-4">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide border ${
                                            a.status === 'Admitted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : a.status === 'Discharged' ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : 'bg-gray-100 text-gray-500 border-gray-200'
                                        }`}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {a.wardName}{a.bed_id ? ` • ${a.bed_id}` : ''}
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {fmtIstDate(a.admission_date)}
                                        {a.discharge_date && (
                                            <div className="text-[10px] text-gray-400 font-semibold">
                                                Discharged {fmtIstDate(a.discharge_date)}
                                            </div>
                                        )}
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
