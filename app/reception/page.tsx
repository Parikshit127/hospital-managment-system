'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, UserPlus, Search, Filter, Calendar, Phone, Clock,
    ChevronLeft, ChevronRight, Eye, Zap, Loader2, Activity,
    X, FileText, Thermometer
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getRegisteredPatients, getReceptionStats, getPatientDetail } from '@/app/actions/reception-actions';

export default function ReceptionDashboard() {
    const [patients, setPatients] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    // Patient detail modal
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [patientDetail, setPatientDetail] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [patientsRes, statsRes] = await Promise.all([
                getRegisteredPatients({ search, department, page, limit: 25, dateRange }),
                getReceptionStats(),
            ]);
            if (patientsRes.success) {
                setPatients(patientsRes.data || []);
                setTotalPages(patientsRes.totalPages || 0);
                setTotal(patientsRes.total || 0);
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (err) {
            console.error('Reception load error:', err);
        }
        setLoading(false);
    }, [search, department, page, dateRange]);

    useEffect(() => { loadData(); }, [loadData]);

    // Debounced search
    const [searchInput, setSearchInput] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const openPatientDetail = async (patientId: string) => {
        setSelectedPatient(patientId);
        setDetailLoading(true);
        const res = await getPatientDetail(patientId);
        if (res.success) setPatientDetail(res.data);
        setDetailLoading(false);
    };

    const closeDetail = () => {
        setSelectedPatient(null);
        setPatientDetail(null);
    };

    const getStatusColor = (status: string | null) => {
        if (!status) return 'bg-gray-100 text-gray-500';
        const map: Record<string, string> = {
            'Pending': 'bg-amber-50 text-amber-700 border border-amber-200',
            'Scheduled': 'bg-blue-50 text-blue-700 border border-blue-200',
            'Checked In': 'bg-teal-50 text-teal-700 border border-teal-200',
            'In Progress': 'bg-violet-50 text-violet-700 border border-violet-200',
            'Completed': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            'Admitted': 'bg-rose-50 text-rose-700 border border-rose-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    const headerActions = (
        <div className="flex items-center gap-2">
            <Link href="/reception/register"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all">
                <UserPlus className="h-3.5 w-3.5" /> Register Patient
            </Link>
            <Link href="/reception/triage"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                <Zap className="h-3.5 w-3.5" /> AI Triage
            </Link>
        </div>
    );

    return (
        <AppShell
            pageTitle="Reception"
            pageIcon={<Users className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">
                {/* KPI ROW */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today's Registrations</span>
                            <div className="p-1.5 bg-blue-50 rounded-lg"><UserPlus className="h-3.5 w-3.5 text-blue-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.todayRegistrations || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today's Appointments</span>
                            <div className="p-1.5 bg-teal-50 rounded-lg"><Calendar className="h-3.5 w-3.5 text-teal-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.todayAppointments || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pending</span>
                            <div className="p-1.5 bg-amber-50 rounded-lg"><Clock className="h-3.5 w-3.5 text-amber-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.pendingAppointments || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Completed</span>
                            <div className="p-1.5 bg-emerald-50 rounded-lg"><Activity className="h-3.5 w-3.5 text-emerald-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.completedToday || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Patients</span>
                            <div className="p-1.5 bg-violet-50 rounded-lg"><Users className="h-3.5 w-3.5 text-violet-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.totalPatients || 0}</p>
                    </div>
                </div>

                {/* SEARCH & FILTERS */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, patient ID, or phone..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={department}
                            onChange={e => { setDepartment(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Departments</option>
                            <option value="General Medicine">General Medicine</option>
                            <option value="Cardiology">Cardiology</option>
                            <option value="Orthopedics">Orthopedics</option>
                            <option value="Pediatrics">Pediatrics</option>
                            <option value="Neurology">Neurology</option>
                            <option value="ENT">ENT</option>
                            <option value="Dermatology">Dermatology</option>
                            <option value="Pulmonology">Pulmonology</option>
                        </select>
                        <select
                            value={dateRange}
                            onChange={e => { setDateRange(e.target.value as any); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                        </select>
                    </div>
                </div>

                {/* PATIENT TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Patient ID', 'Name', 'Age / Gender', 'Phone', 'Department', 'Registered', 'Status', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && patients.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-16">
                                            <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                                            <p className="text-gray-400 text-xs mt-2">Loading patients...</p>
                                        </td>
                                    </tr>
                                ) : patients.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-16">
                                            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm font-medium">No patients found</p>
                                            <p className="text-gray-300 text-xs mt-1">Try adjusting your search or filters</p>
                                        </td>
                                    </tr>
                                ) : patients.map((patient: any) => (
                                    <tr key={patient.patient_id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-mono font-bold text-blue-600">{patient.patient_id}</span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{patient.full_name}</td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {patient.age || '-'} / {patient.gender || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {patient.phone ? (
                                                <span className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3" />
                                                    {patient.phone}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{patient.department || '-'}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {new Date(patient.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {patient.lastAppointmentStatus ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusColor(patient.lastAppointmentStatus)}`}>
                                                    {patient.lastAppointmentStatus}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => openPatientDetail(patient.patient_id)}
                                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                                                title="View Details"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                            <span className="text-xs text-gray-400">
                                Showing {((page - 1) * 25) + 1} - {Math.min(page * 25, total)} of {total}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4 text-gray-400" />
                                </button>
                                <span className="text-xs font-medium text-gray-500">Page {page} of {totalPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* PATIENT DETAIL MODAL */}
            {selectedPatient && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
                    <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                            <h2 className="text-base font-bold text-gray-900">Patient Details</h2>
                            <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {detailLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            </div>
                        ) : patientDetail ? (
                            <div className="p-6 space-y-6">
                                {/* Patient Info Card */}
                                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-gray-900">{patientDetail.patient.full_name}</h3>
                                        <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                                            {patientDetail.patient.patient_id}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Age</span>
                                            <p className="text-gray-700">{patientDetail.patient.age || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Gender</span>
                                            <p className="text-gray-700">{patientDetail.patient.gender || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Phone</span>
                                            <p className="text-gray-700">{patientDetail.patient.phone || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Department</span>
                                            <p className="text-gray-700">{patientDetail.patient.department || '-'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Appointment History */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                                        <Calendar className="h-4 w-4 text-blue-500" /> Appointment History
                                    </h4>
                                    {patientDetail.appointments?.length > 0 ? (
                                        <div className="space-y-2">
                                            {patientDetail.appointments.map((appt: any) => (
                                                <div key={appt.appointment_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                    <div>
                                                        <span className="text-xs font-mono text-gray-500">{appt.appointment_id}</span>
                                                        <p className="text-sm text-gray-700">{appt.department || 'General'} — {appt.reason_for_visit || 'Consultation'}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusColor(appt.status)}`}>
                                                            {appt.status}
                                                        </span>
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            {new Date(appt.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 py-4 text-center">No appointments found</p>
                                    )}
                                </div>

                                {/* Triage History */}
                                {patientDetail.triageHistory?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                                            <Zap className="h-4 w-4 text-violet-500" /> Triage History
                                        </h4>
                                        <div className="space-y-2">
                                            {patientDetail.triageHistory.map((t: any) => (
                                                <div key={t.id} className="p-3 bg-gray-50 rounded-xl">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                            t.triage_level === 'Emergency' ? 'bg-rose-50 text-rose-700' :
                                                            t.triage_level === 'Urgent' ? 'bg-amber-50 text-amber-700' :
                                                            'bg-blue-50 text-blue-700'
                                                        }`}>{t.triage_level}</span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-600">{t.symptoms}</p>
                                                    {t.recommended_department && (
                                                        <p className="text-[10px] text-gray-400 mt-1">Recommended: {t.recommended_department}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Latest Vitals */}
                                {patientDetail.vitals?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                                            <Thermometer className="h-4 w-4 text-rose-500" /> Latest Vitals
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {patientDetail.vitals[0].blood_pressure && (
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">BP</span>
                                                    <p className="text-sm font-bold text-gray-900">{patientDetail.vitals[0].blood_pressure}</p>
                                                </div>
                                            )}
                                            {patientDetail.vitals[0].heart_rate && (
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">HR</span>
                                                    <p className="text-sm font-bold text-gray-900">{patientDetail.vitals[0].heart_rate} bpm</p>
                                                </div>
                                            )}
                                            {patientDetail.vitals[0].temperature && (
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Temp</span>
                                                    <p className="text-sm font-bold text-gray-900">{patientDetail.vitals[0].temperature}°F</p>
                                                </div>
                                            )}
                                            {patientDetail.vitals[0].oxygen_sat && (
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">SpO2</span>
                                                    <p className="text-sm font-bold text-gray-900">{patientDetail.vitals[0].oxygen_sat}%</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-16 text-center text-gray-400 text-sm">Failed to load patient details</div>
                        )}
                    </div>
                </div>
            )}
        </AppShell>
    );
}
