'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { LayoutDashboard, Calendar, Pill, FileText, ChevronRight } from 'lucide-react';
import { getPatientDashboardData } from '@/app/actions/patient-actions';
import Link from 'next/link';

export default function PatientDashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientDashboardData();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Loading Patient Portal...</div></AppShell>;
    if (!data?.patient) return <AppShell pageTitle="Error"><div className="p-10 text-center text-red-500 font-bold">Failed to load patient context.</div></AppShell>;

    return (
        <AppShell
            pageTitle="Welcome Back, "
            pageIcon={<LayoutDashboard className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="mb-8">
                <h1 className="text-3xl font-black text-gray-900">{data.patient.full_name}</h1>
                <p className="text-gray-500 font-medium mt-1">Patient ID: {data.patient.patient_id} • Member since {new Date(data.patient.registration_date).getFullYear()}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {/* Quick Links */}
                <Link href="/patient/appointments/book" className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Calendar className="absolute right-[-10px] bottom-[-10px] h-24 w-24 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-black mb-1">Book Appointment</h3>
                    <p className="text-indigo-100 text-sm font-medium">Schedule a visit with your doctor</p>
                </Link>

                <Link href="/patient/records" className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <FileText className="absolute right-[-10px] bottom-[-10px] h-24 w-24 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-black mb-1">Medical Records</h3>
                    <p className="text-emerald-100 text-sm font-medium">View your lab results & reports</p>
                </Link>

                <Link href="/patient/prescriptions" className="bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Pill className="absolute right-[-10px] bottom-[-10px] h-24 w-24 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-black mb-1">My Prescriptions</h3>
                    <p className="text-purple-100 text-sm font-medium">Active medications & refills</p>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Appointments */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-500" /> Upcoming Visits</h3>
                    </div>
                    <div className="space-y-4">
                        {data.upcomingAppointments?.length > 0 ? data.upcomingAppointments.map((app: any) => (
                            <div key={app.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{new Date(app.appointment_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                                    <p className="text-xs text-indigo-600 font-bold uppercase mt-1">Dr. ID: {app.doctor_id} • {app.department}</p>
                                </div>
                                <span className="bg-white px-3 py-1 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 shadow-sm">
                                    {new Date(app.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <p className="text-sm font-medium">No upcoming appointments scheduled.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Active Prescriptions */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Pill className="h-5 w-5 text-purple-500" /> Recent Prescriptions</h3>
                        <Link href="/patient/prescriptions" className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center">View All <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="space-y-4">
                        {data.activePrescriptions?.length > 0 ? data.activePrescriptions.map((rx: any) => (
                            <div key={rx.prescription_id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:border-purple-200 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{new Date(rx.prescription_date).toLocaleDateString()}</p>
                                        <p className="text-sm font-bold text-gray-900 line-clamp-2">{rx.medications_json ? JSON.parse(rx.medications_json).map((m: any) => m.name).join(', ') : 'Medication info encrypted'}</p>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:bg-purple-50 group-hover:text-purple-600 group-hover:border-purple-200 transition-colors">
                                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-600" />
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <p className="text-sm font-medium">No recent prescriptions on file.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
