'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { UserCircle, Phone, MapPin, Mail, ShieldCheck, CreditCard } from 'lucide-react';
import { getPatientDashboardData } from '@/app/actions/patient-actions';

export default function ProfilePage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientDashboardData();
        if (res.success) setData(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <AppShell pageTitle="Loading"><div className="p-10 text-center text-gray-500 font-medium">Loading profile...</div></AppShell>;
    if (!data) return <AppShell pageTitle="Error"><div className="p-10 text-center text-red-500 font-bold">Failed to load profile.</div></AppShell>;

    const p = data.patient;

    return (
        <AppShell
            pageTitle="My Profile"
            pageIcon={<UserCircle className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="max-w-4xl mx-auto space-y-6">

                {/* ID Card Header */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                    <div className="absolute -top-24 -right-24 h-64 w-64 bg-white/5 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-24 -left-24 h-64 w-64 bg-indigo-500/20 rounded-full blur-3xl"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
                        <div className="w-32 h-32 bg-white/10 backdrop-blur-md border-[3px] border-white/20 rounded-full flex items-center justify-center shrink-0 shadow-inner">
                            <UserCircle className="h-16 w-16 text-white/80" />
                        </div>
                        <div className="text-center md:text-left flex-1">
                            <h1 className="text-3xl font-black mb-1">{p.full_name}</h1>
                            <p className="text-indigo-200 font-medium tracking-widest uppercase text-sm mb-6 flex items-center justify-center md:justify-start gap-2">
                                <ShieldCheck className="h-4 w-4" /> Verified Patient Account
                            </p>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                                <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Patient ID</p>
                                    <p className="text-white font-black font-mono text-sm">{p.patient_id}</p>
                                </div>
                                <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Age & Gender</p>
                                    <p className="text-white font-bold text-sm">{p.age} yrs • {p.gender}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 line-clamp-2">
                        <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4"><UserCircle className="h-5 w-5 text-indigo-500" /> Personal Information</h3>

                        <div className="space-y-4">
                            <div className="flex gap-4 items-center">
                                <div className="bg-gray-50 p-2 rounded-lg text-gray-400"><Phone className="h-5 w-5" /></div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Mobile Number</p>
                                    <p className="text-sm font-bold text-gray-900">{p.phone}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 items-center">
                                <div className="bg-gray-50 p-2 rounded-lg text-gray-400"><Mail className="h-5 w-5" /></div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Email Address</p>
                                    <p className="text-sm font-bold text-gray-900">{p.email || 'Not provided'}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 items-start">
                                <div className="bg-gray-50 p-2 rounded-lg text-gray-400 mt-1"><MapPin className="h-5 w-5" /></div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Residential Address</p>
                                    <p className="text-sm font-bold text-gray-900">{p.address || 'Address information not on file. Please update at reception.'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
                        <div>
                            <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4"><CreditCard className="h-5 w-5 text-emerald-500" /> Financial & Insurance Account</h3>

                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-4">
                                <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Primary Payment Plan</p>
                                <p className="text-lg font-black text-emerald-900">Self-Pay / General</p>
                            </div>

                            <p className="text-sm text-gray-500 font-medium">To securely link an external health insurance provider (Ayushman Bharat, CGHS, Private), please visit the hospital Finance desk with your physical ID card.</p>
                        </div>
                        <button disabled className="w-full mt-6 py-3 bg-gray-100 text-gray-400 font-bold rounded-xl cursor-not-allowed">Update Profile details requires Admin</button>
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
