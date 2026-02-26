'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Stethoscope, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Doctor {
    id: string;
    name: string;
    specialty: string;
}

interface Slot {
    id: string;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

export default function AppointmentsPage() {
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [slots, setSlots] = useState<Slot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loadingAppts, setLoadingAppts] = useState(true);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (selectedDoctor && selectedDate) {
            loadSlots();
        }
    }, [selectedDoctor, selectedDate]);

    async function loadInitialData() {
        try {
            const { getAvailableDoctors, getMyAppointments } = await import('./actions');
            const [docsRes, apptsRes] = await Promise.all([
                getAvailableDoctors(),
                getMyAppointments(),
            ]);
            if (docsRes.success) setDoctors(docsRes.data || []);
            if (apptsRes.success) setAppointments(apptsRes.data || []);
        } finally {
            setLoadingAppts(false);
        }
    }

    async function loadSlots() {
        setLoadingSlots(true);
        setSelectedSlot('');
        try {
            const { getAvailableSlots } = await import('./actions');
            const res = await getAvailableSlots(selectedDoctor, selectedDate);
            if (res.success) setSlots(res.data || []);
        } finally {
            setLoadingSlots(false);
        }
    }

    async function handleBooking() {
        if (!selectedDoctor || !selectedDate || !selectedSlot) return;
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const { bookAppointment } = await import('./actions');
            const res = await bookAppointment(selectedSlot, selectedDoctor, selectedDate, reason);
            if (res.success) {
                setSuccess('Appointment booked successfully!');
                setSelectedSlot('');
                setReason('');
                // Refresh
                const { getMyAppointments } = await import('./actions');
                const apptsRes = await getMyAppointments();
                if (apptsRes.success) setAppointments(apptsRes.data || []);
                loadSlots();
            } else {
                setError(res.error || 'Booking failed.');
            }
        } finally {
            setLoading(false);
        }
    }

    const today = new Date().toISOString().split('T')[0];

    const inputCls = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 transition-all outline-none text-sm';

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Book an Appointment</h2>
                <p className="text-sm text-gray-500 mt-1">Select a doctor, date, and available time slot.</p>
            </div>

            {success && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-700 text-sm">
                    <CheckCircle2 className="h-5 w-5" /> {success}
                </div>
            )}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 text-sm">
                    <AlertCircle className="h-5 w-5" /> {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Booking Form */}
                <div className="lg:col-span-1 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-5">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                            <Stethoscope className="h-4 w-4 inline mr-1.5 text-emerald-500" />
                            Select Doctor
                        </label>
                        <select
                            value={selectedDoctor}
                            onChange={(e) => setSelectedDoctor(e.target.value)}
                            className={inputCls}
                        >
                            <option value="">Choose a doctor…</option>
                            {doctors.map((d) => (
                                <option key={d.id} value={d.id}>
                                    Dr. {d.name} — {d.specialty}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                            <Calendar className="h-4 w-4 inline mr-1.5 text-emerald-500" />
                            Select Date
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            min={today}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className={inputCls}
                        />
                    </div>

                    {loadingSlots ? (
                        <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading slots…
                        </div>
                    ) : slots.length > 0 ? (
                        <div>
                            <label className="text-sm font-semibold text-gray-700 block mb-2">
                                <Clock className="h-4 w-4 inline mr-1.5 text-emerald-500" />
                                Available Slots
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {slots.map((slot) => (
                                    <button
                                        key={slot.id}
                                        onClick={() => setSelectedSlot(slot.id)}
                                        disabled={!slot.is_available}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                                            selectedSlot === slot.id
                                                ? 'bg-emerald-500 text-white border-emerald-500'
                                                : slot.is_available
                                                ? 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'
                                                : 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed'
                                        }`}
                                    >
                                        {slot.start_time}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : selectedDoctor && selectedDate ? (
                        <p className="text-sm text-gray-400 italic py-4">No slots available for this date.</p>
                    ) : null}

                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">Reason (optional)</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className={inputCls}
                            rows={3}
                            placeholder="Brief description of your concern…"
                        />
                    </div>

                    <button
                        onClick={handleBooking}
                        disabled={!selectedSlot || loading}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                        {loading ? 'Booking…' : 'Confirm Booking'}
                    </button>
                </div>

                {/* My Appointments */}
                <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-indigo-500" /> My Appointments
                    </h3>
                    {loadingAppts ? (
                        <div className="text-center py-10 text-gray-400">Loading…</div>
                    ) : appointments.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No appointments booked yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {appointments.map((appt: any) => (
                                <div key={appt.appointment_id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 hover:bg-gray-50/50 transition">
                                    <div>
                                        <p className="font-semibold text-gray-900 text-sm">Dr. {appt.doctor_name || 'Unassigned'}</p>
                                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                            <Clock className="h-3 w-3" />
                                            {new Date(appt.appointment_date).toLocaleDateString()}
                                            <span>&middot;</span>
                                            {appt.department || 'General'}
                                        </p>
                                        {appt.reason_for_visit && (
                                            <p className="text-xs text-gray-400 mt-1">{appt.reason_for_visit}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {appt.queue_token && (
                                            <span className="text-lg font-black text-emerald-500">#{appt.queue_token}</span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                                            appt.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                            appt.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                            appt.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>{appt.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
