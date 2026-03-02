'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    ListOrdered, Loader2, User, Clock, Shuffle, X,
    CheckCircle2, AlertCircle, Users, Search
} from 'lucide-react';
import {
    getAllDoctorQueues,
    reassignPatient,
    getDoctorUtilization,
} from '@/app/actions/opd-manager-actions';

export default function OPDManagerQueuesPage() {
    const [queues, setQueues] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Reassign modal state
    const [reassignModal, setReassignModal] = useState<{
        open: boolean;
        appointmentId: string;
        patientName: string;
        currentDoctorId: string;
    }>({ open: false, appointmentId: '', patientName: '', currentDoctorId: '' });
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [reassigning, setReassigning] = useState(false);
    const [doctorSearch, setDoctorSearch] = useState('');

    const loadData = useCallback(async () => {
        setRefreshing(true);
        const [queueRes, docRes] = await Promise.all([
            getAllDoctorQueues(),
            getDoctorUtilization(),
        ]);
        if (queueRes.success) setQueues(queueRes.data || []);
        if (docRes.success) setDoctors(docRes.data || []);
        setRefreshing(false);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 15 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadData();
        }, 15000);
        return () => clearInterval(interval);
    }, [loadData]);

    const openReassign = (appointmentId: string, patientName: string, currentDoctorId: string) => {
        setReassignModal({ open: true, appointmentId, patientName, currentDoctorId });
        setSelectedDoctor('');
        setDoctorSearch('');
    };

    const handleReassign = async () => {
        if (!selectedDoctor) return;
        setReassigning(true);
        const doc = doctors.find((d: any) => d.doctorId === selectedDoctor);
        const res = await reassignPatient(
            reassignModal.appointmentId,
            selectedDoctor,
            doc?.doctorName || 'Doctor'
        );
        if (res.success) {
            setReassignModal({ open: false, appointmentId: '', patientName: '', currentDoctorId: '' });
            loadData();
        }
        setReassigning(false);
    };

    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting.length, 0);
    const totalInProgress = queues.filter(q => q.current).length;
    const totalCompleted = queues.reduce((sum, q) => sum + (q.completed || 0), 0);

    const filteredDoctors = doctors.filter((d: any) =>
        d.doctorId !== reassignModal.currentDoctorId &&
        (d.doctorName.toLowerCase().includes(doctorSearch.toLowerCase()) ||
         d.specialty.toLowerCase().includes(doctorSearch.toLowerCase()))
    );

    if (loading) {
        return (
            <AppShell pageTitle="Live Queues" pageIcon={<ListOrdered className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading live queues...</span>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle="Live Queues"
            pageIcon={<ListOrdered className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Auto-refresh 15s</span>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
            }
        >
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Doctors</span>
                    <p className="text-2xl font-black text-gray-900 mt-1">{queues.length}</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">In Progress</span>
                    <p className="text-2xl font-black text-violet-600 mt-1">{totalInProgress}</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Waiting</span>
                    <p className="text-2xl font-black text-amber-600 mt-1">{totalWaiting}</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</span>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{totalCompleted}</p>
                </div>
            </div>

            {/* Queue Cards */}
            {queues.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                    <ListOrdered className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No active queues today</p>
                    <p className="text-gray-300 text-sm mt-1">Queues appear once patients check in for appointments</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {queues.map((queue: any) => (
                        <div key={queue.doctorId} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                            {/* Doctor Header */}
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">{queue.doctorName}</h3>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{queue.department || 'General'}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                            {queue.completed || 0} done
                                        </span>
                                        <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                            {queue.waiting.length} waiting
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Current Patient */}
                            {queue.current ? (
                                <div className="mx-4 mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
                                                <User className="h-4 w-4 text-violet-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-violet-700">{queue.current.patientName}</p>
                                                <p className="text-[10px] text-violet-500">Token #{queue.current.token} {queue.current.reason ? `- ${queue.current.reason}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-2.5 py-1 rounded-full uppercase">In Progress</span>
                                            <button
                                                onClick={() => openReassign(queue.current.appointmentId, queue.current.patientName, queue.doctorId)}
                                                className="p-1.5 hover:bg-violet-100 rounded-lg text-violet-400 hover:text-violet-600 transition-colors"
                                                title="Reassign patient"
                                            >
                                                <Shuffle className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mx-4 mt-4 p-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center">
                                    <p className="text-xs text-gray-400 font-medium">No patient currently being seen</p>
                                </div>
                            )}

                            {/* Waiting List */}
                            <div className="p-4 space-y-2">
                                {queue.waiting.length > 0 && (
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Waiting Queue</p>
                                )}
                                {queue.waiting.map((patient: any, idx: number) => (
                                    <div key={patient.appointmentId} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center">
                                                <span className="text-xs font-black text-amber-600">{patient.token || idx + 1}</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{patient.patientName}</p>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                    <Clock className="h-2.5 w-2.5" />
                                                    {patient.checkedInAt
                                                        ? `Checked in ${Math.round((Date.now() - new Date(patient.checkedInAt).getTime()) / 60000)}m ago`
                                                        : `~${(idx + 1) * 15} min wait`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => openReassign(patient.appointmentId, patient.patientName, queue.doctorId)}
                                            className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors"
                                            title="Reassign to another doctor"
                                        >
                                            <Shuffle className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                                {queue.waiting.length === 0 && !queue.current && (
                                    <p className="text-center text-gray-300 text-xs py-3">No patients waiting</p>
                                )}
                            </div>

                            {/* Scheduled (not checked in) */}
                            {queue.scheduled.length > 0 && (
                                <div className="px-4 pb-4">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Scheduled (Not Checked In)</p>
                                    {queue.scheduled.map((patient: any) => (
                                        <div key={patient.appointmentId} className="flex items-center justify-between py-2 px-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                                                <span className="text-xs text-gray-500">{patient.patientName}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Scheduled</span>
                                                <button
                                                    onClick={() => openReassign(patient.appointmentId, patient.patientName, queue.doctorId)}
                                                    className="p-1 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-500 transition-colors"
                                                    title="Reassign"
                                                >
                                                    <Shuffle className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Reassign Modal */}
            {reassignModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Reassign Patient</h3>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                                    {reassignModal.patientName}
                                </p>
                            </div>
                            <button
                                onClick={() => setReassignModal({ open: false, appointmentId: '', patientName: '', currentDoctorId: '' })}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-6 pt-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search doctors by name or specialty..."
                                    value={doctorSearch}
                                    onChange={(e) => setDoctorSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-300 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Doctor List */}
                        <div className="px-6 py-4 max-h-64 overflow-y-auto space-y-2">
                            {filteredDoctors.length > 0 ? filteredDoctors.map((doc: any) => (
                                <label
                                    key={doc.doctorId}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                                        selectedDoctor === doc.doctorId
                                            ? 'bg-teal-50 border-teal-300'
                                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="doctor"
                                        value={doc.doctorId}
                                        checked={selectedDoctor === doc.doctorId}
                                        onChange={() => setSelectedDoctor(doc.doctorId)}
                                        className="accent-teal-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900">{doc.doctorName}</p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{doc.specialty}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-black text-gray-700">{doc.utilizationPct}%</p>
                                        <p className="text-[10px] text-gray-400">utilized</p>
                                    </div>
                                </label>
                            )) : (
                                <div className="text-center py-6 text-gray-400">
                                    <Users className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                                    <p className="text-xs font-medium">No other doctors available</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setReassignModal({ open: false, appointmentId: '', patientName: '', currentDoctorId: '' })}
                                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReassign}
                                disabled={!selectedDoctor || reassigning}
                                className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {reassigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
                                {reassigning ? 'Reassigning...' : 'Reassign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
