'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, Phone, Mail, Calendar, MapPin, Loader2, ArrowLeft, Building2, Mic } from 'lucide-react';
import { RegistrationSuccess } from '@/app/components/registration/RegistrationSuccess';

type Org = { id: string; name: string; slug: string; address: string | null };

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgSlug = searchParams.get('org') || '';

    const [orgs, setOrgs] = useState<Org[]>([]);
    const [selectedOrg, setSelectedOrg] = useState(orgSlug);
    const [loading, setLoading] = useState(false);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [success, setSuccess] = useState<{ patient_id: string; password?: string; setup_link: string | null } | null>(null);
    const [error, setError] = useState('');
    const [showManualForm, setShowManualForm] = useState(false);

    const [form, setForm] = useState({
        full_name: '', phone: '', email: '', age: '', gender: 'Male',
        date_of_birth: '', address: '', blood_group: '',
        emergency_contact_name: '', emergency_contact_phone: '',
    });

    useEffect(() => {
        fetch('/api/public/organizations')
            .then(r => r.json())
            .then(d => { setOrgs(d.orgs || []); setOrgsLoading(false); })
            .catch(() => setOrgsLoading(false));
    }, []);

    // Pre-select org from URL param when orgs load
    useEffect(() => {
        if (orgSlug && orgs.length > 0) setSelectedOrg(orgSlug);
    }, [orgSlug, orgs]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrg) { setError('Please select a hospital/clinic'); return; }
        if (!form.full_name.trim()) { setError('Full name is required'); return; }
        const phone = form.phone.replace(/[\s\-+]/g, '').slice(-10);
        if (!/^[6-9]\d{9}$/.test(phone)) { setError('Enter a valid 10-digit Indian mobile number (starting with 6-9)'); return; }

        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/patient/self-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, phone, org_slug: selectedOrg }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccess({ patient_id: data.patient_id, password: data.password, setup_link: data.setup_link });
            } else {
                setError(data.error || 'Registration failed. Please try again.');
            }
        } catch {
            setError('Something went wrong. Please try again.');
        }
        setLoading(false);
    };

    if (success) {
        return (
            <RegistrationSuccess
                patientId={success.patient_id}
                password={success.password}
                redirectTo="/patient/appointments/choose-method"
                ctaLabel="Continue"
            />
        );
    }

    const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white";
    const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-10 px-4">
            <div className="max-w-2xl mx-auto">
                <Link href="/patient/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to Login
                </Link>

                {/* ─── Entry Choice: Manual vs Voice ─── */}
                {!showManualForm && (
                    <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-6">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-8 py-8 text-white text-center">
                            <h1 className="text-2xl font-black">Create Patient Account</h1>
                            <p className="text-emerald-100 text-sm mt-1">Choose how you would like to register</p>
                        </div>
                        <div className="p-8 space-y-4">
                            <button
                                onClick={() => setShowManualForm(true)}
                                className="w-full py-5 px-6 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all flex items-center gap-4 group text-left"
                            >
                                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                                    <User className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800 group-hover:text-emerald-700 text-lg block">Fill Manually</span>
                                    <p className="text-sm text-gray-500">Type your details into the registration form</p>
                                </div>
                            </button>
                            <button
                                onClick={() => router.push('/patient/register/voice')}
                                className="w-full py-5 px-6 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all flex items-center gap-4 group text-left"
                            >
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                    <Mic className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800 group-hover:text-emerald-700 text-lg block">Register with AI Voice Assistant</span>
                                    <p className="text-sm text-gray-500">Speak your details — the assistant fills the form for you</p>
                                </div>
                            </button>
                            <p className="text-center text-sm text-gray-500 pt-2">
                                Already have an account?{' '}
                                <Link href="/patient/login" className="text-emerald-600 font-bold hover:underline">
                                    Sign In
                                </Link>
                            </p>
                        </div>
                    </div>
                )}

                {/* ─── Manual Registration Form (unchanged) ─── */}
                {showManualForm && (
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-8 py-8 text-white">
                        <h1 className="text-2xl font-black">Create Patient Account</h1>
                        <p className="text-emerald-100 text-sm mt-1">Register to access your health portal</p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-5">
                        {/* Hospital Selection */}
                        <div>
                            <label className={labelCls}>Select Hospital / Clinic *</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                <select
                                    value={selectedOrg}
                                    onChange={e => setSelectedOrg(e.target.value)}
                                    className={`${inputCls} pl-10`}
                                    required
                                >
                                    <option value="">{orgsLoading ? 'Loading hospitals...' : '-- Select Organisation --'}</option>
                                    {orgs.map(o => (
                                        <option key={o.id} value={o.slug}>
                                            {o.name}{o.address ? ` — ${o.address}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Full Name */}
                            <div className="sm:col-span-2">
                                <label className={labelCls}>Full Name *</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                    <input
                                        required
                                        value={form.full_name}
                                        onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                                        placeholder="Enter your full name"
                                        className={`${inputCls} pl-10`}
                                    />
                                </div>
                            </div>

                            {/* Phone */}
                            <div>
                                <label className={labelCls}>Phone Number *</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                    <input
                                        required
                                        value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                        placeholder="10-digit mobile number"
                                        className={`${inputCls} pl-10`}
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className={labelCls}>Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                        placeholder="your@email.com"
                                        className={`${inputCls} pl-10`}
                                    />
                                </div>
                            </div>

                            {/* Date of Birth */}
                            <div>
                                <label className={labelCls}>Date of Birth</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                    <DateField
                                        value={form.date_of_birth}
                                        onChange={e => {
                                            const dob = e.target.value;
                                            const age = dob ? String(Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))) : '';
                                            setForm(f => ({ ...f, date_of_birth: dob, age }));
                                        }}
                                        className={`${inputCls} pl-10`}
                                    />
                                </div>
                            </div>

                            {/* Age */}
                            <div>
                                <label className={labelCls}>Age</label>
                                <input
                                    value={form.age}
                                    onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                                    placeholder="Age in years"
                                    type="number" min="0" max="120"
                                    className={inputCls}
                                />
                            </div>

                            {/* Gender */}
                            <div>
                                <label className={labelCls}>Gender *</label>
                                <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={inputCls}>
                                    <option>Male</option>
                                    <option>Female</option>
                                    <option>Other</option>
                                </select>
                            </div>

                            {/* Blood Group */}
                            <div>
                                <label className={labelCls}>Blood Group</label>
                                <select value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} className={inputCls}>
                                    <option value="">Select</option>
                                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg}>{bg}</option>)}
                                </select>
                            </div>

                            {/* Address */}
                            <div className="sm:col-span-2">
                                <label className={labelCls}>Address</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                                    <input
                                        value={form.address}
                                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                        placeholder="Your address"
                                        className={`${inputCls} pl-10`}
                                    />
                                </div>
                            </div>

                            {/* Emergency Contact */}
                            <div>
                                <label className={labelCls}>Emergency Contact Name</label>
                                <input
                                    value={form.emergency_contact_name}
                                    onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
                                    placeholder="Contact person name"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Emergency Contact Phone</label>
                                <input
                                    value={form.emergency_contact_phone}
                                    onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
                                    placeholder="Emergency phone"
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-xl hover:from-emerald-600 hover:to-teal-700 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account...</>
                                : 'Create My Account →'
                            }
                        </button>

                        <p className="text-center text-sm text-gray-500">
                            Already have an account?{' '}
                            <Link href="/patient/login" className="text-emerald-600 font-bold hover:underline">
                                Sign In
                            </Link>
                        </p>
                    </form>
                </div>
                )}
            </div>
        </div>
    );
}

export default function PatientRegisterPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        }>
            <RegisterForm />
        </Suspense>
    );
}
