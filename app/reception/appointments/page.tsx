'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, User, Search,
    Loader2, X, Check, AlertCircle
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    getAppointmentCalendar, getDoctorList, bookAppointment,
    cancelAppointment, createBulkSlots, getRegisteredPatients
} from '@/app/actions/reception-actions';

export default function AppointmentsPage() {
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [doctors, setDoctors] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [slots, setSlots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Book modal
    const [showBookModal, setShowBookModal] = useState(false);
    const [bookForm, setBookForm] = useState({
        patientSearch: '', patientId: '', doctorId: '', doctorName: '',
        department: '', date: '', slotId: '', reasonForVisit: '',
    });
    const [patientResults, setPatientResults] = useState<any[]>([]);
    const [searchingPatients, setSearchingPatients] = useState(false);
    const [booking, setBooking] = useState(false);

    // Bulk slots modal
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkForm, setBulkForm] = useState({
        doctorId: '', startDate: '', endDate: '',
        startTime: '09:00', endTime: '17:00', slotDuration: 15,
    });
    const [creatingSlots, setCreatingSlots] = useState(false);

    // Cancel modal
    const [cancelTarget, setCancelTarget] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        const [docRes, calRes] = await Promise.all([
            getDoctorList(),
            getAppointmentCalendar(selectedDate, selectedDoctor || undefined),
        ]);
        if (docRes.success) setDoctors(docRes.data);
        if (calRes.success) {
            setAppointments(calRes.data.appointments || []);
            setSlots(calRes.data.slots || []);
        }
        setLoading(false);
    }, [selectedDate, selectedDoctor]);

    useEffect(() => { loadData(); }, [loadData]);

    const changeDate = (delta: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + delta);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    // Patient search for booking
    useEffect(() => {
        if (bookForm.patientSearch.length < 2) { setPatientResults([]); return; }
        const timer = setTimeout(async () => {
            setSearchingPatients(true);
            const res = await getRegisteredPatients({ search: bookForm.patientSearch, limit: 5 });
            if (res.success) setPatientResults(res.data || []);
            setSearchingPatients(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [bookForm.patientSearch]);

    const handleBook = async () => {
        if (!bookForm.patientId || !bookForm.doctorId) return;
        setBooking(true);
        await bookAppointment({
            patientId: bookForm.patientId,
            doctorId: bookForm.doctorId,
            doctorName: bookForm.doctorName,
            department: bookForm.department,
            date: bookForm.date || selectedDate,
            slotId: bookForm.slotId || undefined,
            reasonForVisit: bookForm.reasonForVisit,
        });
        setBooking(false);
        setShowBookModal(false);
        setBookForm({ patientSearch: '', patientId: '', doctorId: '', doctorName: '', department: '', date: '', slotId: '', reasonForVisit: '' });
        loadData();
    };

    const handleCancel = async () => {
        if (!cancelTarget) return;
        await cancelAppointment(cancelTarget, cancelReason);
        setCancelTarget(null);
        setCancelReason('');
        loadData();
    };

    const handleBulkCreate = async () => {
        if (!bulkForm.doctorId || !bulkForm.startDate || !bulkForm.endDate) return;
        setCreatingSlots(true);
        await createBulkSlots({
            doctorId: bulkForm.doctorId,
            startDate: bulkForm.startDate,
            endDate: bulkForm.endDate,
            startTime: bulkForm.startTime,
            endTime: bulkForm.endTime,
            slotDuration: bulkForm.slotDuration,
        });
        setCreatingSlots(false);
        setShowBulkModal(false);
        loadData();
    };

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
            'Checked In': 'bg-teal-50 text-teal-700 border-teal-200',
            'In Progress': 'bg-violet-50 text-violet-700 border-violet-200',
            'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Cancelled': 'bg-red-50 text-red-700 border-red-200',
            'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    const headerActions = (
        <div className="flex items-center gap-2">
            <button onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50">
                <Clock className="h-3.5 w-3.5" /> Create Slots
            </button>
            <button onClick={() => { setShowBookModal(true); setBookForm(f => ({ ...f, date: selectedDate })); }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md">
                <Plus className="h-3.5 w-3.5" /> Book Appointment
            </button>
        </div>
    );

    return (
        <AppShell pageTitle="Appointments" pageIcon={<CalendarDays className="h-5 w-5" />}
            headerActions={headerActions} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* Date Navigator + Doctor Filter */}
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                        <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded-lg">
                            <ChevronLeft className="h-4 w-4 text-gray-500" />
                        </button>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                            className="text-sm font-medium text-gray-900 border-none focus:outline-none bg-transparent" />
                        <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded-lg">
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                        </button>
                    </div>
                    <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                        className="px-3 py-2 text-xs font-bold text-teal-600 bg-teal-50 rounded-xl hover:bg-teal-100">
                        Today
                    </button>
                    <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500">
                        <option value="">All Doctors</option>
                        {doctors.map((d: any) => (
                            <option key={d.id} value={d.id}>{d.name} — {d.specialty || 'General'}</option>
                        ))}
                    </select>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total', value: appointments.length, color: 'teal' },
                        { label: 'Scheduled', value: appointments.filter((a: any) => a.status === 'Scheduled').length, color: 'blue' },
                        { label: 'Completed', value: appointments.filter((a: any) => a.status === 'Completed').length, color: 'emerald' },
                        { label: 'Available Slots', value: slots.filter((s: any) => s.is_available && !s.is_booked).length, color: 'violet' },
                    ].map(s => (
                        <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{s.label}</span>
                            <p className="text-2xl font-black text-gray-900 mt-1">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Appointments Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900">
                            Appointments for {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Apt ID', 'Patient', 'Doctor', 'Department', 'Time', 'Reason', 'Status', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-16">
                                        <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                                    </td></tr>
                                ) : appointments.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16">
                                        <CalendarDays className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                        <p className="text-gray-400 text-sm">No appointments for this date</p>
                                    </td></tr>
                                ) : appointments.map((appt: any) => (
                                    <tr key={appt.appointment_id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-mono font-bold text-teal-600">{appt.appointment_id}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{appt.patient?.full_name || 'Unknown'}</p>
                                            <p className="text-[10px] text-gray-400">{appt.patient_id}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{appt.doctor_name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{appt.department || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {new Date(appt.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{appt.reason_for_visit || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusColor(appt.status)}`}>
                                                {appt.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {appt.status !== 'Cancelled' && appt.status !== 'Completed' && (
                                                <button onClick={() => setCancelTarget(appt.appointment_id)}
                                                    className="text-xs text-red-500 hover:text-red-700 font-medium">
                                                    Cancel
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Slots Grid */}
                {slots.length > 0 && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <h3 className="text-sm font-bold text-gray-900 mb-3">Available Slots</h3>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {slots.map((slot: any) => (
                                <div key={slot.id}
                                    className={`text-center px-2 py-2 rounded-xl text-xs font-medium border ${slot.is_booked
                                        ? 'bg-gray-100 text-gray-400 border-gray-200'
                                        : slot.slot_type === 'blocked'
                                            ? 'bg-red-50 text-red-400 border-red-200'
                                            : 'bg-teal-50 text-teal-700 border-teal-200 cursor-pointer hover:bg-teal-100'
                                        }`}>
                                    {slot.start_time} - {slot.end_time}
                                    <span className="block text-[9px] mt-0.5 opacity-60">
                                        {slot.is_booked ? 'Booked' : slot.slot_type === 'blocked' ? 'Blocked' : 'Open'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Book Appointment Modal */}
            {showBookModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBookModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">Book Appointment</h2>
                            <button onClick={() => setShowBookModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Patient Search */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Patient</label>
                                {bookForm.patientId ? (
                                    <div className="flex items-center justify-between bg-teal-50 rounded-xl px-3 py-2">
                                        <span className="text-sm font-medium text-teal-700">{bookForm.patientSearch}</span>
                                        <button onClick={() => setBookForm(f => ({ ...f, patientId: '', patientSearch: '' }))} className="text-teal-500 hover:text-teal-700">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input type="text" value={bookForm.patientSearch}
                                            onChange={e => setBookForm(f => ({ ...f, patientSearch: e.target.value }))}
                                            placeholder="Search patient by name or ID..."
                                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                        {patientResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                                                {patientResults.map((p: any) => (
                                                    <button key={p.patient_id}
                                                        onClick={() => setBookForm(f => ({ ...f, patientId: p.patient_id, patientSearch: `${p.full_name} (${p.patient_id})` }))}
                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between">
                                                        <span className="font-medium text-gray-900">{p.full_name}</span>
                                                        <span className="text-xs text-gray-400 font-mono">{p.patient_id}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Doctor */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Doctor</label>
                                <select value={bookForm.doctorId}
                                    onChange={e => {
                                        const doc = doctors.find((d: any) => d.id === e.target.value);
                                        setBookForm(f => ({ ...f, doctorId: e.target.value, doctorName: doc?.name || '', department: doc?.specialty || '' }));
                                    }}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500">
                                    <option value="">Select Doctor</option>
                                    {doctors.map((d: any) => (
                                        <option key={d.id} value={d.id}>{d.name} — {d.specialty || 'General'}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Date */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Date</label>
                                <input type="date" value={bookForm.date || selectedDate}
                                    onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                            </div>
                            {/* Reason */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Reason for Visit</label>
                                <input type="text" value={bookForm.reasonForVisit}
                                    onChange={e => setBookForm(f => ({ ...f, reasonForVisit: e.target.value }))}
                                    placeholder="e.g., Follow-up consultation"
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                            </div>
                            <button onClick={handleBook} disabled={booking || !bookForm.patientId || !bookForm.doctorId}
                                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                                {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Book Appointment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Modal */}
            {cancelTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-50 rounded-xl"><AlertCircle className="h-5 w-5 text-red-500" /></div>
                                <h2 className="text-base font-bold text-gray-900">Cancel Appointment</h2>
                            </div>
                            <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                placeholder="Reason for cancellation..."
                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-red-500" />
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCancelTarget(null)}
                                    className="flex-1 py-2 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl">
                                    Keep
                                </button>
                                <button onClick={handleCancel}
                                    className="flex-1 py-2 bg-red-500 text-white text-sm font-bold rounded-xl">
                                    Cancel It
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Slots Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">Create Appointment Slots</h2>
                            <button onClick={() => setShowBulkModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Doctor</label>
                                <select value={bulkForm.doctorId} onChange={e => setBulkForm(f => ({ ...f, doctorId: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500">
                                    <option value="">Select Doctor</option>
                                    {doctors.map((d: any) => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Start Date</label>
                                    <input type="date" value={bulkForm.startDate} onChange={e => setBulkForm(f => ({ ...f, startDate: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">End Date</label>
                                    <input type="date" value={bulkForm.endDate} onChange={e => setBulkForm(f => ({ ...f, endDate: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Start Time</label>
                                    <input type="time" value={bulkForm.startTime} onChange={e => setBulkForm(f => ({ ...f, startTime: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">End Time</label>
                                    <input type="time" value={bulkForm.endTime} onChange={e => setBulkForm(f => ({ ...f, endTime: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Duration (min)</label>
                                    <select value={bulkForm.slotDuration} onChange={e => setBulkForm(f => ({ ...f, slotDuration: Number(e.target.value) }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500">
                                        <option value={10}>10 min</option>
                                        <option value={15}>15 min</option>
                                        <option value={20}>20 min</option>
                                        <option value={30}>30 min</option>
                                    </select>
                                </div>
                            </div>
                            <button onClick={handleBulkCreate} disabled={creatingSlots || !bulkForm.doctorId || !bulkForm.startDate || !bulkForm.endDate}
                                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                                {creatingSlots ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Create Slots
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
