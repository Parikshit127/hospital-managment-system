'use client';

import React, { useState, useEffect } from 'react';
import {
    Stethoscope, Users, X, Loader2, Clock, User, Search,
    Activity, Phone, Mail
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { getUsersList } from '@/app/actions/admin-actions';
import { getPatientQueue } from '@/app/actions/doctor-actions';

export default function AdminDoctorsPage() {
    const [doctors, setDoctors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
    const [doctorQueue, setDoctorQueue] = useState<any[]>([]);
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const loadDoctors = async () => {
        setLoading(true);
        const res = await getUsersList({ role: 'doctor', is_active: true, page: 1, limit: 50 });
        if (res.success) {
            setDoctors(res.data?.users || []);
        }
        setLoading(false);
    };

    useEffect(() => { loadDoctors(); }, []);

    const handleDoctorClick = async (doctor: any) => {
        setSelectedDoctor(doctor);
        setLoadingQueue(true);
        const res = await getPatientQueue({ view: 'my', doctor_id: doctor.id });
        if (res.success) {
            setDoctorQueue(res.data);
        } else {
            setDoctorQueue([]);
        }
        setLoadingQueue(false);
    };

    const filteredDoctors = doctors.filter(d => {
        const term = searchTerm.toLowerCase();
        return (d.name || '').toLowerCase().includes(term) ||
            (d.username || '').toLowerCase().includes(term) ||
            (d.specialty || '').toLowerCase().includes(term);
    });

    return (
        <AdminPage pageTitle="Doctor Console" pageIcon={<Stethoscope className="h-5 w-5" />}
            onRefresh={loadDoctors} refreshing={loading}>
            <div className="space-y-6">
                {/* Search + Stats */}
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[250px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search doctors by name, username, or specialty..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 font-medium"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
                        <Stethoscope className="h-4 w-4 text-violet-500" />
                        <span className="text-sm font-bold text-violet-700">{doctors.length} Active Doctors</span>
                    </div>
                </div>

                {/* Doctor Cards Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    </div>
                ) : filteredDoctors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Stethoscope className="h-12 w-12 mb-3 text-gray-300" />
                        <p className="text-sm font-bold">No doctors found</p>
                        <p className="text-xs mt-1">Try adjusting your search or add doctors from Staff Management.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDoctors.map((doctor: any) => (
                            <button
                                key={doctor.id}
                                onClick={() => handleDoctorClick(doctor)}
                                className={`text-left p-5 bg-white border rounded-2xl shadow-sm hover:shadow-md hover:border-violet-300 transition-all group ${selectedDoctor?.id === doctor.id ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="h-12 w-12 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-xl border border-violet-200 flex items-center justify-center shrink-0">
                                        <Stethoscope className="h-6 w-6 text-violet-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-violet-600 transition-colors truncate">
                                            {doctor.name || doctor.username}
                                        </h3>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            {doctor.specialty || 'General Practice'}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                                @{doctor.username}
                                            </span>
                                            {doctor.is_active && (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        {(doctor.phone || doctor.email) && (
                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                                {doctor.phone && (
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3" /> {doctor.phone}
                                                    </span>
                                                )}
                                                {doctor.email && (
                                                    <span className="flex items-center gap-1">
                                                        <Mail className="h-3 w-3" /> {doctor.email}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Doctor Queue Sidebar/Drawer */}
            {selectedDoctor && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDoctor(null)} />
                    <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-violet-50 text-violet-900">
                            <div>
                                <h2 className="text-base font-bold">
                                    {selectedDoctor.name || selectedDoctor.username}
                                </h2>
                                <p className="text-[10px] font-medium opacity-80">
                                    {selectedDoctor.specialty || 'General Practice'} • Patient Queue
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedDoctor(null)}
                                className="p-1.5 rounded-lg hover:bg-violet-200 text-violet-600 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Queue Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
                                Current Patient Queue
                            </h3>
                            {loadingQueue ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                                </div>
                            ) : doctorQueue.length > 0 ? (
                                <div className="space-y-3">
                                    {doctorQueue.map((patient: any, idx: number) => (
                                        <div key={patient.internal_id || idx} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900">
                                                        {patient.full_name || 'Unknown Patient'}
                                                    </h4>
                                                    <p className="text-[10px] font-mono text-gray-400">
                                                        {patient.digital_id || patient.patient_id}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-md ${patient.status === 'In Progress'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : patient.status === 'Completed'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {patient.status}
                                                </span>
                                            </div>
                                            <div className="flex gap-4 text-[10px] text-gray-500 font-medium">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {patient.appointment_date
                                                        ? new Date(patient.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                                                        : 'N/A'}
                                                </span>
                                                {patient.age && <span>Age: {patient.age}</span>}
                                                {patient.gender && <span>{patient.gender}</span>}
                                                {patient.department && (
                                                    <span className="flex items-center gap-1">
                                                        <Activity className="h-3 w-3" /> {patient.department}
                                                    </span>
                                                )}
                                            </div>
                                            {patient.reason_for_visit && (
                                                <p className="text-[10px] text-gray-400 mt-2 truncate bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                                    {patient.reason_for_visit}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs font-bold">No patients in queue</p>
                                    <p className="text-[10px] mt-1">This doctor has no active patients right now.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
