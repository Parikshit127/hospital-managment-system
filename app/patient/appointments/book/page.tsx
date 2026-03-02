'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { CalendarPlus, UserCheck, Stethoscope, FileText, CheckCircle2 } from 'lucide-react';
import { bookPatientAppointment, getBookableDoctors } from '@/app/actions/patient-actions';
import { useRouter } from 'next/navigation';

export default function BookAppointmentPage() {
    const router = useRouter();
    const [doctors, setDoctors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const [doc, setDoc] = useState('');
    const [dept, setDept] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const load = async () => {
            const res = await getBookableDoctors();
            if (res.success) setDoctors(res.data);
        };
        load();
    }, []);

    const handleBook = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Combine date/time
        const dateTimeStr = `${date}T${time}:00`;
        const res = await bookPatientAppointment({
            doctor_id: doc,
            department: dept,
            appointment_date: dateTimeStr,
            notes
        });
        setLoading(false);
        if (res.success) {
            alert('Appointment Scheduled successfully!');
            router.push('/patient/dashboard');
        } else alert('Failed to schedule appointment: ' + res.error);
    };

    return (
        <AppShell
            pageTitle="Book Appointment"
            pageIcon={<CalendarPlus className="h-5 w-5" />}
        >
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
                <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 absolute top-0 left-0"></div>
                <div className="p-8">
                    <div className="mb-8 text-center">
                        <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
                            <Stethoscope className="h-8 w-8 text-indigo-600" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900">Schedule Your Visit</h2>
                        <p className="text-gray-500 font-medium">Please provide details for your doctor's appointment.</p>
                    </div>

                    <form onSubmit={handleBook} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Medical Department *</label>
                                <select required value={dept} onChange={e => setDept(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors">
                                    <option value="">-- Select Specialty --</option>
                                    <option value="Cardiology">Cardiology</option>
                                    <option value="Orthopedics">Orthopedics</option>
                                    <option value="Pediatrics">Pediatrics</option>
                                    <option value="General Medicine">General Medicine</option>
                                    <option value="Dermatology">Dermatology</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Physician</label>
                                <select required value={doc} onChange={e => setDoc(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors">
                                    <option value="">-- Choose Doctor --</option>
                                    {doctors.map(d => (
                                        <option key={d} value={d}>Dr. {d}</option>
                                    ))}
                                    {doctors.length === 0 && <option value="SMITH">Dr. Smith (Demo)</option>}
                                    {doctors.length === 0 && <option value="JOHNSON">Dr. Johnson (Demo)</option>}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Requested Date *</label>
                                <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                            </div>

                            <div>
                                <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Requested Time *</label>
                                <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Reason for Visit / Symptoms *</label>
                            <textarea required value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors min-h-[120px]" placeholder="Briefly describe your symptoms or reason for follow-up..." />
                        </div>

                        <button disabled={loading} type="submit" className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold shadow-xl shadow-gray-200/50 flex items-center justify-center gap-2 transition-all disabled:opacity-70 group">
                            {loading ? 'Processing...' : (
                                <>
                                    <CheckCircle2 className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                    Confirm Appointment Request
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </AppShell>
    );
}
