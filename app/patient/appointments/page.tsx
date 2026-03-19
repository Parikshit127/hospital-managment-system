'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Calendar,
    Clock,
    Stethoscope,
    Loader2,
    Plus,
    CalendarX2,
    CalendarCheck2,
    Ban,
    Hash,
    RotateCcw,
} from 'lucide-react';
import { cancelMyAppointment, rescheduleMyAppointment, getAvailableSlots } from './actions';
import { useAppointments, invalidateAppointments } from '@/app/lib/hooks/usePatientData';
import { AccessibleModal } from '@/app/components/ui/AccessibleModal';

type TabKey = 'upcoming' | 'past' | 'cancelled';

interface Appointment {
    id: string;
    appointment_id: string;
    doctor_id?: string;
    doctor_name: string;
    department: string;
    appointment_date: string;
    status: string;
    reason_for_visit?: string;
    queue_token?: string;
}

export default function MyAppointmentsPage() {
    const { appointments, isLoading: loading } = useAppointments();
    const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

    // Cancel modal state
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState('');

    // Reschedule modal state
    const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
    const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleSlots, setRescheduleSlots] = useState<{ id: string; start_time: string; end_time: string; is_available: boolean }[]>([]);
    const [rescheduleSlotId, setRescheduleSlotId] = useState('');
    const [rescheduling, setRescheduling] = useState(false);
    const [rescheduleError, setRescheduleError] = useState('');
    const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);

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
                invalidateAppointments();
            } else {
                setCancelError(res.error || 'Failed to cancel appointment');
            }
        } catch {
            setCancelError('Something went wrong');
        } finally {
            setCancelling(false);
        }
    }

    function openRescheduleModal(appt: Appointment) {
        setRescheduleTarget(appt);
        setRescheduleDate('');
        setRescheduleSlotId('');
        setRescheduleSlots([]);
        setRescheduleError('');
        setRescheduleModalOpen(true);
    }

    function closeRescheduleModal() {
        setRescheduleModalOpen(false);
        setRescheduleTarget(null);
    }

    async function handleDateChangeForReschedule(date: string) {
        setRescheduleDate(date);
        setRescheduleSlotId('');
        if (!rescheduleTarget || !date) return;
        setLoadingRescheduleSlots(true);
        const doctorId = rescheduleTarget.doctor_id;
        if (doctorId) {
            const res = await getAvailableSlots(doctorId, date);
            if (res.success) {
                setRescheduleSlots((res.data || []).filter((s: any) => s.is_available));
            }
        }
        setLoadingRescheduleSlots(false);
    }

    async function handleReschedule() {
        if (!rescheduleTarget || !rescheduleDate) return;
        setRescheduling(true);
        setRescheduleError('');
        try {
            const res = await rescheduleMyAppointment(
                rescheduleTarget.appointment_id,
                rescheduleDate,
                rescheduleSlotId || undefined,
            );
            if (res.success) {
                closeRescheduleModal();
                invalidateAppointments();
            } else {
                setRescheduleError(res.error || 'Failed to reschedule');
            }
        } catch {
            setRescheduleError('Something went wrong');
        } finally {
            setRescheduling(false);
        }
    }

    const now = new Date();

    const typedAppointments = appointments as Appointment[];
    const upcoming = typedAppointments.filter(
        (a) => a.status !== 'Cancelled' && new Date(a.appointment_date) >= now
    );
    const past = typedAppointments.filter(
        (a) => a.status !== 'Cancelled' && new Date(a.appointment_date) < now
    );
    const cancelled = typedAppointments.filter((a) => a.status === 'Cancelled');

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
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => openRescheduleModal(appt)}
                                                className="text-xs font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                                            >
                                                <RotateCcw className="h-3 w-3" /> Reschedule
                                            </button>
                                            <button
                                                onClick={() => openCancelModal(appt)}
                                                className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Cancel Modal */}
            <AccessibleModal open={cancelModalOpen && !!cancelTarget} onClose={closeCancelModal} title="Cancel Appointment">
                {cancelTarget && (
                    <>
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
                            <label htmlFor="cancel-reason" className="text-sm font-bold text-gray-700 block mb-1.5">
                                Reason for cancellation
                            </label>
                            <textarea
                                id="cancel-reason"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm"
                                rows={3}
                                placeholder="Please provide a reason (optional)..."
                            />
                        </div>

                        {cancelError && (
                            <p className="text-sm text-red-600 font-medium mb-4" role="alert">{cancelError}</p>
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
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : null}
                                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                            </button>
                        </div>
                    </>
                )}
            </AccessibleModal>

            {/* Reschedule Modal */}
            <AccessibleModal open={rescheduleModalOpen && !!rescheduleTarget} onClose={closeRescheduleModal} title="Reschedule Appointment">
                {rescheduleTarget && (
                    <>
                        <div className="mb-5">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <RotateCcw className="h-5 w-5 text-blue-500" aria-hidden="true" />
                                Reschedule Appointment
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Pick a new date for your appointment with{' '}
                                <span className="font-bold">Dr. {rescheduleTarget.doctor_name}</span>
                            </p>
                        </div>

                        <div className="mb-4">
                            <label htmlFor="reschedule-date" className="text-sm font-bold text-gray-700 block mb-1.5">New Date</label>
                            <input
                                id="reschedule-date"
                                type="date"
                                value={rescheduleDate}
                                onChange={(e) => handleDateChangeForReschedule(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 transition-all outline-none text-sm"
                            />
                        </div>

                        {/* Slot Selection */}
                        {rescheduleDate && (
                            <div className="mb-5" role="group" aria-label="Available time slots">
                                <label className="text-sm font-bold text-gray-700 block mb-1.5">Available Time Slots</label>
                                {loadingRescheduleSlots ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-400 py-3" aria-live="polite">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading slots...
                                    </div>
                                ) : rescheduleSlots.length === 0 ? (
                                    <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
                                        No slots available for this date. You can still reschedule without a specific time slot.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto">
                                        {rescheduleSlots.map((slot) => (
                                            <button
                                                key={slot.id}
                                                onClick={() => setRescheduleSlotId(slot.id)}
                                                aria-pressed={rescheduleSlotId === slot.id}
                                                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                                                    rescheduleSlotId === slot.id
                                                        ? 'bg-blue-500 text-white border-transparent shadow-md'
                                                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-400'
                                                }`}
                                            >
                                                {slot.start_time}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {rescheduleError && (
                            <p className="text-sm text-red-600 font-medium mb-4" role="alert">{rescheduleError}</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={closeRescheduleModal}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReschedule}
                                disabled={rescheduling || !rescheduleDate}
                                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {rescheduling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                                {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
                            </button>
                        </div>
                    </>
                )}
            </AccessibleModal>
        </div>
    );
}
