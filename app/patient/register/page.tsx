'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, Phone, Mail, Calendar, MapPin, Loader2, CheckCircle, ArrowLeft, Building2 } from 'lucide-react';

type Org = { id: string; name: string; slug: string; address: string | null };

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgSlug = searchParams.get('org') || '';

    const [orgs, setOrgs] = useState<Org[]>([]);
    const [selectedOrg, setSelectedOrg] = useState(orgSlug);
    const [loading, setLoading] = useState(false);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [success, setSuccess] = useState<{ patient_id: string; setup_link: string | null } | null>(null);
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        full_name: '', phone: '', email: '', age: '', gender: 'Male',
        date_of_birth: '', address: '', blood_group: '', department: 'General',
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
                setSuccess({ patient_id: data.patient_id, setup_link: data.setup_link });
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
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center space-y-5">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900">Registration Successful!</h2>
                    <p className="text-gray-500 text-sm">Your patient account has been created.</p>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Your Patient ID</p>
                        <p className="text-3xl font-black text-emerald-700 font-mono">{success.patient_id}</p>
                        <p className="text-xs text-gray-500 mt-2">Save this ID — you will need it to log in</p>
                    </div>
                    {success.setup_link && (
                        <a href={success.setup_link}
                            className="block w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition text-sm">
                            Set Your Password →
                        </a>
                    )}
                    <Link href="/patient/login" className="block text-sm text-emerald-600 hover:underline font-medium">
                        Go to Login
                    </Link>
                </div>
            </div>
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
                                    <input
                                        type="date"
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

                            {/* Department */}
                            <div>
                                <label className={labelCls}>Department</label>
                                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={inputCls}>
                                    {['General', 'Cardiology', 'Orthopedics', 'Neurology', 'Pediatrics', 'Gynecology', 'Dermatology', 'ENT', 'Ophthalmology', 'Psychiatry', 'Oncology', 'Urology'].map(d => <option key={d}>{d}</option>)}
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
