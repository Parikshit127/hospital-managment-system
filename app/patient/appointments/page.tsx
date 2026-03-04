'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Calendar,
    Clock,
    Stethoscope,
    Loader2,
    Plus,
    X,
    CalendarX2,
    CalendarCheck2,
    Ban,
    Hash,
} from 'lucide-react';
import { getMyAppointments, cancelMyAppointment } from './actions';

type TabKey = 'upcoming' | 'past' | 'cancelled';

interface Appointment {
    id: string;
    appointment_id: string;
    doctor_name: string;
    department: string;
    appointment_date: string;
    status: string;
    reason_for_visit?: string;
    queue_token?: string;
}

export default function MyAppointmentsPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

    // Cancel modal state
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState('');

    useEffect(() => {
        loadAppointments();
    }, []);

    async function loadAppointments() {
        setLoading(true);
        try {
            const res = await getMyAppointments();
            if (res.success) setAppointments(res.data || []);
        } finally {
            setLoading(false);
        }
    }

    function openCancelModal(appt: Appointment) {
        setCancelTarget(appt);
        setCancelReason('');
        setCancelError('');
        setCancelModalOpen(true);
    }

    function closeCancelModal() {
        setCancelModalOpen(false);
        setCancelTarget(null);
        setCancelReason('');
        setCancelError('');
    }

    async function handleCancel() {
        if (!cancelTarget) return;
        setCancelling(true);
        setCancelError('');
        try {
            const res = await cancelMyAppointment(cancelTarget.appointment_id, cancelReason);
            if (res.success) {
                closeCancelModal();
                await loadAppointments();
            } else {
                setCancelError(res.error || 'Failed to cancel appointment');
            }
        } catch {
            setCancelError('Something went wrong');
        } finally {
            setCancelling(false);
        }
    }

    const now = new Date();

    const upcoming = appointments.filter(
        (a) => a.status !== 'Cancelled' && new Date(a.appointment_date) >= now
    );
    const past = appointments.filter(
        (a) => a.status !== 'Cancelled' && new Date(a.appointment_date) < now
    );
    const cancelled = appointments.filter((a) => a.status === 'Cancelled');

    const tabData: Record<TabKey, { label: string; items: Appointment[]; icon: React.ReactNode }> = {
        upcoming: { label: 'Upcoming', items: upcoming, icon: <CalendarCheck2 className="h-4 w-4" /> },
        past: { label: 'Past', items: past, icon: <Clock className="h-4 w-4" /> },
        cancelled: { label: 'Cancelled', items: cancelled, icon: <Ban className="h-4 w-4" /> },
    };

    const currentItems = tabData[activeTab].items;

    function statusBadge(status: string) {
        const styles: Record<string, string> = {
            Scheduled: 'bg-amber-100 text-amber-700',
            'In Progress': 'bg-blue-100 text-blue-700',
            Completed: 'bg-green-100 text-green-700',
            Cancelled: 'bg-red-100 text-red-700',
            'No Show': 'bg-gray-100 text-gray-600',
        };
        return styles[status] || 'bg-gray-100 text-gray-600';
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="h-6 w-6 text-emerald-500" />
                        My Appointments
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">View and manage your appointments</p>
                </div>
                <Link
                    href="/patient/appointments/book"
                    className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-3 rounded-xl transition shadow-lg shadow-emerald-500/20"
                >
                    <Plus className="h-4 w-4" />
                    Book New Appointment
                </Link>
            </div>

            {/* Tab Filters */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {(Object.keys(tabData) as TabKey[]).map((key) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition ${
                            activeTab === key
                                ? 'bg-white text-emerald-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tabData[key].icon}
                        {tabData[key].label}
                        <span
                            className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                                activeTab === key
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-gray-200 text-gray-500'
                            }`}
                        >
                            {tabData[key].items.length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    Loading appointments...
                </div>
            ) : currentItems.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
                    {activeTab === 'upcoming' && (
                        <>
                            <CalendarX2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-lg font-bold text-gray-700">No upcoming appointments</p>
                            <p className="text-sm text-gray-400 mt-1 mb-6">
                                Schedule a visit with your doctor to get started
                            </p>
                            <Link
                                href="/patient/appointments/book"
                                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl transition"
                            >
                                <Plus className="h-4 w-4" />
                                Book Appointment
                            </Link>
                        </>
                    )}
                    {activeTab === 'past' && (
                        <>
                            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-lg font-bold text-gray-700">No past appointments</p>
                            <p className="text-sm text-gray-400 mt-1">
                                Your completed appointments will appear here
                            </p>
                        </>
                    )}
                    {activeTab === 'cancelled' && (
                        <>
                            <Ban className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-lg font-bold text-gray-700">No cancelled appointments</p>
                            <p className="text-sm text-gray-400 mt-1">
                                You have not cancelled any appointments
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {currentItems.map((appt) => (
                        <div
                            key={appt.appointment_id}
                            className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    {/* Doctor Avatar */}
                                    <div className="h-12 w-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                        <Stethoscope className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900">
                                            Dr. {appt.doctor_name || 'Unassigned'}
                                        </p>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {appt.department || 'General'}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(appt.appointment_date).toLocaleDateString(
                                                    undefined,
                                                    {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                    }
                                                )}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(appt.appointment_date).toLocaleTimeString(
                                                    [],
                                                    { hour: '2-digit', minute: '2-digit' }
                                                )}
                                            </span>
                                        </div>
                                        {appt.reason_for_visit && (
                                            <p className="text-xs text-gray-400 mt-1.5 italic">
                                                {appt.reason_for_visit}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {appt.queue_token && (
                                        <span className="flex items-center gap-1 text-lg font-black text-emerald-600">
                                            <Hash className="h-4 w-4" />
                                            {appt.queue_token}
                                        </span>
                                    )}
                                    <span
                                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${statusBadge(
                                            appt.status
                                        )}`}
                                    >
                                        {appt.status}
                                    </span>
                                    {appt.status === 'Scheduled' && activeTab === 'upcoming' && (
                                        <button
                                            onClick={() => openCancelModal(appt)}
                                            className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Cancel Modal */}
            {cancelModalOpen && cancelTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                        <button
                            onClick={closeCancelModal}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Cancel Appointment</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Are you sure you want to cancel your appointment with{' '}
                                <span className="font-bold">Dr. {cancelTarget.doctor_name}</span> on{' '}
                                {new Date(cancelTarget.appointment_date).toLocaleDateString(undefined, {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                                ?
                            </p>
                        </div>

                        <div className="mb-5">
                            <label className="text-sm font-bold text-gray-700 block mb-1.5">
                                Reason for cancellation
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm"
                                rows={3}
                                placeholder="Please provide a reason (optional)..."
                            />
                        </div>

                        {cancelError && (
                            <p className="text-sm text-red-600 font-medium mb-4">{cancelError}</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={closeCancelModal}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition"
                            >
                                Keep Appointment
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={cancelling}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {cancelling ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
