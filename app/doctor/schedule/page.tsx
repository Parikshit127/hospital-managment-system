'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Users, Search, Filter, Plus, ChevronRight, ChevronLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Sidebar } from '@/app/components/layout/Sidebar';
import { getPatientQueue, getOrCreateDailySlots, updateDoctorAvailability, toggleSlotAvailability } from '@/app/actions/doctor-actions';

interface QueueItem {
    full_name?: string;
    patient_id?: string;
    age?: string | number;
    gender?: string;
    phone?: string;
    status: string;
    appointment_id: string;
    internal_id?: number;
    digital_id?: string;
    doctor_id?: string;
    doctor_name?: string;
    reason_for_visit?: string;
    appointment_date: string;
    department?: string;
}

export default function DoctorSchedule() {
    const [session, setSession] = useState<{ id: string; username: string; role: string; name?: string; specialty?: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [appointments, setAppointments] = useState<QueueItem[]>([]);
    const [slots, setSlots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'queue' | 'slots'>('queue');
    const [slotDate, setSlotDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockDate, setBlockDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [blockStart, setBlockStart] = useState('12:00');
    const [blockEnd, setBlockEnd] = useState('13:00');
    const [blocking, setBlocking] = useState(false);

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setSession(data);
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    const fetchScheduleData = useCallback(async () => {
        if (!session?.id) return;
        setLoading(true);
        try {
            // Fetch queue + auto-generated slots for the selected date
            const [queueResult, slotsResult] = await Promise.all([
                getPatientQueue({ doctor_id: session.id, view: 'my' }),
                getOrCreateDailySlots(session.id, slotDate),
            ]);

            if (queueResult.success && queueResult.data) {
                setAppointments(queueResult.data as QueueItem[]);
            } else {
                setAppointments([]);
            }
            if (slotsResult.success) {
                setSlots(slotsResult.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch schedule data', error);
            setAppointments([]);
            setSlots([]);
        } finally {
            setLoading(false);
        }
    }, [session?.id, slotDate]);

    useEffect(() => {
        if (session?.id) {
            fetchScheduleData();
        }
    }, [session?.id, slotDate, fetchScheduleData]);

    // Compute stats from real data
    const totalAppointments = appointments.length;
    const completedCount = appointments.filter(a => a.status === 'Completed' || a.status === 'Discharged').length;
    const pendingCount = appointments.filter(a => a.status !== 'Completed' && a.status !== 'Discharged').length;
    const uniquePatients = new Set(appointments.map(a => a.patient_id || a.digital_id)).size;

    const changeSlotDate = (offset: number) => {
        const d = new Date(slotDate);
        d.setDate(d.getDate() + offset);
        setSlotDate(d.toISOString().split('T')[0]);
    };

    const handleBlockTime = async () => {
        if (!session?.id) return;
        setBlocking(true);
        await updateDoctorAvailability({
            doctorId: session.id,
            date: blockDate,
            startTime: blockStart,
            endTime: blockEnd,
            slotDuration: 20,
            isAvailable: false,
        });
        setBlocking(false);
        setShowBlockModal(false);
        await fetchScheduleData();
    };

    const handleToggleSlot = async (slotId: string, currentStatus: boolean) => {
        setLoading(true);
        await toggleSlotAvailability(slotId, !currentStatus);
        await fetchScheduleData();
    };

    // Format time from appointment_date
    function formatTime(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch {
            return '--:--';
        }
    }

    // Determine type color based on reason/status
    function getTypeInfo(item: QueueItem): { label: string; color: string } {
        const reason = (item.reason_for_visit || '').toLowerCase();
        if (reason.includes('follow')) {
            return { label: 'Follow-up', color: 'text-teal-500 bg-teal-500/10 border-teal-500/20' };
        }
        if (reason.includes('test') || reason.includes('lab') || reason.includes('review')) {
            return { label: 'Test Review', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
        }
        if (reason.includes('emergency') || reason.includes('urgent')) {
            return { label: 'Emergency', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
        }
        return { label: item.reason_for_visit || 'Consultation', color: 'text-violet-500 bg-violet-500/10 border-violet-500/20' };
    }

    // Status badge color
    function getStatusColor(status: string): string {
        switch (status) {
            case 'Checked In': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'In Progress': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'Completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'Admitted': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
            default: return 'bg-gray-100 text-gray-500 border-gray-200';
        }
    }

    const filteredAppointments = appointments.filter(a => {
        const name = (a.full_name || '').toLowerCase();
        return name.includes(searchTerm.toLowerCase());
    });

    const inputCls = "w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all shadow-sm";

    return (
        <div className="flex h-[calc(100vh-52px)] bg-gray-50 font-sans text-gray-900 overflow-hidden relative lg:pl-60">
            <Sidebar session={session} />

            <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto w-full">
                <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 border border-gray-200 bg-white rounded-xl shadow-sm">
                                    <Calendar className="h-6 w-6 text-teal-500" />
                                </div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Today&apos;s Schedule</h1>
                            </div>
                            <p className="text-sm text-gray-500 font-medium">Manage your appointments and daily itinerary.</p>
                        </div>
                        <div className="flex gap-3">
                            <button className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-teal-500/30 transition-all flex items-center gap-2 shadow-sm text-sm truncate">
                                <Filter className="h-4 w-4" /> Filter
                            </button>
                            <button onClick={() => setShowBlockModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all flex items-center gap-2 shadow-lg shadow-teal-500/20 text-sm whitespace-nowrap">
                                <Plus className="h-4 w-4" /> Block Time
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: "Total Appointments", value: totalAppointments, icon: Calendar, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
                            { label: "Completed", value: completedCount, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                            { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
                            { label: "Unique Patients", value: uniquePatients, icon: Users, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" }
                        ].map((stat, i) => (
                            <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-teal-500/20 transition-all">
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`p-2 rounded-xl ${stat.bg} ${stat.border} border`}>
                                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{loading ? '...' : stat.value}</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab('queue')}
                            className={`py-3 px-6 font-bold text-sm ${activeTab === 'queue' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            Patient Queue
                        </button>
                        <button
                            onClick={() => setActiveTab('slots')}
                            className={`py-3 px-6 font-bold text-sm ${activeTab === 'slots' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>
                            Manage Slots
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        {activeTab === 'queue' ? (
                            <>
                                <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-4 items-center bg-gray-50/50">
                                    <h2 className="font-black text-gray-800 flex items-center gap-2"><Clock className="h-5 w-5 text-teal-400" /> Upcoming Appointments</h2>
                                    <div className="relative w-full sm:w-72 group">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-teal-400 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Search by patient name..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className={inputCls}
                                        />
                                    </div>
                                </div>

                                {loading ? (
                                    <div className="flex items-center justify-center py-16 text-gray-400">
                                        <Loader2 className="h-6 w-6 animate-spin mr-3" />
                                        <span className="font-medium text-sm">Loading schedule...</span>
                                    </div>
                                ) : filteredAppointments.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                        <Calendar className="h-10 w-10 mb-3 text-gray-300" />
                                        <span className="font-bold text-sm">
                                            {searchTerm ? 'No matching appointments found.' : 'No appointments scheduled for today.'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {filteredAppointments.map((appointment) => {
                                            const typeInfo = getTypeInfo(appointment);
                                            return (
                                                <div key={appointment.appointment_id} className="p-5 hover:bg-teal-50/50 transition-all group flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                                    {/* Time Block */}
                                                    <div className="flex-shrink-0 w-28">
                                                        <div className="font-black text-gray-900 text-lg">{formatTime(appointment.appointment_date)}</div>
                                                        <div className="text-xs font-bold text-teal-500/70">Scheduled</div>
                                                    </div>

                                                    {/* Divider for desktop */}
                                                    <div className="hidden sm:block h-10 w-px bg-gray-200 mx-2"></div>

                                                    {/* Patient Info */}
                                                    <div className="flex-1">
                                                        <div className="font-bold text-gray-900 text-base group-hover:text-teal-600 transition-colors flex items-center gap-2">
                                                            {appointment.full_name || 'Unknown Patient'}
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${getStatusColor(appointment.status)}`}>
                                                                {appointment.status}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${typeInfo.color}`}>
                                                                {typeInfo.label}
                                                            </span>
                                                            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                                                                <Users className="h-3 w-3" /> {appointment.department || 'General Dept'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Action */}
                                                    <div className="mt-4 sm:mt-0">
                                                        <button className="p-2 text-gray-400 hover:text-teal-500 hover:bg-teal-500/10 rounded-xl transition-all border border-transparent hover:border-teal-500/20">
                                                            <ChevronRight className="h-5 w-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="p-5 flex flex-col gap-4 bg-gray-50/50 min-h-[400px]">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                                    <h2 className="font-black text-gray-800 flex items-center gap-2"><Clock className="h-5 w-5 text-teal-400" /> Appointment Slots</h2>
                                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                                        <button onClick={() => changeSlotDate(-1)} className="p-1 hover:bg-gray-100 rounded-lg">
                                            <ChevronLeft className="h-4 w-4 text-gray-500" />
                                        </button>
                                        <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)}
                                            className="text-sm font-bold text-gray-900 border-none focus:outline-none bg-transparent" />
                                        <button onClick={() => changeSlotDate(1)} className="p-1 hover:bg-gray-100 rounded-lg">
                                            <ChevronRight className="h-4 w-4 text-gray-500" />
                                        </button>
                                        <button onClick={() => setSlotDate(new Date().toISOString().split('T')[0])}
                                            className="ml-1 px-2 py-1 text-[10px] font-bold text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100">
                                            Today
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 font-medium -mt-2 mb-2">Slots are auto-generated (20 min, 09:00–17:00). Click a slot to block/unblock it.</p>
                                {loading ? (
                                    <div className="flex items-center justify-center py-16 text-gray-400">
                                        <Loader2 className="h-6 w-6 animate-spin mr-3" />
                                        <span className="font-medium text-sm">Loading slots...</span>
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <p className="font-bold">No slots for this date.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {slots.map(slot => (
                                            <div key={slot.id} className={`p-3 rounded-xl border ${slot.is_booked ? 'bg-red-50 border-red-200 opacity-50' : slot.is_available ? 'bg-green-50 border-green-200' : 'bg-gray-100 border-gray-300'} flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:shadow-md`} onClick={() => !slot.is_booked && handleToggleSlot(slot.id, slot.is_available)}>
                                                <div className="text-sm font-black text-gray-800">{slot.start_time} – {slot.end_time}</div>
                                                <div className="text-[10px] uppercase font-bold mt-1 text-gray-500">
                                                    {slot.is_booked ? 'Booked' : slot.is_available ? 'Available' : 'Blocked'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Block Time Modal */}
            {showBlockModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBlockModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-base font-bold text-gray-900">Block Time Slot</h2>
                            <button onClick={() => setShowBlockModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Plus className="h-4 w-4 rotate-45" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Date</label>
                                <input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">From</label>
                                    <input type="time" value={blockStart} onChange={e => setBlockStart(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">To</label>
                                    <input type="time" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                            </div>
                            <button onClick={handleBlockTime} disabled={blocking} className="w-full py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                                {blocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 rotate-45" />}
                                Block This Time
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
