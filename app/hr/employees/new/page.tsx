'use client';

import React, { useEffect, useState } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import { UserPlus, Loader2, ArrowLeft, Check, Copy, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { getEmployeeList, listOrgMasters } from '@/app/actions/hr-actions';
import { createEmployeeWithAccessAction, getAccessEditorSetupAction } from '@/app/actions/access-profile-actions';
import type { AccessProfileValue } from '@/app/lib/access/presets';
import { AccessProfileEditor, type EditorSetup } from '@/app/components/access/AccessProfileEditor';

const sanitizeName = (value: string) => value.replace(/[^a-zA-Z\s.'-]/g, '');
const sanitizePhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const sanitizeMoney = (value: string) => value.replace(/[^\d.]/g, '');

const EMPLOYMENT_TYPES: [string, string][] = [
    ['PERMANENT', 'Permanent'], ['CONTRACT', 'Contract'], ['CONSULTANT_VISITING', 'Visiting consultant'], ['CONSULTANT_RETAINER', 'Retainer consultant'], ['INTERN', 'Intern'],
];

const inputCls = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white';
const labelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1';

type Created = { employeeId: number; employeeCode: string; login: { username: string; temporaryPassword: string | null } | null; loginError: string | null };

export default function NewEmployeePage() {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState<Created | null>(null);
    const [copied, setCopied] = useState(false);

    const [form, setForm] = useState({
        name: '', designation: '', designationId: '', orgDepartmentId: '', reportingManagerId: '', employmentType: 'PERMANENT',
        dateOfJoining: new Date().toISOString().split('T')[0], salaryBasic: '', phone: '', email: '',
    });
    const [masters, setMasters] = useState<{ designations: { id: string; name: string }[]; departments: { id: string; name: string }[] }>({ designations: [], departments: [] });
    const [managers, setManagers] = useState<{ id: number; name: string; employee_code: string }[]>([]);

    const [setup, setSetup] = useState<EditorSetup | null>(null);
    const [wantLogin, setWantLogin] = useState(false);
    const [login, setLogin] = useState({ username: '', password: '' });
    const [profile, setProfile] = useState<AccessProfileValue>({ preset: '', modules: [], permissions: {} });

    useEffect(() => {
        listOrgMasters().then((r) => { if (r.success) setMasters(r.data); });
        getEmployeeList({ isActive: true, limit: 200 }).then((r) => { if (r.success) setManagers((r.data as { id: number; name: string; employee_code: string }[]).map((e) => ({ id: e.id, name: e.name, employee_code: e.employee_code }))); });
        getAccessEditorSetupAction().then((r) => { if (r.success) setSetup(r.data); });
    }, []);

    const useMasterDesignation = masters.designations.length > 0;
    const canGiveLogin = !!setup?.actor.canAssign;
    const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const designationOk = useMasterDesignation ? !!form.designationId : !!form.designation.trim();
        if (!form.name.trim() || !designationOk || !form.dateOfJoining) {
            setError('Name, Designation, and Date of Joining are required.');
            return;
        }
        if (wantLogin && !profile.preset) {
            setError('Choose a base role for the login (or switch “Give a system login” off).');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await createEmployeeWithAccessAction({
                employee: {
                    name: form.name.trim(),
                    designation: useMasterDesignation ? '' : form.designation.trim(),
                    designationId: useMasterDesignation ? form.designationId : undefined,
                    orgDepartmentId: form.orgDepartmentId || undefined,
                    reportingManagerId: form.reportingManagerId ? Number(form.reportingManagerId) : undefined,
                    employmentType: form.employmentType,
                    dateOfJoining: form.dateOfJoining,
                    salaryBasic: form.salaryBasic ? parseFloat(form.salaryBasic) : undefined,
                    phone: form.phone || undefined,
                    email: form.email || undefined,
                },
                login: wantLogin ? {
                    username: login.username.trim() || undefined,
                    password: login.password || undefined,
                    profile: { preset: profile.preset, modules: profile.modules, permissions: profile.permissions },
                } : undefined,
            });
            if (res.success) setCreated(res.data);
            else setError(res.error);
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setSaving(false);
        }
    };

    const header = (
        <Link href="/hr/employees" className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Back
        </Link>
    );

    if (created) {
        return (
            <AppShell pageTitle="Employee added" pageIcon={<Check className="h-5 w-5" />} headerActions={header}>
                <div className="max-w-xl mx-auto bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-4 py-3 rounded-xl">
                        {form.name} was added as <span className="font-mono font-bold">{created.employeeCode}</span>.
                    </div>
                    {created.loginError && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-3 rounded-xl">The employee was saved, but the login was not created: {created.loginError} You can create it from the employee’s page.</div>}
                    {created.login && (
                        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-800"><KeyRound className="h-4 w-4" /> Login created — share securely, the password is shown only once</div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Username</div><div className="font-mono font-bold">{created.login.username}</div></div>
                                {created.login.temporaryPassword && (
                                    <div>
                                        <div className="text-[10px] uppercase text-gray-400 font-semibold">Temporary password</div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold">{created.login.temporaryPassword}</span>
                                            <button type="button" className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => { navigator.clipboard?.writeText(created.login!.temporaryPassword!); setCopied(true); }}>
                                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400">Ask them to change the password after first sign-in (profile menu → Change password).</p>
                        </div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <Link href={`/hr/employees/${created.employeeId}`} className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold">Open employee</Link>
                        <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50" onClick={() => window.location.reload()}>Add another</button>
                        <Link href="/hr/employees" className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">All employees</Link>
                    </div>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell pageTitle="Add New Employee" pageIcon={<UserPlus className="h-5 w-5" />} headerActions={header}>
            <div className="max-w-4xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">{error}</div>}

                    <section className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-5">
                        <h2 className="text-sm font-bold text-gray-800">Employee details</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className={labelCls}>Name *</label>
                                <input type="text" required value={form.name} onChange={(e) => set('name', sanitizeName(e.target.value))} maxLength={60} className={inputCls} placeholder="Full name" />
                            </div>
                            <div>
                                <label className={labelCls}>Designation *</label>
                                {useMasterDesignation ? (
                                    <select required value={form.designationId} onChange={(e) => set('designationId', e.target.value)} className={inputCls}>
                                        <option value="">— choose —</option>
                                        {masters.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" required value={form.designation} onChange={(e) => set('designation', sanitizeName(e.target.value))} maxLength={50} className={inputCls} placeholder="e.g. Nurse, Technician" />
                                )}
                            </div>
                            {masters.departments.length > 0 && (
                                <div>
                                    <label className={labelCls}>Department</label>
                                    <select value={form.orgDepartmentId} onChange={(e) => set('orgDepartmentId', e.target.value)} className={inputCls}>
                                        <option value="">— none —</option>
                                        {masters.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Reports to</label>
                                <select value={form.reportingManagerId} onChange={(e) => set('reportingManagerId', e.target.value)} className={inputCls}>
                                    <option value="">— none —</option>
                                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.employee_code})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Employment type</label>
                                <select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)} className={inputCls}>
                                    {EMPLOYMENT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Date of Joining *</label>
                                <DateField required value={form.dateOfJoining} onChange={(e) => set('dateOfJoining', e.target.value)} className={inputCls} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            <div>
                                <label className={labelCls}>Basic Salary</label>
                                <input type="number" value={form.salaryBasic} onChange={(e) => set('salaryBasic', sanitizeMoney(e.target.value))} min="0" step="0.01" inputMode="decimal" className={inputCls} placeholder="0" />
                            </div>
                            <div>
                                <label className={labelCls}>Phone</label>
                                <input type="tel" value={form.phone} onChange={(e) => set('phone', sanitizePhone(e.target.value))} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} className={inputCls} placeholder="Optional" />
                            </div>
                            <div>
                                <label className={labelCls}>Email</label>
                                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="Optional" />
                            </div>
                        </div>
                    </section>

                    <section className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-sm font-bold text-gray-800">Login & access</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Every employee gets My Workspace (attendance, leave, profile). Give a login to let them sign in, then choose exactly which modules they can open.</p>
                            </div>
                            {canGiveLogin ? (
                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 shrink-0">
                                    <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={wantLogin} onChange={(e) => setWantLogin(e.target.checked)} />
                                    Give a system login
                                </label>
                            ) : (
                                <span className="text-xs text-gray-400 shrink-0">{setup ? 'You can add the record; an administrator or HR creates logins.' : <Loader2 className="h-4 w-4 animate-spin inline" />}</span>
                            )}
                        </div>

                        {wantLogin && setup && (
                            <>
                                <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
                                    <div>
                                        <label className={labelCls}>Username</label>
                                        <input className={inputCls} value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} placeholder="Defaults to the employee code" />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Password</label>
                                        <input className={inputCls} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Leave blank to generate one" />
                                    </div>
                                </div>
                                <AccessProfileEditor setup={setup} value={profile} baseline={{ preset: '', modules: [], permissions: {} }} onChange={setProfile} personName={form.name.trim().split(' ')[0] || undefined} />
                            </>
                        )}
                    </section>

                    <div>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            {wantLogin ? 'Create employee & login' : 'Create Employee'}
                        </button>
                    </div>
                </form>
            </div>
        </AppShell>
    );
}
