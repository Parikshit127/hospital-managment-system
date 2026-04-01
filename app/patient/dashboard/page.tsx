'use client';

import React, { useState } from 'react';
import { Calendar, Pill, FileText, ChevronRight, Heart, Activity, Wind, Thermometer, CreditCard, FlaskConical, RefreshCw, Video, X } from 'lucide-react';
import { usePatientDashboard, useVideoCalls } from '@/app/lib/hooks/usePatientData';
import { usePullToRefresh } from '@/app/lib/hooks/usePullToRefresh';
import { requestVideoCall } from '@/app/actions/video-call-actions';
import { getActiveDoctors } from '@/app/actions/doctor-list-actions';
import { useToast } from '@/app/components/ui/Toast';
import Link from 'next/link';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

// Guarantees link always opens externally
const safeUrl = (url?: string) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
};

function daysUntil(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
}

function VideoCallStatus() {
    const { requests, refresh } = useVideoCalls();
    const active = requests.filter((r: any) => r.status === 'Pending' || r.status === 'Accepted')[0];

    if (!active) return null;

    return (
        <div className={`p-5 rounded-2xl border-2 flex flex-col sm:flex-row items-center justify-between gap-4 ${active.status === 'Accepted' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${active.status === 'Accepted' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                    <Video className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="font-black text-gray-900">{active.status === 'Accepted' ? 'Video Call Accepted' : 'Call Request Pending'}</h3>
                    <p className="text-sm text-gray-600 font-medium">
                        {active.status === 'Accepted' 
                            ? `Scheduled for: ${new Date(active.scheduled_at!).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}` 
                            : 'Waiting for your doctor to respond...'}
                    </p>
                </div>
            </div>
            {active.status === 'Accepted' && active.meet_link && (
                <button
                    onClick={() => window.open(safeUrl(active.meet_link), '_blank', 'noopener,noreferrer')}
                    className="w-full sm:w-auto bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-sm text-center hover:bg-emerald-700 transition"
                >
                    JOIN VIDEO CALL
                </button>
            )}
        </div>
    );
}

function DoctorSelectionModal({ isOpen, onClose, onSelect, loading }: any) {
    const [doctors, setDoctors] = useState<any[]>([]);
    const [fetching, setFetching] = useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setFetching(true);
            getActiveDoctors().then(res => {
                if (res.success) setDoctors(res.data);
                setFetching(false);
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-black text-xl flex items-center gap-3">
                        <Video className="h-6 w-6 text-rose-500" /> Select Doctor
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3">
                    {fetching ? (
                        <div className="text-center py-10 text-gray-400 font-medium animate-pulse">Loading doctors...</div>
                    ) : doctors.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 font-medium">No doctors available.</div>
                    ) : doctors.map((doc: any) => (
                        <button 
                            key={doc.id}
                            disabled={loading}
                            onClick={() => onSelect(doc)}
                            className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group flex items-center justify-between"
                        >
                            <div>
                                <p className="font-black text-gray-900 group-hover:text-emerald-700">Dr. {doc.name}</p>
                                <p className="text-xs text-gray-500 font-bold uppercase">{doc.specialty || 'General'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-emerald-600 font-black text-sm">₹{doc.consultation_fee}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Consult Fee</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function PatientDashboard() {
    const { data, error, isLoading, isValidating, refresh } = usePatientDashboard();
    const { refreshing } = usePullToRefresh(refresh);
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const toast = useToast();

    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-64 bg-gray-200 rounded-lg" />
                    <div className="h-32 bg-gray-200 rounded-2xl" />
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    if (!data?.patient) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="p-10 text-center space-y-4">
                    <p className="text-red-500 font-bold">Failed to load patient data.</p>
                    {error && <p className="text-sm text-gray-500">{error}</p>}
                    <a href="/patient/login" className="inline-block text-sm font-bold text-emerald-600 hover:underline"
                       onClick={() => { document.cookie = 'patient_session=; Max-Age=0; path=/'; }}>
                        Back to Login
                    </a>
                </div>
            </div>
        );
    }

    const firstName = data.patient.full_name?.split(' ')[0] || data.patient.full_name;
    const nextAppt = data.upcomingAppointments?.[0];
    const vitals = data.latestVitals;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Pull-to-refresh indicator */}
            {refreshing && (
                <div className="flex justify-center py-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                </div>
            )}
            {/* Greeting + Refresh */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-gray-900">{getGreeting()}, {firstName}</h1>
                    <p className="text-gray-500 font-medium mt-1">Patient ID: {data.patient.patient_id}</p>
                </div>
                <button onClick={refresh} disabled={isValidating} className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-50" aria-label="Refresh dashboard">
                    <RefreshCw className={`h-5 w-5 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>

            {/* Next Appointment Hero */}
            {nextAppt ? (
                <Link href="/patient/appointments" className="block bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <div className="absolute -right-8 -bottom-8 h-32 w-32 bg-white/10 rounded-full group-hover:scale-110 transition-transform" />
                    <div className="relative z-10">
                        <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-2">Next Appointment</p>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-black">Dr. {nextAppt.doctor_name || nextAppt.doctor_id}</h3>
                                <p className="text-emerald-100 font-medium mt-1">{nextAppt.department || 'General'}</p>
                            </div>
                            <div className="sm:text-right">
                                <p className="text-lg font-black">{new Date(nextAppt.appointment_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                <p className="text-emerald-200 font-bold text-sm">{daysUntil(nextAppt.appointment_date)}</p>
                            </div>
                        </div>
                    </div>
                </Link>
            ) : (
                <Link href="/patient/appointments/book" className="block bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-emerald-300 hover:bg-emerald-50/30 transition group">
                    <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3 group-hover:text-emerald-400 transition-colors" />
                    <p className="text-lg font-black text-gray-800">No upcoming appointments</p>
                    <p className="text-sm text-gray-500 mt-1">Book a visit with your doctor</p>
                </Link>
            )}

            {/* Pending Actions */}
            {(data.pendingLabCount > 0 || data.unpaidInvoiceCount > 0) && (
                <div className="flex gap-3 flex-wrap">
                    {data.pendingLabCount > 0 && (
                        <Link href="/patient/labs" className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-100 transition">
                            <FlaskConical className="h-4 w-4" />
                            {data.pendingLabCount} pending lab result{data.pendingLabCount > 1 ? 's' : ''}
                        </Link>
                    )}
                    {data.unpaidInvoiceCount > 0 && (
                        <Link href="/patient/payments" className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-100 transition">
                            <CreditCard className="h-4 w-4" />
                            {data.unpaidInvoiceCount} unpaid invoice{data.unpaidInvoiceCount > 1 ? 's' : ''}
                        </Link>
                    )}
                </div>
            )}

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href="/patient/appointments/book" className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Calendar className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">Book Appointment</h3>
                    <p className="text-indigo-100 text-xs font-medium">Schedule a visit</p>
                </Link>
                <Link href="/patient/records" className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <FileText className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">Medical Records</h3>
                    <p className="text-emerald-100 text-xs font-medium">View lab results & reports</p>
                </Link>
                <Link href="/patient/prescriptions" className="bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Pill className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">My Prescriptions</h3>
                    <p className="text-purple-100 text-xs font-medium">Active medications</p>
                </Link>
                <button 
                    onClick={() => setShowDoctorModal(true)}
                    className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-left text-white hover:shadow-lg transition-shadow relative overflow-hidden group"
                >
                    <Video className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">Video Consult</h3>
                    <p className="text-rose-100 text-xs font-medium">Talk to your doctor</p>
                </button>
            </div>

            {/* Video Call Status Banner */}
            <VideoCallStatus />

            <DoctorSelectionModal 
                isOpen={showDoctorModal} 
                onClose={() => setShowDoctorModal(false)}
                loading={requesting}
                onSelect={async (doctor: any) => {
                    setRequesting(true);
                    try {
                        const res = await requestVideoCall({
                            patientId: data.patient.patient_id,
                            doctorId: doctor.id,
                            reason: `Video consultation request for Dr. ${doctor.name}`
                        });
                        if (res.success) {
                            toast.success(`Request sent to Dr. ${doctor.name} successfully!`);
                            setShowDoctorModal(false);
                            refresh();
                        } else {
                            toast.error(res.error || 'Failed to send request');
                        }
                    } catch (e: any) {
                        toast.error('An error occurred. Please try again.');
                    } finally {
                        setRequesting(false);
                    }
                }}
            />

            {/* Health Snapshot */}
            {vitals && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" /> Health Snapshot</h3>
                        <p className="text-xs text-gray-400 font-medium">Last recorded: {new Date(vitals.recorded_at).toLocaleDateString()}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                            <Heart className="h-4 w-4 text-rose-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-rose-900">{vitals.blood_pressure || '--'}</p>
                            <p className="text-[10px] font-bold text-rose-400 uppercase">BP</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                            <Activity className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-orange-900">{vitals.heart_rate || '--'}</p>
                            <p className="text-[10px] font-bold text-orange-400 uppercase">HR (BPM)</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 text-center">
                            <Thermometer className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-amber-900">{vitals.temperature || '--'}</p>
                            <p className="text-[10px] font-bold text-amber-400 uppercase">Temp (°F)</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <Wind className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-blue-900">{vitals.oxygen_saturation || '--'}</p>
                            <p className="text-[10px] font-bold text-blue-400 uppercase">SpO2 (%)</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Two columns: Upcoming + Prescriptions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-500" /> Upcoming Visits</h3>
                        <Link href="/patient/appointments" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center">View All <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="space-y-3">
                        {data.upcomingAppointments?.length > 0 ? data.upcomingAppointments.map((app: any) => (
                            <div key={app.id || app.appointment_id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{new Date(app.appointment_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                    <p className="text-xs text-indigo-600 font-bold mt-0.5">Dr. {app.doctor_name || app.doctor_id} &middot; {app.department || 'General'}</p>
                                </div>
                                <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200">
                                    {new Date(app.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-400 text-sm font-medium">No upcoming appointments.</div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Pill className="h-5 w-5 text-purple-500" /> Recent Prescriptions</h3>
                        <Link href="/patient/prescriptions" className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center">View All <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="space-y-3">
                        {data.activePrescriptions?.length > 0 ? data.activePrescriptions.map((rx: any) => (
                            <div key={rx.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-purple-200 transition-colors">
                                <p className="text-xs font-bold text-gray-500 mb-1">{new Date(rx.created_at).toLocaleDateString()}</p>
                                <p className="text-sm font-bold text-gray-900">
                                    {rx.items?.map((item: any) => item.medicine_name).join(', ') || 'Medication order'}
                                </p>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-400 text-sm font-medium">No recent prescriptions.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
