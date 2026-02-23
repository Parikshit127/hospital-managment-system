'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
    ClipboardList, UserPlus, ArrowRight, CheckCircle, Phone, Activity,
    LogOut, HeartPulse, User, MapPin, Shield, Calendar, Hash, Loader2
} from 'lucide-react';
import { registerPatient } from '@/app/actions/register-patient';

export default function ReceptionPage() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successData, setSuccessData] = useState<{ patient_id: string; appointment_id?: string; user_type?: string } | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const result = await registerPatient(formData);

        if (result.success) {
            setSuccessData({
                patient_id: result.patient_id!,
                appointment_id: result.appointment_id,
                user_type: result.user_type
            });
            (event.target as HTMLFormElement).reset();
        } else {
            alert('Error: ' + result.error);
        }
        setIsSubmitting(false);
    }

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans relative overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-teal-500/3 to-violet-500/3 rounded-full blur-3xl" />
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />
            </div>

            {/* Header */}
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[1200px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-teal-400 to-emerald-600 p-2 rounded-xl shadow-lg shadow-teal-500/20">
                                <HeartPulse className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                                Avani Hospital OS
                            </h1>
                            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-[0.2em]">
                                Reception Desk
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-2 text-xs text-white/30 font-medium">
                            <Shield className="h-3.5 w-3.5" />
                            <span>Receptionist Portal</span>
                        </div>
                        <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut className="h-3.5 w-3.5" /> Logout
                        </Link>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-[1200px] mx-auto px-6 py-8">
                {/* Page Title */}
                <div className="mb-8">
                    <h2 className="text-3xl font-black tracking-tight">
                        Patient Registration
                    </h2>
                    <p className="text-white/40 mt-1 font-medium">
                        Register incoming OPD patients · Digital IDs generated automatically
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Left Info Panel */}
                    <div className="hidden lg:flex flex-col gap-6">
                        {/* Quick Stats Card */}
                        <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                    <Activity className="h-3.5 w-3.5 text-teal-400" />
                                </div>
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Quick Info</span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-teal-500/10 rounded-lg flex items-center justify-center group-hover:bg-teal-500/20 transition-all">
                                        <ClipboardList className="h-4 w-4 text-teal-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white/50">Digital Records</p>
                                        <p className="text-[10px] text-white/25 font-medium">Auto-generated patient IDs</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-violet-500/10 rounded-lg flex items-center justify-center group-hover:bg-violet-500/20 transition-all">
                                        <Activity className="h-4 w-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white/50">Vitals Tracking</p>
                                        <p className="text-[10px] text-white/25 font-medium">Linked to EHR system</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 group">
                                    <div className="h-8 w-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-all">
                                        <Calendar className="h-4 w-4 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white/50">Auto Scheduling</p>
                                        <p className="text-[10px] text-white/25 font-medium">Appointment slots assigned</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Department Legend */}
                        <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                    <Hash className="h-3.5 w-3.5 text-violet-400" />
                                </div>
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Departments</span>
                            </div>
                            <div className="space-y-2">
                                {['General', 'Cardiology', 'Orthopedics', 'Pediatrics'].map((dept, i) => {
                                    const colors = ['teal', 'violet', 'amber', 'rose'];
                                    return (
                                        <div key={dept} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                            <div className={`h-2 w-2 rounded-full bg-${colors[i]}-400`} />
                                            <span className="text-xs font-bold text-white/50">{dept}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Main Form Area */}
                    <div className="lg:col-span-3">
                        <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden relative">
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
                                    <h3 className="text-3xl font-black text-white mb-2">Registration Complete</h3>
                                    <p className="text-white/40 text-sm font-medium mb-8">Patient has been added to the system</p>

                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 w-full max-w-sm backdrop-blur-sm">
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Patient ID</p>
                                        <p className="text-4xl font-black text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text tracking-tight font-mono">
                                            {successData.patient_id}
                                        </p>
                                        {successData.appointment_id && (
                                            <div className="mt-4 pt-4 border-t border-white/5">
                                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.15em] mb-1">Appointment</p>
                                                <p className="text-sm font-bold text-teal-400 font-mono">{successData.appointment_id}</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setSuccessData(null)}
                                        className="mt-8 px-8 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] flex items-center gap-2"
                                    >
                                        <UserPlus className="h-4 w-4" /> Register Next Patient
                                    </button>
                                </div>
                            ) : (
                                /* Registration Form */
                                <form onSubmit={handleSubmit} className="p-8">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="p-2 bg-teal-500/10 rounded-xl">
                                            <UserPlus className="h-5 w-5 text-teal-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white/90">Patient Details</h3>
                                            <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Fill in patient information below</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                                        {/* Full Name */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Full Name</label>
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                                <input
                                                    name="full_name"
                                                    required
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                                    placeholder="e.g. John Doe"
                                                />
                                            </div>
                                        </div>

                                        {/* Phone */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Phone</label>
                                            <div className="relative">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                                <input
                                                    name="phone"
                                                    required
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                                    placeholder="Mobile"
                                                />
                                            </div>
                                        </div>

                                        {/* Age */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Age</label>
                                            <input
                                                name="age"
                                                type="number"
                                                min="0"
                                                required
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all text-center"
                                                placeholder="Yrs"
                                            />
                                        </div>

                                        {/* Gender */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Gender</label>
                                            <select
                                                name="gender"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-bold focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all appearance-none"
                                            >
                                                <option className="bg-[#131A2E]">Male</option>
                                                <option className="bg-[#131A2E]">Female</option>
                                                <option className="bg-[#131A2E]">Other</option>
                                            </select>
                                        </div>

                                        {/* Department */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Department</label>
                                            <select
                                                name="department"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-bold focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all appearance-none"
                                            >
                                                <option className="bg-[#131A2E]">General</option>
                                                <option className="bg-[#131A2E]">Cardiology</option>
                                                <option className="bg-[#131A2E]">Orthopedics</option>
                                                <option className="bg-[#131A2E]">Pediatrics</option>
                                            </select>
                                        </div>

                                        {/* Aadhaar */}
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Aadhaar (Optional)</label>
                                            <div className="relative">
                                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                                <input
                                                    name="aadhar"
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all tracking-wider font-mono"
                                                    placeholder="xxxx-xxxx-xxxx"
                                                    maxLength={14}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1-');
                                                        e.target.value = val;
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Address */}
                                        <div className="md:col-span-4 space-y-1.5">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Address</label>
                                            <div className="relative">
                                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                                <input
                                                    name="address"
                                                    required
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white font-bold placeholder:text-white/15 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                                    placeholder="House No, Street, City..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-6 border-t border-white/5">
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
            </main>

            {/* Footer */}
            <footer className="relative z-10 mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1200px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">
                        Avani Hospital OS · Reception Module · v2.0
                    </p>
                    <p className="text-[10px] font-medium text-white/15">
                        🔒 Encrypted · HIPAA-compliant
                    </p>
                </div>
            </footer>
        </div>
    );
}
