'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    User, Calendar, Phone, Mail, MapPin, Activity, Loader2,
    FileText, Thermometer, Zap, ArrowLeft, Clock, Shield,
    Pencil, Check, X, CalendarPlus, FlaskConical, History
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getPatientDetail, updatePatientField } from '@/app/actions/reception-actions';
import { useToast } from '@/app/components/ui/Toast';

/** Inline editable field */
function EditableField({
    label, value, field, patientId, onSave, type = 'text',
}: {
    label: string; value: string; field: string; patientId: string;
    onSave: () => void; type?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSave = async () => {
        if (editValue === value) { setEditing(false); return; }
        setSaving(true);
        const result = await updatePatientField(patientId, field, editValue);
        setSaving(false);
        if (result.success) {
            setEditing(false);
            onSave();
        } else {
            toast.error(result.error || 'Failed to update');
        }
    };

    if (editing) {
        return (
            <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase">{label}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                        type={type}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                        className="flex-1 px-2 py-1 text-sm border border-teal-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                        autoFocus
                    />
                    <button onClick={handleSave} disabled={saving}
                        className="p-1 text-teal-600 hover:bg-teal-50 rounded">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { setEditing(false); setEditValue(value); }}
                        className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="group cursor-pointer" onClick={() => setEditing(true)}>
            <span className="text-[10px] font-semibold text-gray-400 uppercase">{label}</span>
            <p className="text-sm text-gray-900 flex items-center gap-1">
                {value || <span className="text-gray-300">-</span>}
                <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
        </div>
    );
}

/** Timeline event component */
function TimelineEvent({ type, title, subtitle, date, color }: {
    type: string; title: string; subtitle?: string; date: string; color: string;
}) {
    const iconMap: Record<string, React.ReactNode> = {
        appointment: <Calendar className="h-3 w-3" />,
        triage: <Zap className="h-3 w-3" />,
        vitals: <Thermometer className="h-3 w-3" />,
        registration: <User className="h-3 w-3" />,
    };
    return (
        <div className="flex gap-3">
            <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white ${color}`}>
                    {iconMap[type] || <Activity className="h-3 w-3" />}
                </div>
                <div className="w-px flex-1 bg-gray-200 mt-1" />
            </div>
            <div className="pb-4 flex-1">
                <p className="text-sm font-bold text-gray-800">{title}</p>
                {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">{date}</p>
            </div>
        </div>
    );
}

export default function PatientProfilePage() {
    const params = useParams();
    const router = useRouter();
    const toast = useToast();
    const patientId = params.id as string;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'triage' | 'vitals' | 'timeline'>('overview');

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getPatientDetail(patientId);
        if (res.success) setData(res.data);
        setLoading(false);
    }, [patientId]);

    useEffect(() => { loadData(); }, [loadData]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
            'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
            'Checked In': 'bg-teal-50 text-teal-700 border-teal-200',
            'In Progress': 'bg-violet-50 text-violet-700 border-violet-200',
            'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Cancelled': 'bg-red-50 text-red-700 border-red-200',
            'Admitted': 'bg-rose-50 text-rose-700 border-rose-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    const formatDate = (d: string | Date) =>
        new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const headerActions = (
        <div className="flex items-center gap-2">
            <Link href="/reception"
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <button onClick={() => router.push('/reception/appointments')}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md">
                <CalendarPlus className="h-3.5 w-3.5" /> Book Appointment
            </button>
        </div>
    );

    if (loading) {
        return (
            <AppShell pageTitle="Patient Profile" pageIcon={<User className="h-5 w-5" />} headerActions={headerActions}>
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                </div>
            </AppShell>
        );
    }

    if (!data) {
        return (
            <AppShell pageTitle="Patient Profile" pageIcon={<User className="h-5 w-5" />} headerActions={headerActions}>
                <div className="flex items-center justify-center py-32">
                    <div className="text-center">
                        <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">Patient not found</p>
                    </div>
                </div>
            </AppShell>
        );
    }

    const patient = data.patient;

    // Build timeline from all data sources
    const timelineEvents = [
        // Registration event
        { type: 'registration', title: 'Patient Registered', subtitle: `ID: ${patient.patient_id}`, date: formatDate(patient.created_at), sortDate: new Date(patient.created_at), color: 'bg-teal-500' },
        // Appointments
        ...(data.appointments || []).map((a: any) => ({
            type: 'appointment',
            title: `${a.status} — ${a.department || 'General'}`,
            subtitle: `${a.doctor_name || 'Doctor'} · ${a.reason_for_visit || 'Consultation'} · ${a.appointment_id}`,
            date: formatDate(a.appointment_date),
            sortDate: new Date(a.appointment_date),
            color: a.status === 'Completed' ? 'bg-emerald-500' : a.status === 'Cancelled' ? 'bg-red-400' : 'bg-blue-500',
        })),
        // Triage
        ...(data.triageHistory || []).map((t: any) => ({
            type: 'triage',
            title: `Triage: ${t.triage_level}`,
            subtitle: `Symptoms: ${t.symptoms || '-'}`,
            date: formatDate(t.created_at),
            sortDate: new Date(t.created_at),
            color: t.triage_level === 'Emergency' ? 'bg-red-500' : t.triage_level === 'Urgent' ? 'bg-amber-500' : 'bg-blue-500',
        })),
        // Vitals
        ...(data.vitals || []).map((v: any) => ({
            type: 'vitals',
            title: 'Vitals Recorded',
            subtitle: [v.blood_pressure && `BP: ${v.blood_pressure}`, v.heart_rate && `HR: ${v.heart_rate}`, v.temperature && `Temp: ${v.temperature}°F`].filter(Boolean).join(' · ') || 'No data',
            date: formatDate(v.created_at),
            sortDate: new Date(v.created_at),
            color: 'bg-violet-500',
        })),
    ].sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

    return (
        <AppShell pageTitle={patient.full_name} pageIcon={<User className="h-5 w-5" />}
            headerActions={headerActions} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* Patient Info Card — Inline Editable */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-teal-500/20 shrink-0">
                            {patient.full_name?.charAt(0) || 'P'}
                        </div>
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <span className="text-[10px] font-semibold text-gray-400 uppercase">Patient ID</span>
                                <p className="text-sm font-mono font-bold text-teal-600">{patient.patient_id}</p>
                            </div>
                            <EditableField label="Full Name" value={patient.full_name || ''} field="full_name" patientId={patientId} onSave={loadData} />
                            <EditableField label="Phone" value={patient.phone || ''} field="phone" patientId={patientId} onSave={loadData} type="tel" />
                            <EditableField label="Age" value={patient.age || ''} field="age" patientId={patientId} onSave={loadData} />
                            <EditableField label="Gender" value={patient.gender || ''} field="gender" patientId={patientId} onSave={loadData} />
                            <EditableField label="Department" value={patient.department || ''} field="department" patientId={patientId} onSave={loadData} />
                            <EditableField label="Email" value={patient.email || ''} field="email" patientId={patientId} onSave={loadData} type="email" />
                            <EditableField label="Blood Group" value={patient.blood_group || ''} field="blood_group" patientId={patientId} onSave={loadData} />
                            <EditableField label="Date of Birth" value={patient.date_of_birth || ''} field="date_of_birth" patientId={patientId} onSave={loadData} type="date" />
                            <EditableField label="Address" value={patient.address || ''} field="address" patientId={patientId} onSave={loadData} />
                            <EditableField label="Emergency Contact" value={patient.emergency_contact_name || ''} field="emergency_contact_name" patientId={patientId} onSave={loadData} />
                            <EditableField label="Emergency Phone" value={patient.emergency_contact_phone || ''} field="emergency_contact_phone" patientId={patientId} onSave={loadData} type="tel" />
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
                    {[
                        { key: 'overview', label: 'Overview', icon: <Activity className="h-3.5 w-3.5" /> },
                        { key: 'timeline', label: 'Timeline', icon: <History className="h-3.5 w-3.5" /> },
                        { key: 'appointments', label: `Appointments (${data.appointments?.length || 0})`, icon: <Calendar className="h-3.5 w-3.5" /> },
                        { key: 'triage', label: `Triage (${data.triageHistory?.length || 0})`, icon: <Zap className="h-3.5 w-3.5" /> },
                        { key: 'vitals', label: `Vitals (${data.vitals?.length || 0})`, icon: <Thermometer className="h-3.5 w-3.5" /> },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.key
                                ? 'bg-teal-50 text-teal-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Quick Stats */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Quick Stats</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">Total Visits</span>
                                    <span className="text-sm font-bold text-gray-900">{data.appointments?.length || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">Global Balance</span>
                                    <span className={`text-sm font-bold ${patient.totalBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        ₹{patient.totalBalance > 0 ? Number(patient.totalBalance).toFixed(2) : '0'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">Triage Sessions</span>
                                    <span className="text-sm font-bold text-gray-900">{data.triageHistory?.length || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">Vitals Recorded</span>
                                    <span className="text-sm font-bold text-gray-900">{data.vitals?.length || 0}</span>
                                </div>
                            </div>
                        </div>
                        {/* Last Appointment */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Last Appointment</h3>
                            {data.appointments?.[0] ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-700">{data.appointments[0].department || 'General'}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(data.appointments[0].status)}`}>
                                            {data.appointments[0].status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400">{formatDate(data.appointments[0].appointment_date)}</p>
                                    <p className="text-xs text-gray-500">{data.appointments[0].doctor_name || '-'}</p>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-300">No appointments yet</p>
                            )}
                        </div>
                        {/* Last Vitals */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Latest Vitals</h3>
                            {data.vitals?.[0] ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {data.vitals[0].blood_pressure && (
                                        <div className="bg-gray-50 rounded-xl p-2 text-center">
                                            <span className="text-[9px] text-gray-400 uppercase">BP</span>
                                            <p className="text-sm font-bold text-gray-900">{data.vitals[0].blood_pressure}</p>
                                        </div>
                                    )}
                                    {data.vitals[0].heart_rate && (
                                        <div className="bg-gray-50 rounded-xl p-2 text-center">
                                            <span className="text-[9px] text-gray-400 uppercase">HR</span>
                                            <p className="text-sm font-bold text-gray-900">{data.vitals[0].heart_rate} bpm</p>
                                        </div>
                                    )}
                                    {data.vitals[0].temperature && (
                                        <div className="bg-gray-50 rounded-xl p-2 text-center">
                                            <span className="text-[9px] text-gray-400 uppercase">Temp</span>
                                            <p className="text-sm font-bold text-gray-900">{data.vitals[0].temperature}°F</p>
                                        </div>
                                    )}
                                    {data.vitals[0].oxygen_sat && (
                                        <div className="bg-gray-50 rounded-xl p-2 text-center">
                                            <span className="text-[9px] text-gray-400 uppercase">SpO2</span>
                                            <p className="text-sm font-bold text-gray-900">{data.vitals[0].oxygen_sat}%</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-300">No vitals recorded</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'timeline' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-1.5">
                            <History className="h-3.5 w-3.5" /> Patient Timeline
                        </h3>
                        {timelineEvents.length === 0 ? (
                            <p className="text-sm text-gray-300 text-center py-8">No events recorded</p>
                        ) : (
                            <div className="ml-1">
                                {timelineEvents.map((event, idx) => (
                                    <TimelineEvent key={idx} {...event} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'appointments' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['ID', 'Date', 'Doctor', 'Department', 'Reason', 'Status'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.appointments?.map((appt: any) => (
                                    <tr key={appt.appointment_id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-xs font-mono text-teal-600">{appt.appointment_id}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(appt.appointment_date)}</td>
                                        <td className="px-4 py-3 text-gray-700">{appt.doctor_name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{appt.department || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{appt.reason_for_visit || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusColor(appt.status)}`}>
                                                {appt.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'triage' && (
                    <div className="space-y-3">
                        {data.triageHistory?.length > 0 ? data.triageHistory.map((t: any) => (
                            <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.triage_level === 'Emergency' ? 'bg-rose-50 text-rose-700' :
                                            t.triage_level === 'Urgent' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                                        }`}>{t.triage_level}</span>
                                    <span className="text-[10px] text-gray-400">{formatDate(t.created_at)}</span>
                                </div>
                                <p className="text-sm text-gray-700 mb-2"><strong>Symptoms:</strong> {t.symptoms}</p>
                                {t.recommended_department && <p className="text-xs text-gray-500">Recommended: {t.recommended_department}</p>}
                                {t.possible_conditions && <p className="text-xs text-gray-500 mt-1">Conditions: {t.possible_conditions}</p>}
                                {t.clinical_summary && (
                                    <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                                        <p className="text-xs text-gray-600">{t.clinical_summary}</p>
                                    </div>
                                )}
                            </div>
                        )) : (
                            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                                <Zap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                <p className="text-gray-400 text-sm">No triage records</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'vitals' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Date', 'BP', 'Heart Rate', 'Temp', 'SpO2', 'Weight', 'Recorded By'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.vitals?.map((v: any) => (
                                    <tr key={v.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(v.created_at)}</td>
                                        <td className="px-4 py-3 font-medium">{v.blood_pressure || '-'}</td>
                                        <td className="px-4 py-3">{v.heart_rate ? `${v.heart_rate} bpm` : '-'}</td>
                                        <td className="px-4 py-3">{v.temperature ? `${v.temperature}°F` : '-'}</td>
                                        <td className="px-4 py-3">{v.oxygen_sat ? `${v.oxygen_sat}%` : '-'}</td>
                                        <td className="px-4 py-3">{v.weight ? `${v.weight} kg` : '-'}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">{v.recorded_by || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
