'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { UserCircle, Loader2, Save } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { useToast } from '@/app/components/ui/Toast';
import { getMyProfile, updateMyProfile } from '@/app/actions/hr-self-service-actions';
import { fmtIstDate } from '@/app/lib/ist';
import { Card, inputCls, labelCls, primaryBtn } from '@/app/components/hr/HrBits';

type Profile = NonNullable<Extract<Awaited<ReturnType<typeof getMyProfile>>, { success: true }>['data']>;

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 10);

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className={labelCls}>{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value || '—'}</p>
        </div>
    );
}

export default function MyProfilePage() {
    const toast = useToast();
    const [p, setP] = useState<Profile | null>(null);
    const [form, setForm] = useState({
        phone: '', email: '', address: '', bloodGroup: '', gender: '', dateOfBirth: '',
        emergencyContactName: '', emergencyContactPhone: '',
    });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const res = await getMyProfile();
        if (res.success && res.data) {
            const d = res.data;
            setP(d);
            setForm({
                phone: d.phone ?? '', email: d.email ?? '', address: d.address ?? '', bloodGroup: d.bloodGroup ?? '',
                gender: d.gender ?? '', dateOfBirth: d.dateOfBirth ?? '',
                emergencyContactName: d.emergencyContactName ?? '', emergencyContactPhone: d.emergencyContactPhone ?? '',
            });
        } else toast.error(('error' in res && res.error) || 'Could not load profile');
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true);
        const res = await updateMyProfile(form);
        setSaving(false);
        if (res.success) toast.success('Profile saved');
        else toast.error(('error' in res && res.error) || 'Could not save');
    };

    if (!p) {
        return (
            <AppShell pageTitle="My Profile" pageIcon={<UserCircle className="h-5 w-5" />}>
                <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
            </AppShell>
        );
    }

    return (
        <AppShell pageTitle="My Profile" pageIcon={<UserCircle className="h-5 w-5" />}>
            <div className="space-y-5 max-w-3xl">
                <Card className="p-6">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Employment</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                        <ReadOnly label="Employee ID" value={p.code} />
                        <ReadOnly label="Name" value={p.name} />
                        <ReadOnly label="Designation" value={p.designation} />
                        <ReadOnly label="Department" value={p.department} />
                        <ReadOnly label="Type" value={p.employmentType.replace(/_/g, ' ').toLowerCase()} />
                        <ReadOnly label="Joined" value={fmtIstDate(p.joined + 'T00:00:00Z')} />
                        <ReadOnly label="Reports to" value={p.manager} />
                        <ReadOnly label="Login" value={p.username} />
                        <ReadOnly label="System role" value={p.role.replace(/_/g, ' ')} />
                    </div>
                    <p className="mt-4 text-[11px] text-gray-400">Job details are managed by HR. Ask HR if something here is wrong.</p>
                </Card>

                <Card className="p-6">
                    <h3 className="text-sm font-black text-gray-900 mb-4">Contact &amp; personal</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className={labelCls}>Phone</label><input className={inputCls} inputMode="numeric" value={form.phone} onChange={e => setForm({ ...form, phone: digits(e.target.value) })} /></div>
                        <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                        <div><label className={labelCls}>Date of birth</label><DateField className={inputCls} value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
                        <div>
                            <label className={labelCls}>Gender</label>
                            <select className={inputCls} value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Blood group</label>
                            <select className={inputCls} value={form.bloodGroup} onChange={e => setForm({ ...form, bloodGroup: e.target.value })}>
                                <option value="">—</option>
                                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2"><label className={labelCls}>Address</label><textarea rows={2} className={inputCls} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={300} /></div>
                    </div>

                    <h3 className="text-sm font-black text-gray-900 mt-6 mb-4">Emergency contact</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className={labelCls}>Name</label><input className={inputCls} value={form.emergencyContactName} onChange={e => setForm({ ...form, emergencyContactName: e.target.value })} maxLength={120} /></div>
                        <div><label className={labelCls}>Phone</label><input className={inputCls} inputMode="numeric" value={form.emergencyContactPhone} onChange={e => setForm({ ...form, emergencyContactPhone: digits(e.target.value) })} /></div>
                    </div>

                    <button onClick={save} disabled={saving} className={`${primaryBtn} mt-6`}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                    </button>
                </Card>
            </div>
        </AppShell>
    );
}
