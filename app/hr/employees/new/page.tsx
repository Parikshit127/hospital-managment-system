'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/layout/AppShell';
import { UserPlus, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createEmployee } from '@/app/actions/hr-actions';

export default function NewEmployeePage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        name: '', designation: '', departmentId: '',
        dateOfJoining: new Date().toISOString().split('T')[0],
        salaryBasic: '', phone: '', email: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.designation.trim() || !form.dateOfJoining) {
            setError('Name, Designation, and Date of Joining are required.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await createEmployee({
                name: form.name.trim(),
                designation: form.designation.trim(),
                departmentId: form.departmentId || undefined,
                dateOfJoining: form.dateOfJoining,
                salaryBasic: form.salaryBasic ? parseFloat(form.salaryBasic) : undefined,
                phone: form.phone || undefined,
                email: form.email || undefined,
            });
            if (res.success) {
                router.push('/hr/employees');
            } else {
                setError(res.error || 'Failed to create employee');
            }
        } catch (e) {
            setError('An unexpected error occurred');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppShell pageTitle="Add New Employee" pageIcon={<UserPlus className="h-5 w-5" />}
            headerActions={
                <Link href="/hr/employees" className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
            }>
            <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-5">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">{error}</div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Name *</label>
                            <input type="text" required value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="Full name" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Designation *</label>
                            <input type="text" required value={form.designation}
                                onChange={e => setForm({ ...form, designation: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="e.g. Nurse, Technician" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Department ID</label>
                            <input type="text" value={form.departmentId}
                                onChange={e => setForm({ ...form, departmentId: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="Optional" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Date of Joining *</label>
                            <input type="date" required value={form.dateOfJoining}
                                onChange={e => setForm({ ...form, dateOfJoining: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Basic Salary</label>
                            <input type="number" value={form.salaryBasic}
                                onChange={e => setForm({ ...form, salaryBasic: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="0" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Phone</label>
                            <input type="tel" value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="Optional" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Email</label>
                            <input type="email" value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                                placeholder="Optional" />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            Create Employee
                        </button>
                    </div>
                </form>
            </div>
        </AppShell>
    );
}
