'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
    ClipboardList, UserPlus, CheckCircle, Phone, Activity,
    User, MapPin, Shield, Calendar, Hash, Loader2, Mail,
    Search, AlertCircle, Heart, Users, ArrowRight, FileCheck,
    Building2, CreditCard, FileText
} from 'lucide-react';
import { registerPatient, checkDuplicatePatient } from '@/app/actions/register-patient';
import { getDepartmentList } from '@/app/actions/reception-actions';
import { getCorporateMasters, getTpaProviders } from '@/app/actions/patient-type-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { FALLBACK_DEPARTMENTS } from '@/app/lib/constants/departments';
import { useRouter } from 'next/navigation';

type DuplicatePatient = {
    patient_id: string;
    full_name: string;
    phone: string | null;
    age: string | null;
    gender: string | null;
    department: string | null;
    date_of_birth: string | null;
    created_at: Date;
    patient_type?: string | null;
};

const PATIENT_TYPE_BADGE: Record<string, string> = {
    cash: 'bg-teal-100 text-teal-700',
    corporate: 'bg-blue-100 text-blue-700',
    tpa_insurance: 'bg-amber-100 text-amber-700',
};
const PATIENT_TYPE_LABEL: Record<string, string> = {
    cash: 'Cash',
    corporate: 'Corporate',
    tpa_insurance: 'TPA',
};

type DepartmentItem = {
    id: string;
    name: string;
};

type CorporateItem = {
    id: string;
    company_name: string;
    company_code: string;
    discount_percentage: string | number;
};

type TpaProviderItem = {
    id: number;
    provider_name: string;
    provider_code: string;
    pre_auth_required: boolean;
    default_discount_percentage: string | number;
};

const PATIENT_TYPES = [
    { value: 'cash', label: 'Cash', color: 'teal' },
    { value: 'corporate', label: 'Corporate', color: 'blue' },
    { value: 'tpa_insurance', label: 'TPA / Insurance', color: 'amber' },
] as const;

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'] as const;

function calculateAge(dob: string): string {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return String(Math.max(0, age));
}

export default function ReceptionPage() {
    const toast = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [departments, setDepartments] = useState<DepartmentItem[]>([]);
    const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
    const [dobValue, setDobValue] = useState('');
    const [ageValue, setAgeValue] = useState('');
    // Phase 1 — Patient Type
    const [patientType, setPatientType] = useState<'cash' | 'corporate' | 'tpa_insurance'>('cash');
    const [corporates, setCorporates] = useState<CorporateItem[]>([]);
    const [tpaProviders, setTpaProviders] = useState<TpaProviderItem[]>([]);
    const [selectedCorporate, setSelectedCorporate] = useState<CorporateItem | null>(null);
    const [successData, setSuccessData] = useState<{
        patient_id: string;
        appointment_id?: string;
        user_type?: string;
        password_setup_required?: boolean;
        manual_password_setup_link?: string | null;
    } | null>(null);

    // Load departments, corporates, TPA providers on mount
    useEffect(() => {
        getDepartmentList().then(result => {
            if (result.success && result.data && result.data.length > 0) {
                setDepartments(result.data.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
            } else {
                setDepartments(FALLBACK_DEPARTMENTS.map(name => ({ id: name, name })));
            }
        });
        getCorporateMasters().then(r => {
            if (r.success) setCorporates(r.data as CorporateItem[]);
        });
        getTpaProviders().then(r => {
            if (r.success) setTpaProviders(r.data as TpaProviderItem[]);
        });
    }, []);

    // Duplicate detection on phone blur
    const handlePhoneBlur = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
        const phone = e.target.value.replace(/[\s\-+]/g, '');
        if (phone.length < 10) {
            setDuplicates([]);
            setShowDuplicateWarning(false);
            return;
        }

        setIsCheckingDuplicate(true);
        const result = await checkDuplicatePatient(phone);
        setIsCheckingDuplicate(false);

        if (result.success && result.data.length > 0) {
            setDuplicates(result.data);
            setShowDuplicateWarning(true);
        } else {
            setDuplicates([]);
            setShowDuplicateWarning(false);
        }
    }, []);

    // DOB → Age auto-calc
    const handleDobChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const dob = e.target.value;
        setDobValue(dob);
        setAgeValue(calculateAge(dob));
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const result = await registerPatient(formData);

        if (result.success) {
            setSuccessData({
                patient_id: result.patient_id!,
                appointment_id: result.appointment_id ?? undefined,
                user_type: result.user_type,
                password_setup_required: result.password_setup_required,
                manual_password_setup_link: result.manual_password_setup_link,
            });
            setDuplicates([]);
            setShowDuplicateWarning(false);
            (event.target as HTMLFormElement).reset();
            setDobValue('');
            setAgeValue('');
            setPatientType('cash');
            setSelectedCorporate(null);
        } else {
            toast.error(result.error || 'Registration failed');
        }
        setIsSubmitting(false);
    }

    const inputClass = "w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all";
    const inputWithIconClass = `${inputClass} pl-11`;
    const labelClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1";
    const selectClass = `${inputClass} appearance-none`;

    return (
        <AppShell pageTitle="Patient Registration" pageIcon={<UserPlus className="h-5 w-5" />}>

            <div className="max-w-[1200px] mx-auto">
                {/* Page Title */}
                <div className="mb-8">
                    <h2 className="text-3xl font-black tracking-tight text-gray-900">
                        Patient Registration
                    </h2>
                    <p className="text-gray-500 mt-1 font-medium">
                        Register incoming OPD patients · Digital IDs generated automatically
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Left Info Panel */}
                    <div className="hidden lg:flex flex-col gap-6">
                        {/* Quick Stats Card */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                    <Activity className="h-3.5 w-3.5 text-teal-400" />
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Quick Info</span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-teal-500/10 rounded-lg flex items-center justify-center group-hover:bg-teal-500/20 transition-all">
                                        <ClipboardList className="h-4 w-4 text-teal-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500">Digital Records</p>
                                        <p className="text-[10px] text-gray-400 font-medium">Auto-generated patient IDs</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-violet-500/10 rounded-lg flex items-center justify-center group-hover:bg-violet-500/20 transition-all">
                                        <Search className="h-4 w-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500">Duplicate Detection</p>
                                        <p className="text-[10px] text-gray-400 font-medium">Auto-checks existing patients</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-all">
                                        <Calendar className="h-4 w-4 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500">Auto Scheduling</p>
                                        <p className="text-[10px] text-gray-400 font-medium">Appointment slots assigned</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Departments Legend */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                    <Hash className="h-3.5 w-3.5 text-violet-400" />
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Departments</span>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {departments.slice(0, 8).map((dept) => (
                                    <div key={dept.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                                        <div className="h-2 w-2 rounded-full bg-teal-400" />
                                        <span className="text-xs font-bold text-gray-500">{dept.name}</span>
                                    </div>
                                ))}
                                {departments.length > 8 && (
                                    <p className="text-[10px] text-gray-400 font-medium ml-3">+{departments.length - 8} more</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Form Area */}
                    <div className="lg:col-span-3">
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden relative">
                            {/* Gradient top border */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

                            {successData ? (
                                /* Success State */
                                <div className="p-12 flex flex-col items-center justify-center text-center min-h-[500px]">
                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                                        <div className="relative h-24 w-24 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                                            <CheckCircle className="h-12 w-12 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 mb-2">Registration Complete</h3>
                                    <p className="text-gray-500 text-sm font-medium mb-8">Patient has been added to the system</p>

                                    <div className="bg-gray-100 border border-gray-200 rounded-2xl p-8 w-full max-w-sm">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Patient ID</p>
                                        <p className="text-4xl font-black text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text tracking-tight font-mono">
                                            {successData.patient_id}
                                        </p>
                                        {successData.appointment_id && (
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.15em] mb-1">Appointment</p>
                                                <p className="text-sm font-bold text-teal-400 font-mono">{successData.appointment_id}</p>
                                            </div>
                                        )}
                                        {successData.password_setup_required && (
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <p className="text-[10px] font-black text-pink-400 uppercase tracking-[0.15em] mb-1">Portal Access Setup</p>
                                                <p className="text-xs font-bold text-pink-600">Password setup link has been issued</p>
                                                {successData.manual_password_setup_link ? (
                                                    <p className="text-[10px] mt-2 break-all text-gray-500 font-mono">{successData.manual_password_setup_link}</p>
                                                ) : (
                                                    <p className="text-[10px] mt-2 text-gray-500">Link sent to patient email</p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-8 flex items-center gap-3">
                                        <button
                                            onClick={() => setSuccessData(null)}
                                            className="px-6 py-3.5 bg-gray-100 border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98] flex items-center gap-2"
                                        >
                                            <UserPlus className="h-4 w-4" /> Register Next
                                        </button>
                                        <button
                                            onClick={() => router.push('/reception/appointments')}
                                            className="px-6 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] flex items-center gap-2"
                                        >
                                            <ArrowRight className="h-4 w-4" /> Book Appointment
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Registration Form */
                                <form onSubmit={handleSubmit} className="p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-teal-500/10 rounded-xl">
                                            <UserPlus className="h-5 w-5 text-teal-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-gray-700">Patient Details</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fill in patient information below</p>
                                        </div>
                                    </div>

                                    {/* Duplicate Warning */}
                                    {showDuplicateWarning && duplicates.length > 0 && (
                                        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                                <span className="text-sm font-bold text-amber-700">
                                                    Possible duplicate{duplicates.length > 1 ? 's' : ''} found
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {duplicates.map((p) => (
                                                    <div key={p.patient_id} className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-4 py-3">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-bold text-gray-800">{p.full_name}</p>
                                                                {p.patient_type && (
                                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${PATIENT_TYPE_BADGE[p.patient_type] || 'bg-gray-100 text-gray-600'}`}>
                                                                        {PATIENT_TYPE_LABEL[p.patient_type] || p.patient_type}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500">
                                                                {p.patient_id} · {p.phone} · {p.age ? `${p.age}y` : ''} {p.gender || ''} · {p.department || 'No dept'}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => router.push(`/reception/patient/${p.patient_id}`)}
                                                            className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                                                        >
                                                            Use Existing
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowDuplicateWarning(false)}
                                                className="mt-3 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                            >
                                                Dismiss · Register as new patient
                                            </button>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                                        {/* Full Name */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Full Name *</label>
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="full_name"
                                                    required
                                                    className={inputWithIconClass}
                                                    placeholder="e.g. Rahul Kumar"
                                                />
                                            </div>
                                        </div>

                                        {/* Phone with +91 prefix */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>
                                                Phone *
                                                {isCheckingDuplicate && <span className="ml-2 text-teal-400 normal-case">checking...</span>}
                                            </label>
                                            <div className="relative flex">
                                                <span className="inline-flex items-center px-3 py-3.5 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl text-sm font-bold text-gray-500">
                                                    +91
                                                </span>
                                                <div className="relative flex-1">
                                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                    <input
                                                        name="phone"
                                                        required
                                                        maxLength={10}
                                                        onBlur={handlePhoneBlur}
                                                        className="w-full bg-white border border-gray-300 rounded-r-xl pl-10 pr-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                                        placeholder="10-digit mobile"
                                                        onChange={(e) => {
                                                            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Date of Birth */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Date of Birth</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="date_of_birth"
                                                    type="date"
                                                    value={dobValue}
                                                    max={new Date().toISOString().split('T')[0]}
                                                    onChange={handleDobChange}
                                                    className={inputWithIconClass}
                                                />
                                            </div>
                                        </div>

                                        {/* Age (auto-calc from DOB or manual) */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Age *</label>
                                            <input
                                                name="age"
                                                type="number"
                                                min="0"
                                                max="120"
                                                required
                                                value={ageValue}
                                                onChange={(e) => setAgeValue(e.target.value)}
                                                className={`${inputClass} text-center`}
                                                placeholder="Yrs"
                                            />
                                        </div>

                                        {/* Gender */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Gender *</label>
                                            <select name="gender" className={selectClass}>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>

                                        {/* Blood Group */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Blood Group</label>
                                            <div className="relative">
                                                <Heart className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <select name="blood_group" className={`${selectClass} pl-11`}>
                                                    <option value="">Select</option>
                                                    {BLOOD_GROUPS.map(bg => (
                                                        <option key={bg} value={bg}>{bg}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Department from DB */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Department *</label>
                                            <select name="department" required className={selectClass}>
                                                <option value="">Select Department</option>
                                                {departments.map(dept => (
                                                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Aadhaar */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Aadhaar (Optional)</label>
                                            <div className="relative">
                                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="aadhar"
                                                    className={`${inputWithIconClass} tracking-wider font-mono`}
                                                    placeholder="xxxx-xxxx-xxxx"
                                                    maxLength={14}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1-');
                                                        e.target.value = val;
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Email */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Email (Optional)</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                <input
                                                    name="email"
                                                    type="email"
                                                    className={inputWithIconClass}
                                                    placeholder="patient@example.com"
                                                />
                                            </div>
                                        </div>

                                        {/* Address textarea */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className={labelClass}>Address *</label>
                                            <div className="relative">
                                                <MapPin className="absolute left-4 top-4 h-4 w-4 text-gray-300" />
                                                <textarea
                                                    name="address"
                                                    required
                                                    rows={3}
                                                    className="w-full bg-white border border-gray-300 rounded-xl pl-11 pr-4 py-3.5 text-sm text-gray-900 font-bold placeholder:text-gray-400 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all resize-none"
                                                    placeholder="House No, Street, City, State, PIN..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Emergency Contact Section */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Users className="h-4 w-4 text-rose-400" />
                                            <span className="text-xs font-black text-gray-500">Emergency Contact (Optional)</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Contact Name</label>
                                                <input
                                                    name="emergency_contact_name"
                                                    className={inputClass}
                                                    placeholder="Full name"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Contact Phone</label>
                                                <input
                                                    name="emergency_contact_phone"
                                                    className={inputClass}
                                                    placeholder="10-digit mobile"
                                                    maxLength={10}
                                                    onChange={(e) => {
                                                        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Relationship</label>
                                                <select name="emergency_contact_relation" className={selectClass}>
                                                    <option value="">Select</option>
                                                    {RELATIONSHIPS.map(rel => (
                                                        <option key={rel} value={rel}>{rel}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Patient Type Classification */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <CreditCard className="h-4 w-4 text-violet-400" />
                                            <span className="text-xs font-black text-gray-500">Patient Type *</span>
                                        </div>
                                        <input type="hidden" name="patient_type" value={patientType} />
                                        <div className="flex gap-3 flex-wrap mb-4">
                                            {PATIENT_TYPES.map(pt => (
                                                <button
                                                    key={pt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setPatientType(pt.value);
                                                        setSelectedCorporate(null);
                                                    }}
                                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                                        patientType === pt.value
                                                            ? pt.value === 'cash'
                                                                ? 'bg-teal-500 border-teal-500 text-white shadow-md'
                                                                : pt.value === 'corporate'
                                                                    ? 'bg-blue-500 border-blue-500 text-white shadow-md'
                                                                    : 'bg-amber-500 border-amber-500 text-white shadow-md'
                                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {pt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Corporate Fields */}
                                        {patientType === 'corporate' && (
                                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Building2 className="h-3.5 w-3.5 text-blue-500" />
                                                    <span className="text-xs font-bold text-blue-700">Corporate Details</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>Company *</label>
                                                        <select
                                                            name="corporate_id"
                                                            required={patientType === 'corporate'}
                                                            className={selectClass}
                                                            onChange={e => {
                                                                const corp = corporates.find(c => c.id === e.target.value) || null;
                                                                setSelectedCorporate(corp);
                                                            }}
                                                        >
                                                            <option value="">Select Company</option>
                                                            {corporates.map(c => (
                                                                <option key={c.id} value={c.id}>{c.company_name} ({c.company_code})</option>
                                                            ))}
                                                        </select>
                                                        {selectedCorporate && (
                                                            <p className="text-[10px] text-blue-600 font-bold ml-1">
                                                                Discount: {Number(selectedCorporate.discount_percentage)}%
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>Employee ID</label>
                                                        <input name="employee_id" className={inputClass} placeholder="EMP-001" />
                                                    </div>
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className={labelClass}>Corporate Card Number (Optional)</label>
                                                        <input name="corporate_card_number" className={inputClass} placeholder="Card / ID number" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* TPA / Insurance Fields */}
                                        {patientType === 'tpa_insurance' && (
                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                                                    <span className="text-xs font-bold text-amber-700">TPA / Insurance Details</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>TPA / Insurance Company *</label>
                                                        <select
                                                            name="tpa_provider_id"
                                                            required={patientType === 'tpa_insurance'}
                                                            className={selectClass}
                                                        >
                                                            <option value="">Select Provider</option>
                                                            {tpaProviders.map(p => (
                                                                <option key={p.id} value={p.id}>
                                                                    {p.provider_name} ({p.provider_code})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>Policy Number *</label>
                                                        <input
                                                            name="insurance_policy_number"
                                                            required={patientType === 'tpa_insurance'}
                                                            className={inputClass}
                                                            placeholder="Policy / Member ID"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>Validity Start</label>
                                                        <input type="date" name="insurance_validity_start" className={inputClass} />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className={labelClass}>Validity End</label>
                                                        <input type="date" name="insurance_validity_end" className={inputClass} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Consent */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                name="registration_consent"
                                                required
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500/20"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors flex items-center gap-1.5">
                                                    <FileCheck className="h-3.5 w-3.5 text-teal-400" />
                                                    Registration Consent *
                                                </span>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    I confirm the patient has given consent for registration and data collection as per hospital policy.
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Skip Appointment Option */}
                                    <div className="mb-6 border-t border-gray-200 pt-6">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                name="skipAppointment"
                                                value="true"
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-amber-400" />
                                                    Register only (skip appointment)
                                                </span>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    Check this to register the patient without creating an appointment. You can book an appointment later.
                                                </p>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="flex justify-end pt-6 border-t border-gray-200">
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="px-8 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {isSubmitting ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                                            ) : (
                                                <><UserPlus className="h-4 w-4" /> Register Patient</>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>

        </AppShell>
    );
}
