'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
    UserCircle, Phone, MapPin, Mail, ShieldCheck, Edit3, Save, X, Lock,
    AlertCircle, CheckCircle2, Camera, Heart, AlertTriangle, Users, Droplets,
    Activity, Calendar, Shield, Loader2
} from 'lucide-react';
import { getPatientDashboardData } from '@/app/actions/patient-actions';

export default function ProfilePage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        phone: '', email: '', address: '',
        emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '',
        allergies: '', chronic_conditions: '',
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [insurance, setInsurance] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Password change
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', newPw: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getPatientDashboardData();
        if (res.success && res.data) {
            setData(res.data);
            const p = res.data.patient;
            if (p) {
                setEditForm({
                    phone: p.phone || '',
                    email: p.email || '',
                    address: p.address || '',
                    emergency_contact_name: p.emergency_contact_name || '',
                    emergency_contact_phone: p.emergency_contact_phone || '',
                    emergency_contact_relation: p.emergency_contact_relation || '',
                    allergies: p.allergies || '',
                    chronic_conditions: p.chronic_conditions || '',
                });
            }
        }
        setLoading(false);
    };

    // Load insurance policies
    const loadInsurance = async () => {
        try {
            const { getPatientInsurance } = await import('./insurance-action');
            const res = await getPatientInsurance();
            if (res.success) setInsurance(res.data || []);
        } catch {
            // Insurance action may not exist yet
        }
    };

    useEffect(() => { loadData(); loadInsurance(); }, []);

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

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'Photo must be under 2MB.' });
            return;
        }

        setPhotoUploading(true);
        setMessage(null);
        try {
            const { uploadProfilePhoto } = await import('../appointments/actions');
            const formData = new FormData();
            formData.append('photo', file);
            const res = await uploadProfilePhoto(formData);
            if (res.success) {
                setMessage({ type: 'success', text: 'Photo updated successfully.' });
                loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to upload photo.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to upload photo.' });
        }
        setPhotoUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePasswordChange = async () => {
        if (passwordForm.newPw !== passwordForm.confirm) {
            setMessage({ type: 'error', text: 'New passwords do not match.' });
            return;
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/.test(passwordForm.newPw)) {
            setMessage({ type: 'error', text: 'Password must be 8–64 characters with uppercase, lowercase, number, and special character.' });
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

    const allergiesList = (p.allergies || '').split(',').map((a: string) => a.trim()).filter(Boolean);
    const conditionsList = (p.chronic_conditions || '').split(',').map((c: string) => c.trim()).filter(Boolean);

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

            {/* ID Card Header with Photo */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute -top-24 -right-24 h-64 w-64 bg-white/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-24 h-64 w-64 bg-indigo-500/20 rounded-full blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
                    {/* Profile Photo */}
                    <div className="relative group">
                        <div className="w-28 h-28 rounded-full overflow-hidden border-[3px] border-white/20 bg-white/10 backdrop-blur-md shrink-0">
                            {p.profile_photo_url ? (
                                <img src={p.profile_photo_url} alt={p.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <UserCircle className="h-14 w-14 text-white/80" />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={photoUploading}
                            className="absolute bottom-0 right-0 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition group-hover:scale-110"
                        >
                            {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePhotoUpload}
                            className="hidden"
                        />
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
                                <p className="text-white font-bold text-sm">{p.age ? `${p.age} yrs` : 'N/A'} &bull; {p.gender || 'N/A'}</p>
                            </div>
                            {p.blood_group && (
                                <div className="bg-red-500/20 rounded-xl p-3 border border-red-400/20">
                                    <p className="text-[10px] text-red-300 font-bold uppercase tracking-wider mb-1">Blood Group</p>
                                    <p className="text-white font-black text-sm flex items-center gap-1">
                                        <Droplets className="h-3.5 w-3.5 text-red-400" /> {p.blood_group}
                                    </p>
                                </div>
                            )}
                            {p.date_of_birth && (
                                <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Date of Birth</p>
                                    <p className="text-white font-bold text-sm flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {new Date(p.date_of_birth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Emergency Contact — Prominently Displayed */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-red-800 flex items-center gap-2">
                        <Users className="h-5 w-5" /> Emergency Contact
                    </h3>
                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 px-3 py-1.5 bg-red-100 rounded-lg hover:bg-red-200 transition">
                            <Edit3 className="h-3 w-3" /> Edit
                        </button>
                    )}
                </div>
                {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input placeholder="Contact name" value={editForm.emergency_contact_name} onChange={e => setEditForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className={inputCls} />
                        <input placeholder="Contact phone" value={editForm.emergency_contact_phone} onChange={e => setEditForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className={inputCls} />
                        <input placeholder="Relation (e.g. Spouse, Parent)" value={editForm.emergency_contact_relation} onChange={e => setEditForm(f => ({ ...f, emergency_contact_relation: e.target.value }))} className={inputCls} />
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        {p.emergency_contact_name ? (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                                    <Users className="h-5 w-5 text-red-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{p.emergency_contact_name}</p>
                                    <p className="text-xs text-gray-500">
                                        {p.emergency_contact_relation && <span className="mr-2">{p.emergency_contact_relation}</span>}
                                        {p.emergency_contact_phone && <span className="font-mono">{p.emergency_contact_phone}</span>}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-red-600 font-medium">No emergency contact on file. Please add one for your safety.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Medical Summary Card */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                    <h3 className="font-black text-gray-900 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-purple-500" /> Medical Summary
                    </h3>
                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                            <Edit3 className="h-3 w-3" /> Edit
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Allergies */}
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-red-400" /> Allergies
                        </p>
                        {isEditing ? (
                            <div>
                                <input
                                    placeholder="e.g. Penicillin, Peanuts (comma-separated)"
                                    value={editForm.allergies}
                                    onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))}
                                    className={inputCls}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Separate multiple allergies with commas</p>
                            </div>
                        ) : allergiesList.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {allergiesList.map((a: string, i: number) => (
                                    <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                                        {a}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic">None recorded</p>
                        )}
                    </div>

                    {/* Chronic Conditions */}
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2 flex items-center gap-1">
                            <Heart className="h-3 w-3 text-purple-400" /> Chronic Conditions
                        </p>
                        {isEditing ? (
                            <div>
                                <input
                                    placeholder="e.g. Diabetes Type 2, Hypertension (comma-separated)"
                                    value={editForm.chronic_conditions}
                                    onChange={e => setEditForm(f => ({ ...f, chronic_conditions: e.target.value }))}
                                    className={inputCls}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Separate multiple conditions with commas</p>
                            </div>
                        ) : conditionsList.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {conditionsList.map((c: string, i: number) => (
                                    <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic">None recorded</p>
                        )}
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
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Insurance */}
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                        <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
                            <Shield className="h-5 w-5 text-blue-500" /> Insurance
                        </h3>
                        {insurance.length > 0 ? (
                            <div className="space-y-3">
                                {insurance.map((ins: any) => (
                                    <div key={ins.id} className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-bold text-gray-900">{ins.plan_name || 'Insurance Policy'}</p>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                ins.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {ins.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <p className="text-gray-400 font-medium">Policy Number</p>
                                                <p className="font-bold text-gray-700 font-mono">{ins.policy_number}</p>
                                            </div>
                                            {ins.valid_until && (
                                                <div>
                                                    <p className="text-gray-400 font-medium">Valid Until</p>
                                                    <p className="font-bold text-gray-700">
                                                        {new Date(ins.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            )}
                                            {ins.coverage_limit && (
                                                <div>
                                                    <p className="text-gray-400 font-medium">Coverage</p>
                                                    <p className="font-bold text-gray-700">
                                                        &#8377;{Number(ins.coverage_limit).toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            )}
                                            {ins.remaining_limit && (
                                                <div>
                                                    <p className="text-gray-400 font-medium">Remaining</p>
                                                    <p className="font-bold text-emerald-600">
                                                        &#8377;{Number(ins.remaining_limit).toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                                <p className="text-sm text-gray-500 font-medium">No insurance policies linked.</p>
                                <p className="text-xs text-gray-400 mt-1">Visit the hospital Finance desk to link your insurance.</p>
                            </div>
                        )}
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
