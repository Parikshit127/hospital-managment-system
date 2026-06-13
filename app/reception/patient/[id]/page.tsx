'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { useParams, useRouter } from 'next/navigation';
import {
    User, Calendar, Phone, Mail, MapPin, Activity, Loader2,
    FileText, Thermometer, Zap, ArrowLeft, Clock, Shield,
    Pencil, Check, X, CalendarPlus, FlaskConical, History, CreditCard, DollarSign,
    Upload, Plus, Trash2, ExternalLink, ChevronRight, AlertTriangle, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getPatientDetail, updatePatientField, addPatientDues, getPatientExternalRecords, savePatientExternalRecord, deletePatientExternalRecord, archivePatient } from '@/app/actions/reception-actions';
import { getPatientFinancialProfile } from '@/app/actions/master-billing-actions';
import { recordPayment } from '@/app/actions/finance-actions';
import { getCashComplianceConfig } from '@/app/actions/cash-compliance-actions';
import { CASH_COMPLIANCE_DEFAULTS, isValidPan } from '@/app/lib/cash-compliance';
import { useToast } from '@/app/components/ui/Toast';
import { EditInvoiceModal } from '@/app/components/finance/EditInvoiceModal';
import { getInsuranceProviders, addPatientPolicy, getPatientPolicies } from '@/app/actions/insurance-actions';

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
                    {type === 'date' ? (
                        <DateField
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                            className="flex-1 px-2 py-1 text-sm border border-teal-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                            autoFocus
                        />
                    ) : (
                        <input
                            type={type}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                            className="flex-1 px-2 py-1 text-sm border border-teal-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                            autoFocus
                        />
                    )}
                    <button onClick={handleSave} disabled={saving}
                        className="p-1 text-orange-600 hover:bg-orange-50 rounded">
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

    // Show dates in Indian DD/MM/YYYY format; keep raw YYYY-MM-DD for the date input.
    const displayValue = type === 'date' && value
        ? new Date(value).toLocaleDateString('en-GB')
        : value;

    return (
        <div className="group cursor-pointer" onClick={() => setEditing(true)}>
            <span className="text-[10px] font-semibold text-gray-400 uppercase">{label}</span>
            <p className="text-sm text-gray-900 flex items-center gap-1">
                {displayValue || <span className="text-gray-300">-</span>}
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
    const [processLoading, setProcessLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'triage' | 'vitals' | 'timeline' | 'billing' | 'records'>('overview');
    
    // Billing Modals State
    const [showDuesModal, setShowDuesModal] = useState(false);
    const [dueForm, setDueForm] = useState({ amount: '', description: '', department: 'General' });
    // Master billing integration state
    const [financialProfile, setFinancialProfile] = useState<any>(null);
    const [financialLoading, setFinancialLoading] = useState(false);
    const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
    const [payingInvoice, setPayingInvoice] = useState<any>(null);
    const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

    const [archiving, setArchiving] = useState(false);

    // Insurance state
    const [showInsuranceModal, setShowInsuranceModal] = useState(false);
    const [insuranceProviders, setInsuranceProviders] = useState<any[]>([]);
    const [patientPolicies, setPatientPolicies] = useState<any[]>([]);
    const [insuranceForm, setInsuranceForm] = useState({
        provider_id: '', policy_number: '', policy_holder: '',
        plan_name: '', coverage_limit: '', valid_from: '', valid_until: ''
    });
    const [savingInsurance, setSavingInsurance] = useState(false);

    const openInsuranceModal = async () => {
        setShowInsuranceModal(true);
        setInsuranceForm({ provider_id: '', policy_number: '', policy_holder: '', plan_name: '', coverage_limit: '', valid_from: '', valid_until: '' });
        const [pRes, polRes] = await Promise.all([
            getInsuranceProviders(),
            getPatientPolicies(patientId),
        ]);
        if (pRes.success) setInsuranceProviders(pRes.data || []);
        if (polRes.success) setPatientPolicies(polRes.data || []);
    };

    const handleSaveInsurance = async () => {
        if (!insuranceForm.provider_id || !insuranceForm.policy_number || !insuranceForm.coverage_limit) {
            toast.error('Provider, policy number and coverage limit are required');
            return;
        }
        setSavingInsurance(true);
        const res = await addPatientPolicy({
            patient_id: patientId,
            provider_id: Number(insuranceForm.provider_id),
            policy_number: insuranceForm.policy_number,
            policy_holder: insuranceForm.policy_holder || undefined,
            plan_name: insuranceForm.plan_name || undefined,
            coverage_limit: Number(insuranceForm.coverage_limit),
            valid_from: insuranceForm.valid_from,
            valid_until: insuranceForm.valid_until,
        });
        setSavingInsurance(false);
        if (res.success) {
            toast.success('Insurance policy added');
            setShowInsuranceModal(false);
            // Also update patient type to tpa_insurance
            await updatePatientField(patientId, 'patient_type', 'tpa_insurance');
            loadData();
        } else {
            toast.error(res.error || 'Failed to add policy');
        }
    };

    const handleArchive = async () => {
        if (!window.confirm('Archive this patient? They will be hidden from the patient list but all records are preserved.')) return;
        setArchiving(true);
        const res = await archivePatient(patientId);
        setArchiving(false);
        if (res.success) {
            router.push('/reception');
        } else {
            toast.error('Archive failed: ' + (res.error || 'Unknown error'));
        }
    };

    // External records state
    const [externalRecords, setExternalRecords] = useState<any[]>([]);
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [recordForm, setRecordForm] = useState({ title: '', description: '', hospital_name: '', record_date: '', file_url: '', file_name: '' });
    const [savingRecord, setSavingRecord] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getPatientDetail(patientId);
        if (res.success) setData(res.data);
        const extRes = await getPatientExternalRecords(patientId);
        if (extRes.success) setExternalRecords(extRes.data || []);
        // Load insurance policies so the header can show policy details (or '–').
        const polRes = await getPatientPolicies(patientId);
        if (polRes.success) setPatientPolicies(polRes.data || []);
        setLoading(false);
    }, [patientId]);

    const handleAddDues = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessLoading(true);
        const res = await addPatientDues({
            patient_id: patientId,
            department: dueForm.department,
            description: dueForm.description,
            amount: Number(dueForm.amount)
        });
        setProcessLoading(false);
        if (res.success) {
            toast.success('Dues Added: New tag dues applied to patient');
            setShowDuesModal(false);
            setDueForm({ amount: '', description: '', department: 'General' });
            loadData();
            loadFinancialProfile();
        } else {
            toast.error('Failed: ' + (res.error || 'Could not add dues'));
        }
    };

    useEffect(() => { loadData(); }, [loadData]);

    const loadFinancialProfile = useCallback(async () => {
        setFinancialLoading(true);
        const res = await getPatientFinancialProfile(patientId);
        if (res.success) setFinancialProfile(res.data);
        setFinancialLoading(false);
    }, [patientId]);

    useEffect(() => {
        if (activeTab === 'billing') loadFinancialProfile();
    }, [activeTab, loadFinancialProfile]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
            'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
            'Checked In': 'bg-orange-50 text-orange-700 border-orange-200',
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
            <button onClick={handleArchive} disabled={archiving}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-500 text-xs font-bold rounded-xl hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> {archiving ? 'Archiving…' : 'Archive Patient'}
            </button>
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
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingFile(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch('/api/upload/patient-record', { method: 'POST', body: fd });
            const json = await res.json();
            if (json.key) setRecordForm(f => ({ ...f, file_url: json.key, file_name: json.fileName || file.name }));
        } catch { alert('Upload failed'); }
        setUploadingFile(false);
    };

    const handleSaveRecord = async () => {
        if (!recordForm.title.trim()) return alert('Title is required');
        setSavingRecord(true);
        const res = await savePatientExternalRecord(patientId, recordForm);
        if (res.success) {
            setShowRecordModal(false);
            setRecordForm({ title: '', description: '', hospital_name: '', record_date: '', file_url: '', file_name: '' });
            loadData();
        } else alert(res.error);
        setSavingRecord(false);
    };

    const fmtDate = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

    // Build timeline from all data sources
    const timelineEvents = [
        // Registration event
        { type: 'registration', title: 'Patient Registered', subtitle: `ID: ${patient.patient_id}`, date: formatDate(patient.created_at), sortDate: new Date(patient.created_at), color: 'bg-orange-500' },
        // Appointments
        ...(data.appointments || []).map((a: any) => ({
            type: 'appointment',
            title: `${a.status} — ${a.department || 'General'}`,
            subtitle: a.status === 'Cancelled' && a.cancellation_reason
                ? `${a.doctor_name || 'Doctor'} · Cancelled: ${a.cancellation_reason} · ${a.appointment_id}`
                : `${a.doctor_name || 'Doctor'} · ${a.reason_for_visit || 'Consultation'} · ${a.appointment_id}`,
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

    // Primary (latest) insurance policy for the header display; '–' when none.
    const primaryPolicy = patientPolicies[0];
    const fmtPolicyDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
    const policyValidity = primaryPolicy
        ? `${fmtPolicyDate(primaryPolicy.valid_from)} – ${fmtPolicyDate(primaryPolicy.valid_until)}`
        : '';

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
                                <p className="text-sm font-mono font-bold text-orange-600">{patient.patient_id}</p>
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
                            <EditableField label="Nationality" value={patient.nationality || ''} field="nationality" patientId={patientId} onSave={loadData} />
                            <EditableField label="Govt Proof Type" value={patient.govt_id_type || ''} field="govt_id_type" patientId={patientId} onSave={loadData} />
                            <EditableField label="Govt Proof Number" value={patient.govt_id_number || ''} field="govt_id_number" patientId={patientId} onSave={loadData} />
                            <EditableField label="Emergency Contact" value={patient.emergency_contact_name || ''} field="emergency_contact_name" patientId={patientId} onSave={loadData} />
                            <EditableField label="Emergency Phone" value={patient.emergency_contact_phone || ''} field="emergency_contact_phone" patientId={patientId} onSave={loadData} type="tel" />
                            <div>
                                <span className="text-[10px] font-semibold text-gray-400 uppercase">Policy Name</span>
                                <p className="text-sm font-medium text-gray-800">{primaryPolicy?.provider?.provider_name || '–'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-semibold text-gray-400 uppercase">Policy Number</span>
                                <p className="text-sm font-mono font-medium text-gray-800">{primaryPolicy?.policy_number || '–'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-semibold text-gray-400 uppercase">Policy Validity</span>
                                <p className="text-sm font-medium text-gray-800">{policyValidity || '–'}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3 md:mt-0">
                            <button onClick={() => window.open(`/api/patient/${patientId}/stickers`, '_blank')}
                                className="px-3 py-1.5 bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors">
                                Print Stickers (24)
                            </button>
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
                        { key: 'billing', label: `Billing (${data.invoices?.length || 0})`, icon: <CreditCard className="h-3.5 w-3.5" /> },
                        { key: 'records', label: 'External Records', icon: <Upload className="h-3.5 w-3.5" /> },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.key
                                ? 'bg-orange-50 text-orange-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
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
                                        <td className="px-4 py-3 text-xs font-mono text-orange-600">{appt.appointment_id}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(appt.appointment_date)}</td>
                                        <td className="px-4 py-3 text-gray-700">{appt.doctor_name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{appt.department || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[260px]">
                                            <p className="truncate">{appt.reason_for_visit || '-'}</p>
                                            {appt.status === 'Cancelled' && appt.cancellation_reason && (
                                                <p className="mt-1 text-[10px] leading-relaxed text-rose-600" title={appt.cancellation_reason}>
                                                    Cancelled: {appt.cancellation_reason}
                                                </p>
                                            )}
                                        </td>
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
                {activeTab === 'billing' && (
                    <div className="space-y-4">
                        {financialLoading && !financialProfile ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                            </div>
                        ) : (
                            <>
                                {/* Financial Summary Cards */}
                                {financialProfile?.totals && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Total Billed', value: financialProfile.totals.total_billed, color: 'border-l-blue-500' },
                                            { label: 'Total Paid', value: financialProfile.totals.total_paid, color: 'border-l-emerald-500' },
                                            { label: 'Outstanding', value: financialProfile.totals.total_outstanding, color: 'border-l-rose-500' },
                                            { label: 'Deposits Held', value: financialProfile.totals.deposits_held, color: 'border-l-amber-500' },
                                        ].map(card => (
                                            <div key={card.label} className={`bg-white border border-gray-200 border-l-4 ${card.color} rounded-xl px-4 py-3`}>
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{card.label}</div>
                                                <div className="mt-1 text-xl font-black text-gray-800">₹{Number(card.value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Action Bar */}
                                <div className="flex items-center justify-between">
                                    <button onClick={() => setShowDuesModal(true)} disabled={processLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800">
                                        <DollarSign className="h-4 w-4" /> Add Dues
                                    </button>
                                    <Link href={`/billing/patient/${patientId}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50">
                                        <ExternalLink className="h-3.5 w-3.5" /> Full Financial Profile
                                    </Link>
                                </div>

                                {/* Expandable Invoices */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                    {(financialProfile?.invoices ?? []).length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-sm">No invoices found</div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {(financialProfile?.invoices ?? []).map((inv: any) => {
                                                const expanded = expandedInvoice === inv.id;
                                                return (
                                                    <div key={inv.id}>
                                                        <button onClick={() => setExpandedInvoice(expanded ? null : inv.id)}
                                                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
                                                            <div className="flex items-center gap-3 min-w-0 flex-wrap">
                                                                <span className="font-mono text-xs font-bold text-orange-600">{inv.invoice_number}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                    inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                    inv.status === 'Cancelled' ? 'bg-gray-100 text-gray-500' :
                                                                    'bg-blue-100 text-blue-700'
                                                                }`}>{inv.status}</span>
                                                                <span className="text-[10px] text-gray-400">{inv.invoice_type} · {formatDate(inv.created_at)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-xs shrink-0">
                                                                <div className="text-right hidden md:block">
                                                                    <div className="text-[10px] text-gray-400">Net</div>
                                                                    <div className="font-bold">₹{Number(inv.net_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[10px] text-gray-400">Paid</div>
                                                                    <div className="font-bold text-emerald-600">₹{Number(inv.paid_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[10px] text-gray-400">Balance</div>
                                                                    <div className={`font-bold ${Number(inv.balance_due) > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                                                                        ₹{Number(inv.balance_due).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                    </div>
                                                                </div>
                                                                <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                                            </div>
                                                        </button>

                                                        {expanded && (
                                                            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/40 space-y-3">
                                                                {/* Cancelled banner */}
                                                                {inv.status === 'Cancelled' && (
                                                                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2">
                                                                        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                                                                        <div className="text-xs text-rose-700">
                                                                            <p className="font-bold">This invoice has been cancelled.</p>
                                                                            {inv.cancellation_reason && <p>Reason: {inv.cancellation_reason}</p>}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Line Items */}
                                                                {inv.items?.length > 0 && (
                                                                    <div>
                                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                                                                            Line Items ({inv.items.length})
                                                                        </div>
                                                                        <table className="w-full text-xs">
                                                                            <thead className="text-[10px] uppercase text-gray-500 font-bold">
                                                                                <tr>
                                                                                    <th className="text-left py-1">Service</th>
                                                                                    <th className="text-left py-1">Dept</th>
                                                                                    <th className="text-right py-1">Qty</th>
                                                                                    <th className="text-right py-1">Unit</th>
                                                                                    <th className="text-right py-1">Disc</th>
                                                                                    <th className="text-right py-1">Tax</th>
                                                                                    <th className="text-right py-1">Net</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {inv.items.map((it: any) => (
                                                                                    <tr key={it.id} className="border-t border-gray-100">
                                                                                        <td className="py-1">{it.description}</td>
                                                                                        <td className="py-1 text-gray-500">{it.department}</td>
                                                                                        <td className="py-1 text-right">{it.quantity}</td>
                                                                                        <td className="py-1 text-right">₹{Number(it.unit_price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                                        <td className="py-1 text-right">₹{Number(it.discount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                                        <td className="py-1 text-right">₹{Number(it.tax_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                                        <td className="py-1 text-right font-bold">₹{Number(it.net_price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}

                                                                {/* Payments for this invoice */}
                                                                {inv.payments?.length > 0 && (
                                                                    <div>
                                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                                                                            Payments ({inv.payments.length})
                                                                        </div>
                                                                        <table className="w-full text-xs">
                                                                            <thead className="text-[10px] uppercase text-gray-500 font-bold">
                                                                                <tr>
                                                                                    <th className="text-left py-1">Receipt</th>
                                                                                    <th className="text-left py-1">Method</th>
                                                                                    <th className="text-left py-1">Date</th>
                                                                                    <th className="text-right py-1">Amount</th>
                                                                                    <th className="text-right py-1">Status</th>
                                                                                    <th className="text-right py-1"></th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {inv.payments.map((p: any) => (
                                                                                    <tr key={p.id} className="border-t border-gray-100">
                                                                                        <td className="py-1 font-mono">{p.receipt_number}</td>
                                                                                        <td className="py-1">{p.payment_method}</td>
                                                                                        <td className="py-1 text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                                                                                        <td className="py-1 text-right font-bold text-emerald-600">₹{Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                                        <td className="py-1 text-right">
                                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                                                p.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                                                                                p.status === 'Reversed' ? 'bg-rose-100 text-rose-700' :
                                                                                                'bg-gray-100 text-gray-600'
                                                                                            }`}>{p.status}</span>
                                                                                        </td>
                                                                                        <td className="py-1 text-right">
                                                                                            <button onClick={() => window.open(`/api/payment/${p.id}/receipt`, '_blank')}
                                                                                                className="text-[10px] font-bold text-blue-600 hover:underline">Receipt</button>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}

                                                                {/* Invoice Actions */}
                                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                                    {inv.status !== 'Cancelled' && Number(inv.paid_amount) === 0 && (
                                                                        <button onClick={(e) => { e.stopPropagation(); setEditingInvoiceId(Number(inv.id)); }}
                                                                            className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 flex items-center gap-1">
                                                                            <Pencil className="h-3 w-3" /> Edit Invoice
                                                                        </button>
                                                                    )}
                                                                    {Number(inv.balance_due) > 0 && inv.status !== 'Cancelled' && (
                                                                        <button onClick={(e) => { e.stopPropagation(); setPayingInvoice(inv); }}
                                                                            className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100">
                                                                            Collect Payment
                                                                        </button>
                                                                    )}
                                                                    <button onClick={(e) => { e.stopPropagation(); window.open(`/api/invoice/${inv.id}/summary-bill`, '_blank'); }}
                                                                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-blue-50">
                                                                        Print Bill
                                                                    </button>
                                                                    {inv.admission_id && (
                                                                        <button onClick={(e) => { e.stopPropagation(); window.open(`/api/discharge/${inv.admission_id}/bill`, '_blank'); }}
                                                                            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-blue-50">
                                                                            Detailed Bill
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Deposits Summary */}
                                {financialProfile?.deposits?.length > 0 && (
                                    <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Deposits ({financialProfile.deposits.length})</h4>
                                        <table className="w-full text-xs">
                                            <thead className="text-[10px] uppercase text-gray-500 font-bold border-b border-gray-100">
                                                <tr>
                                                    <th className="text-left py-2">Deposit #</th>
                                                    <th className="text-left py-2">Method</th>
                                                    <th className="text-left py-2">Status</th>
                                                    <th className="text-right py-2">Amount</th>
                                                    <th className="text-right py-2">Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {financialProfile.deposits.map((d: any) => {
                                                    const bal = Number(d.amount) - Number(d.applied_amount) - Number(d.refunded_amount);
                                                    return (
                                                        <tr key={d.id} className="border-b border-gray-50">
                                                            <td className="py-2 font-mono">{d.deposit_number}</td>
                                                            <td className="py-2">{d.payment_method}</td>
                                                            <td className="py-2">
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                    d.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                                                }`}>{d.status}</span>
                                                            </td>
                                                            <td className="py-2 text-right font-bold">₹{Number(d.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                            <td className={`py-2 text-right font-bold ${bal > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>₹{bal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* External Records Tab */}
                {activeTab === 'records' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-gray-700 text-lg flex items-center gap-2">
                                <Upload className="h-5 w-5 text-violet-500" /> External Records
                            </h3>
                            <button onClick={() => setShowRecordModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition">
                                <Plus className="h-4 w-4" /> Add Record
                            </button>
                        </div>
                        {externalRecords.length === 0 ? (
                            <div className="p-8 border border-dashed border-gray-300 rounded-2xl text-center text-gray-400 text-sm">
                                No external records yet. Add records from other hospitals or previous treatments.
                            </div>
                        ) : externalRecords.map((rec: any) => (
                            <div key={rec.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <p className="font-bold text-gray-900">{rec.title}</p>
                                    {rec.hospital_name && <p className="text-xs text-gray-500 mt-0.5">{rec.hospital_name}</p>}
                                    {rec.description && <p className="text-sm text-gray-600 mt-1">{rec.description}</p>}
                                    {rec.record_date && <p className="text-xs text-gray-400 mt-1">{fmtDate(rec.record_date)}</p>}
                                    {rec.file_url && (
                                        <button onClick={async () => {
                                            const url = rec.file_url.startsWith('patient-records/')
                                                ? (await fetch(`/api/files?key=${encodeURIComponent(rec.file_url)}`).then(r => r.json())).url
                                                : rec.file_url;
                                            if (url) window.open(url, '_blank');
                                        }}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg mt-2 cursor-pointer hover:bg-violet-100 transition-colors">
                                            <ExternalLink className="h-3.5 w-3.5" /> {rec.file_name || 'View File'}
                                        </button>
                                    )}
                                </div>
                                <button onClick={async () => { await deletePatientExternalRecord(rec.id); loadData(); }}
                                    className="text-gray-300 hover:text-red-500 transition p-1">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

            {/* External Record Modal */}
            {showRecordModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900">Add External Record</h3>
                            <button onClick={() => setShowRecordModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Title *</label>
                                <input type="text" value={recordForm.title} onChange={e => setRecordForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Blood Report - Apollo Hospital"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Hospital / Clinic</label>
                                <input type="text" value={recordForm.hospital_name} onChange={e => setRecordForm(f => ({ ...f, hospital_name: e.target.value }))}
                                    placeholder="e.g. Apollo Hospital"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Date</label>
                                <DateField value={recordForm.record_date} onChange={e => setRecordForm(f => ({ ...f, record_date: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Description</label>
                                <textarea value={recordForm.description} onChange={e => setRecordForm(f => ({ ...f, description: e.target.value }))}
                                    rows={2} placeholder="Brief description..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 resize-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Upload File (Image / PDF)</label>
                                <input type="file" accept="image/*,.pdf" onChange={handleFileUpload}
                                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-50 file:text-violet-700 file:font-bold" />
                                {uploadingFile && <p className="text-xs text-violet-500 mt-1">Uploading...</p>}
                                {recordForm.file_name && <p className="text-xs text-emerald-600 mt-1">✓ {recordForm.file_name}</p>}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowRecordModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-500">Cancel</button>
                            <button onClick={handleSaveRecord} disabled={savingRecord || !recordForm.title.trim()}
                                className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                                {savingRecord ? 'Saving...' : 'Save Record'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals outside tabs, inside AppShell wrapper */}
            {showDuesModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-black text-gray-900 mb-4">Add Miscellaneous Dues</h3>
                        <form onSubmit={handleAddDues} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (₹)</label>
                                <input type="number" required min="1" value={dueForm.amount} onChange={e => setDueForm({...dueForm, amount: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50 font-mono text-lg" placeholder="e.g. 500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description / Tag</label>
                                <input type="text" required value={dueForm.description} onChange={e => setDueForm({...dueForm, description: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50" placeholder="e.g. Extra Consumables" />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setShowDuesModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                                <button type="submit" disabled={processLoading} className="flex-1 py-2 flex items-center justify-center gap-2 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors">
                                    {processLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Add Due
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {payingInvoice && (
                <CollectPaymentModal
                    invoice={payingInvoice}
                    onClose={() => setPayingInvoice(null)}
                    onSuccess={() => {
                        setPayingInvoice(null);
                        loadData();
                        loadFinancialProfile();
                    }}
                />
            )}

            {editingInvoiceId !== null && (
                <EditInvoiceModal
                    invoiceId={editingInvoiceId}
                    isOpen
                    onClose={() => setEditingInvoiceId(null)}
                    onSaved={() => {
                        setEditingInvoiceId(null);
                        loadFinancialProfile();
                    }}
                />
            )}
        </AppShell>
    );
}

// ── Collect Payment Modal (mirrors master billing) ──────────────────────
function CollectPaymentModal({ invoice, onClose, onSuccess }: {
    invoice: any; onClose: () => void; onSuccess: () => void;
}) {
    const balanceDue = Number(invoice.balance_due);
    const [amount, setAmount] = useState(balanceDue.toString());
    const [method, setMethod] = useState('Cash');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [panNumber, setPanNumber] = useState('');
    const [panName, setPanName] = useState('');
    const [thresholds, setThresholds] = useState<{ pan_threshold: number; cash_limit: number }>(CASH_COMPLIANCE_DEFAULTS);

    useEffect(() => {
        getCashComplianceConfig().then((res) => {
            if (res.success && res.data) {
                setThresholds({ pan_threshold: res.data.pan_threshold, cash_limit: res.data.cash_limit });
            }
        });
    }, []);

    const numAmount = Number(amount) || 0;
    const isValid = numAmount > 0 && numAmount <= balanceDue;
    const isCash = method === 'Cash';
    const cashBlocked = isCash && numAmount > thresholds.cash_limit;
    const panRequired = isCash && numAmount >= thresholds.pan_threshold && !cashBlocked;
    const panProvidedValid = isValidPan(panNumber) && panName.trim().length > 0;
    const canSubmit = isValid && !cashBlocked && (!panRequired || panProvidedValid);

    const fmtMoney = (n: number) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    const handleRazorpay = async () => {
        setError(null);
        setSaving(true);
        try {
            const res = await fetch('/api/razorpay/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: invoice.id }),
            });
            if (!res.ok) throw new Error(`Order creation failed (${res.status})`);
            const data = await res.json();
            const orderId = data?.data?.order_id || data?.orderId;
            const keyId = data?.data?.key_id || data?.keyId;
            const orderAmount = data?.data?.amount;
            const hospitalName = data?.data?.hospital_name || 'Hospital';

            if (!orderId || !keyId || !orderAmount) {
                throw new Error(data.error || 'Failed to create payment order.');
            }

            if (!(window as any).Razorpay) {
                const script = document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.async = true;
                document.body.appendChild(script);
                await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error('Failed to load Razorpay')); });
            }

            const options = {
                key: keyId, amount: orderAmount, currency: 'INR', name: hospitalName,
                description: `Invoice Payment (${invoice.invoice_number})`, order_id: orderId,
                handler: async (response: any) => {
                    try {
                        const verifyRes = await fetch('/api/razorpay/verify-payment', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                invoice_id: invoice.id,
                            }),
                        });
                        const verifyData = await verifyRes.json();
                        if (verifyData.success) { setSuccess(true); setTimeout(onSuccess, 1200); }
                        else setError(verifyData.error || 'Payment verification failed.');
                    } catch (err: any) { setError(err.message || 'Payment verification error.'); }
                },
                modal: { ondismiss: () => setSaving(false) },
                theme: { color: '#10b981' },
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', (response: any) => {
                setError(response?.error?.description || 'Payment could not be completed.');
                setSaving(false);
            });
            rzp.open();
        } catch (err: any) {
            setError(err.message || 'Failed to initiate online payment.');
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!isValid) return;
        if (method === 'Online') return handleRazorpay();
        if (cashBlocked || (panRequired && !panProvidedValid)) return;

        setError(null);
        setSaving(true);
        try {
            const res = await recordPayment({
                invoice_id: invoice.id,
                amount: numAmount,
                payment_method: method,
                payment_type: 'Settlement',
                payer_pan_number: isCash ? panNumber.trim().toUpperCase() : undefined,
                payer_pan_name: isCash ? panName.trim() : undefined,
                notes: [notes, reference ? `Ref: ${reference}` : ''].filter(Boolean).join(' | ') || undefined,
            });
            if (res.success) { setSuccess(true); setTimeout(onSuccess, 1200); }
            else setError(res.error || 'Payment failed.');
        } catch (err: any) { setError(err.message || 'Unexpected error'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">Collect Payment</h3>
                        <p className="text-[11px] text-gray-500 font-mono mt-0.5">{invoice.invoice_number}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {success ? (
                    <div className="px-5 py-10 text-center">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                        <p className="text-lg font-bold text-gray-800">Payment Recorded!</p>
                        <p className="text-xs text-gray-500 mt-1">₹{fmtMoney(numAmount)} via {method}</p>
                    </div>
                ) : (
                    <div className="px-5 py-5 space-y-4">
                        {/* Invoice Summary */}
                        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net</div>
                                <div className="text-sm font-bold text-gray-700">₹{fmtMoney(Number(invoice.net_amount))}</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paid</div>
                                <div className="text-sm font-bold text-emerald-600">₹{fmtMoney(Number(invoice.paid_amount))}</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Balance</div>
                                <div className="text-sm font-bold text-rose-600">₹{fmtMoney(balanceDue)}</div>
                            </div>
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Amount *</label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₹</span>
                                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                    min={1} max={balanceDue} step="0.01" autoFocus
                                    className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" />
                            </div>
                            {numAmount > balanceDue && (
                                <p className="text-[11px] text-rose-500 mt-1">Amount cannot exceed balance of ₹{fmtMoney(balanceDue)}</p>
                            )}
                            <button onClick={() => setAmount(balanceDue.toString())}
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold mt-1">
                                Pay Full Balance (₹{fmtMoney(balanceDue)})
                            </button>
                        </div>

                        {/* Payment Method */}
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Payment Method</label>
                            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                                {['Cash', 'Card', 'UPI', 'Bank', 'NEFT_RTGS', 'Cheque', 'Online'].map(m => (
                                    <button key={m} onClick={() => setMethod(m)}
                                        className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                                            method === m ? 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                        }`}>{m === 'NEFT_RTGS' ? 'NEFT/RTGS' : m}</button>
                                ))}
                            </div>
                            {method === 'Online' && (
                                <p className="text-[11px] text-blue-600 mt-1.5 font-medium">
                                    Razorpay checkout will open for card, UPI, netbanking, wallets, and more.
                                </p>
                            )}
                        </div>

                        {/* Cash compliance */}
                        {cashBlocked && (
                            <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>Cash receipts above ₹{fmtMoney(thresholds.cash_limit)} are not permitted. Use another method.</span>
                            </div>
                        )}
                        {panRequired && (
                            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                <div className="flex items-start gap-2 text-xs font-medium text-amber-800">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                                    <span>PAN details mandatory for cash payments of ₹{fmtMoney(thresholds.pan_threshold)}+.</span>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">PAN Number *</label>
                                    <input type="text" value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())}
                                        placeholder="ABCDE1234F" maxLength={10}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:border-amber-500 outline-none" />
                                    {panNumber.length > 0 && !isValidPan(panNumber) && (
                                        <p className="text-[11px] text-rose-500 mt-1">Invalid PAN format.</p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">PAN Holder Name *</label>
                                    <input type="text" value={panName} onChange={e => setPanName(e.target.value)}
                                        placeholder="As per PAN card"
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-amber-500 outline-none" />
                                </div>
                            </div>
                        )}

                        {/* Reference (non-cash, non-online) */}
                        {method !== 'Cash' && method !== 'Online' && (
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Reference / Transaction ID</label>
                                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                                    placeholder="Enter transaction reference"
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
                            </div>
                        )}

                        {/* Notes */}
                        {method !== 'Online' && (
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Notes (optional)</label>
                                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Optional remark"
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 outline-none" />
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                            <button onClick={onClose} disabled={saving}
                                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleSubmit} disabled={saving || !canSubmit}
                                className="flex-[2] flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                {saving ? 'Processing…' : method === 'Online' ? `Pay ₹${fmtMoney(numAmount)} Online` : `Record ₹${fmtMoney(numAmount)}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
