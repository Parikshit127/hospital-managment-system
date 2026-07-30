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

    // text-base (16px) on mobile avoids iOS Safari's auto-zoom-on-focus for small inputs.
    const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white";
    const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-6 sm:py-10 px-4 pb-28">
            <div className="max-w-2xl mx-auto">
                <Link href="/patient/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 sm:mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to Login
                </Link>

                <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 sm:px-8 py-6 sm:py-8 text-white">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-black">Create Patient Account</h1>
                                <p className="text-emerald-100 text-sm mt-1">Register to access your health portal</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => router.push('/patient/register/voice')}
                                className="shrink-0 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3.5 py-2 text-xs font-bold min-h-[36px]"
                                title="Register by speaking instead"
                            >
                                <Mic className="w-4 h-4" /> Use Voice
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
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
            </div>

            {/* Floating voice-entry button — reachable from anywhere on the form */}
            <button
                type="button"
                onClick={() => router.push('/patient/register/voice')}
                className="fixed bottom-6 right-4 sm:right-6 z-20 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-xl shadow-blue-900/20 px-5 py-4 min-h-[56px] transition-colors"
                title="Register by speaking instead"
            >
                <Mic className="w-5 h-5" />
                <span className="text-sm">Register with Voice</span>
            </button>
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
