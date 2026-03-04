'use client';

import React, { useEffect, useState } from 'react';
import { UserCircle, Phone, MapPin, Mail, ShieldCheck, CreditCard, Edit3, Save, X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getPatientDashboardData } from '@/app/actions/patient-actions';

export default function ProfilePage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ phone: '', email: '', address: '', emergency_contact_name: '', emergency_contact_phone: '' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Password change
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', newPw: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientDashboardData();
        if (res.success) {
            setData(res.data);
            const p = res.data?.patient;
            if (p) {
                setEditForm({
                    phone: p.phone || '',
                    email: p.email || '',
                    address: p.address || '',
                    emergency_contact_name: p.emergency_contact_name || '',
                    emergency_contact_phone: p.emergency_contact_phone || '',
                });
            }
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const { updatePatientProfile } = await import('../appointments/actions');
            const res = await updatePatientProfile(editForm);
            if (res.success) {
                setMessage({ type: 'success', text: 'Profile updated successfully.' });
                setIsEditing(false);
                loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to update.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to update profile.' });
        }
        setSaving(false);
    };

    const handlePasswordChange = async () => {
        if (passwordForm.newPw !== passwordForm.confirm) {
            setMessage({ type: 'error', text: 'New passwords do not match.' });
            return;
        }
        if (passwordForm.newPw.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }
        setChangingPassword(true);
        setMessage(null);
        try {
            const { changePatientPassword } = await import('../appointments/actions');
            const res = await changePatientPassword(passwordForm.current, passwordForm.newPw);
            if (res.success) {
                setMessage({ type: 'success', text: 'Password changed successfully.' });
                setShowPasswordChange(false);
                setPasswordForm({ current: '', newPw: '', confirm: '' });
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to change password.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to change password.' });
        }
        setChangingPassword(false);
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-48 bg-gray-200 rounded-3xl" />
                    <div className="grid grid-cols-2 gap-6">
                        <div className="h-48 bg-gray-200 rounded-2xl" />
                        <div className="h-48 bg-gray-200 rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="p-10 text-center text-red-500 font-bold">Failed to load profile.</div>
            </div>
        );
    }

    const p = data.patient;
    const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none transition';

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Message Banner */}
            {message && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {message.text}
                    <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-white/50 rounded"><X className="h-3 w-3" /></button>
                </div>
            )}

            {/* ID Card Header */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute -top-24 -right-24 h-64 w-64 bg-white/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-24 h-64 w-64 bg-indigo-500/20 rounded-full blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
                    <div className="w-28 h-28 bg-white/10 backdrop-blur-md border-[3px] border-white/20 rounded-full flex items-center justify-center shrink-0">
                        <UserCircle className="h-14 w-14 text-white/80" />
                    </div>
                    <div className="text-center md:text-left flex-1">
                        <h1 className="text-3xl font-black mb-1">{p.full_name}</h1>
                        <p className="text-indigo-200 font-medium tracking-widest uppercase text-sm mb-4 flex items-center justify-center md:justify-start gap-2">
                            <ShieldCheck className="h-4 w-4" /> Verified Patient Account
                        </p>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                            <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Patient ID</p>
                                <p className="text-white font-black font-mono text-sm">{p.patient_id}</p>
                            </div>
                            <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Age & Gender</p>
                                <p className="text-white font-bold text-sm">{p.age} yrs &bull; {p.gender}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-6">
                        <h3 className="font-black text-gray-900 flex items-center gap-2">
                            <UserCircle className="h-5 w-5 text-indigo-500" /> Personal Information
                        </h3>
                        {!isEditing ? (
                            <button onClick={() => setIsEditing(true)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                <Edit3 className="h-3 w-3" /> Edit
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={handleSave} disabled={saving} className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg flex items-center gap-1 transition disabled:opacity-50">
                                    <Save className="h-3 w-3" /> {saving ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => { setIsEditing(false); setMessage(null); }} className="text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-4 items-center">
                            <div className="bg-gray-50 p-2 rounded-lg text-gray-400"><Phone className="h-5 w-5" /></div>
                            <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Mobile Number</p>
                                {isEditing ? (
                                    <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                                ) : (
                                    <p className="text-sm font-bold text-gray-900">{p.phone || 'Not provided'}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-4 items-center">
                            <div className="bg-gray-50 p-2 rounded-lg text-gray-400"><Mail className="h-5 w-5" /></div>
                            <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Email Address</p>
                                {isEditing ? (
                                    <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                                ) : (
                                    <p className="text-sm font-bold text-gray-900">{p.email || 'Not provided'}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="bg-gray-50 p-2 rounded-lg text-gray-400 mt-1"><MapPin className="h-5 w-5" /></div>
                            <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Address</p>
                                {isEditing ? (
                                    <textarea value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className={inputCls} rows={2} />
                                ) : (
                                    <p className="text-sm font-bold text-gray-900">{p.address || 'Not on file'}</p>
                                )}
                            </div>
                        </div>

                        {/* Emergency Contact */}
                        <div className="border-t border-gray-100 pt-4 mt-4">
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-3">Emergency Contact</p>
                            {isEditing ? (
                                <div className="space-y-2">
                                    <input placeholder="Contact name" value={editForm.emergency_contact_name} onChange={e => setEditForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className={inputCls} />
                                    <input placeholder="Contact phone" value={editForm.emergency_contact_phone} onChange={e => setEditForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className={inputCls} />
                                </div>
                            ) : (
                                <p className="text-sm font-bold text-gray-900">
                                    {p.emergency_contact_name ? `${p.emergency_contact_name} — ${p.emergency_contact_phone}` : 'Not on file'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Finance + Security */}
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                        <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                            <CreditCard className="h-5 w-5 text-emerald-500" /> Financial & Insurance
                        </h3>
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-4">
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Primary Payment Plan</p>
                            <p className="text-lg font-black text-emerald-900">Self-Pay / General</p>
                        </div>
                        <p className="text-sm text-gray-500 font-medium">To link insurance, please visit the hospital Finance desk with your ID.</p>
                    </div>

                    {/* Password Change */}
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                        <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
                            <Lock className="h-5 w-5 text-gray-500" /> Account Security
                        </h3>
                        {!showPasswordChange ? (
                            <button onClick={() => setShowPasswordChange(true)} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition text-sm flex items-center justify-center gap-2">
                                <Lock className="h-4 w-4" /> Change Password
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <input type="password" placeholder="Current password" value={passwordForm.current} onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))} className={inputCls} />
                                <input type="password" placeholder="New password" value={passwordForm.newPw} onChange={e => setPasswordForm(f => ({ ...f, newPw: e.target.value }))} className={inputCls} />
                                <input type="password" placeholder="Confirm new password" value={passwordForm.confirm} onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))} className={inputCls} />
                                <div className="flex gap-2">
                                    <button onClick={handlePasswordChange} disabled={changingPassword} className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition text-sm disabled:opacity-50">
                                        {changingPassword ? 'Changing...' : 'Update Password'}
                                    </button>
                                    <button onClick={() => { setShowPasswordChange(false); setPasswordForm({ current: '', newPw: '', confirm: '' }); }} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition text-sm">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
