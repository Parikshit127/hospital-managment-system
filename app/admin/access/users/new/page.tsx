'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UserPlus, Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { createStaffAction, getWizardLookupsAction } from '@/app/actions/access-admin-actions';
import { Btn, Card, Chip, Field, Notice, inputCls, prettyKey } from '../../ui';

type Lookups = Extract<Awaited<ReturnType<typeof getWizardLookupsAction>>, { success: true }>['data'];
type Created = { userId: string; username: string; employeeCode: string; temporaryPassword: string | null };

const STEPS = ['Person', 'Access', 'Login', 'Review'] as const;

export default function NewUserWizard() {
    const [lk, setLk] = useState<Lookups | null>(null);
    const [loadError, setLoadError] = useState('');
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState<Created | null>(null);
    const [copied, setCopied] = useState(false);

    const [f, setF] = useState({
        name: '', email: '', phone: '', employeeCode: '', designation: '', designationId: '', orgDepartmentId: '', reportingManagerId: '',
        dateOfJoining: new Date().toISOString().slice(0, 10), homeUnitId: '', specialty: '',
        primaryRole: '', username: '', usePassword: false, password: '',
    });
    const [extra, setExtra] = useState<{ roleId: string; unitId: string }[]>([]);
    const [ovr, setOvr] = useState<{ permissionKey: string; effect: 'GRANT' | 'DENY'; reason: string }[]>([]);
    const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

    useEffect(() => {
        getWizardLookupsAction().then((r) => {
            if (!r.success) return setLoadError(r.error);
            setLk(r.data);
            setF((p) => ({ ...p, homeUnitId: r.data.homeUnitId }));
        });
    }, []);

    const systemRoles = useMemo(() => (lk?.roles ?? []).filter((r) => r.system), [lk]);
    const allPerms = useMemo(() => (lk?.catalogue ?? []).flatMap((m) => m.permissions.map((p) => ({ ...p, module: m.name }))), [lk]);
    const roleName = (id: string) => lk?.roles.find((r) => r.id === id)?.name.replace(' (access template)', '') ?? id;
    const unitName = (id: string) => (id === '' ? 'All units' : lk?.units.find((u) => u.id === id)?.name ?? id);
    const primary = systemRoles.find((r) => r.templateKey === f.primaryRole);

    const stepError = (): string => {
        if (step === 0) {
            if (f.name.trim().length < 2) return 'Name is required.';
            if (!f.homeUnitId) return 'Choose a home unit.';
        }
        if (step === 1) {
            if (!f.primaryRole) return 'Choose a primary role.';
            if (primary && !primary.assignable) return primary.reason ?? 'You cannot grant that role.';
            if (extra.some((x) => !x.roleId)) return 'Choose a role for every extra assignment.';
            if (ovr.some((o) => !o.permissionKey || o.reason.trim().length < 3)) return 'Every override needs a permission and a reason.';
        }
        if (step === 2 && f.usePassword && f.password.length < 8) return 'Password must be at least 8 characters.';
        return '';
    };
    const next = () => { const e = stepError(); setError(e); if (!e) setStep((s) => s + 1); };

    const save = async () => {
        setBusy(true); setError('');
        const r = await createStaffAction({
            name: f.name, email: f.email, phone: f.phone, employeeCode: f.employeeCode || undefined, designation: f.designation || undefined,
            designationId: f.designationId || null, orgDepartmentId: f.orgDepartmentId || null,
            reportingManagerId: f.reportingManagerId ? Number(f.reportingManagerId) : null, dateOfJoining: f.dateOfJoining, homeUnitId: f.homeUnitId,
            specialty: f.specialty || undefined, primaryRole: f.primaryRole, username: f.username || undefined, password: f.usePassword ? f.password : undefined,
            extraRoles: extra.map((x) => ({ roleId: x.roleId, unitId: x.unitId || null })),
            overrides: ovr.map((o) => ({ permissionKey: o.permissionKey, effect: o.effect, reason: o.reason })),
        });
        setBusy(false);
        if (!r.success) return setError(r.error);
        setCreated(r.data);
    };

    if (loadError) return <AdminPage pageTitle="Add user" pageIcon={<UserPlus className="h-5 w-5" />}><Notice kind="error">{loadError}</Notice></AdminPage>;
    if (!lk) return <AdminPage pageTitle="Add user" pageIcon={<UserPlus className="h-5 w-5" />}><div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div></AdminPage>;

    if (created) {
        return (
            <AdminPage pageTitle="User created" pageIcon={<Check className="h-5 w-5" />}>
                <Card>
                    <div className="space-y-3 max-w-lg">
                        <Notice kind="ok">{f.name} can now sign in. Share these details securely — the password is shown only once.</Notice>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Username</div><div className="font-mono font-bold">{created.username}</div></div>
                            <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Employee code</div><div className="font-mono font-bold">{created.employeeCode}</div></div>
                            {created.temporaryPassword && (
                                <div className="col-span-2">
                                    <div className="text-[10px] uppercase text-gray-400 font-semibold">Temporary password</div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">{created.temporaryPassword}</span>
                                        <Btn small kind="ghost" onClick={() => { navigator.clipboard?.writeText(created.temporaryPassword!); setCopied(true); }}><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}</Btn>
                                    </div>
                                    <div className="text-[11px] text-gray-400 mt-1">Ask them to change it after first sign-in (profile menu → Change password).</div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Btn href={`/admin/access/users/${created.userId}`}>Manage access</Btn>
                            <Btn kind="ghost" onClick={() => window.location.reload()}>Add another</Btn>
                            <Btn kind="ghost" href="/admin/access/users">Back to users</Btn>
                        </div>
                    </div>
                </Card>
            </AdminPage>
        );
    }

    return (
        <AdminPage pageTitle="Add user" pageIcon={<UserPlus className="h-5 w-5" />} headerActions={<Btn kind="ghost" href="/admin/access/users">Cancel</Btn>}>
            <div className="flex items-center gap-2">
                {STEPS.map((s, i) => (
                    <React.Fragment key={s}>
                        <div className={`flex items-center gap-2 text-sm font-semibold ${i === step ? 'text-orange-600' : i < step ? 'text-emerald-600' : 'text-gray-400'}`}>
                            <span className={`h-6 w-6 rounded-full grid place-items-center text-xs ${i === step ? 'bg-orange-500 text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
                            {s}
                        </div>
                        {i < STEPS.length - 1 && <div className="h-px w-8 bg-gray-200" />}
                    </React.Fragment>
                ))}
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <Card>
                {step === 0 && (
                    <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
                        <Field label="Full name *"><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
                        <Field label="Home unit *">
                            <select className={inputCls} value={f.homeUnitId} onChange={(e) => set('homeUnitId', e.target.value)}>
                                {lk.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
                        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                        <Field label="Employee code" hint="Leave blank to assign the next free code in the unit."><input className={inputCls} value={f.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} /></Field>
                        <Field label="Date of joining"><input type="date" className={inputCls} value={f.dateOfJoining} onChange={(e) => set('dateOfJoining', e.target.value)} /></Field>
                        {lk.designations.length > 0 ? (
                            <Field label="Designation">
                                <select className={inputCls} value={f.designationId} onChange={(e) => set('designationId', e.target.value)}>
                                    <option value="">— choose —</option>{lk.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </Field>
                        ) : (
                            <Field label="Designation"><input className={inputCls} value={f.designation} onChange={(e) => set('designation', e.target.value)} /></Field>
                        )}
                        {lk.departments.length > 0 && (
                            <Field label="Department">
                                <select className={inputCls} value={f.orgDepartmentId} onChange={(e) => set('orgDepartmentId', e.target.value)}>
                                    <option value="">— choose —</option>{lk.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label="Reporting manager" hint="Decides who approves their leave and what “team” means.">
                            <select className={inputCls} value={f.reportingManagerId} onChange={(e) => set('reportingManagerId', e.target.value)}>
                                <option value="">— none —</option>{lk.managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.employee_code})</option>)}
                            </select>
                        </Field>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-6 max-w-3xl">
                        <div>
                            <Field label="Primary role *" hint="Sets the screens they land on and work in today.">
                                <select className={inputCls} value={f.primaryRole} onChange={(e) => set('primaryRole', e.target.value)}>
                                    <option value="">— choose a role —</option>
                                    {systemRoles.map((r) => (
                                        <option key={r.id} value={r.templateKey ?? ''} disabled={!r.assignable}>
                                            {r.name.replace(' (access template)', '')}{!r.assignable ? ' — you cannot grant this' : ''}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            {f.primaryRole === 'doctor' && <div className="mt-3 max-w-xs"><Field label="Specialty"><input className={inputCls} value={f.specialty} onChange={(e) => set('specialty', e.target.value)} /></Field></div>}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-gray-800">Extra roles <span className="font-normal text-gray-400">(optional — e.g. billing in another unit)</span></div>
                                <Btn small kind="ghost" onClick={() => setExtra((x) => [...x, { roleId: '', unitId: f.homeUnitId }])}><Plus className="h-3 w-3" /> Add</Btn>
                            </div>
                            {extra.map((x, i) => (
                                <div key={i} className="flex gap-2 mb-2">
                                    <select className={inputCls} value={x.roleId} onChange={(e) => setExtra((l) => l.map((y, j) => (j === i ? { ...y, roleId: e.target.value } : y)))}>
                                        <option value="">— role —</option>
                                        {lk.roles.map((r) => <option key={r.id} value={r.id} disabled={!r.assignable}>{r.name.replace(' (access template)', '')}{!r.assignable ? ' — you cannot grant this' : ''}</option>)}
                                    </select>
                                    <select className={`${inputCls} max-w-[220px]`} value={x.unitId} onChange={(e) => setExtra((l) => l.map((y, j) => (j === i ? { ...y, unitId: e.target.value } : y)))}>
                                        <option value="">All units</option>{lk.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                    <button className="text-gray-400 hover:text-red-600" onClick={() => setExtra((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ))}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-gray-800">One-off grants / denies <span className="font-normal text-gray-400">(optional, with a reason)</span></div>
                                <Btn small kind="ghost" onClick={() => setOvr((x) => [...x, { permissionKey: '', effect: 'GRANT', reason: '' }])}><Plus className="h-3 w-3" /> Add</Btn>
                            </div>
                            {ovr.map((o, i) => (
                                <div key={i} className="flex gap-2 mb-2">
                                    <select className={`${inputCls} max-w-[110px]`} value={o.effect} onChange={(e) => setOvr((l) => l.map((y, j) => (j === i ? { ...y, effect: e.target.value as 'GRANT' | 'DENY' } : y)))}>
                                        <option>GRANT</option><option>DENY</option>
                                    </select>
                                    <select className={inputCls} value={o.permissionKey} onChange={(e) => setOvr((l) => l.map((y, j) => (j === i ? { ...y, permissionKey: e.target.value } : y)))}>
                                        <option value="">— permission —</option>
                                        {allPerms.map((p) => <option key={p.key} value={p.key} disabled={o.effect === 'GRANT' && !p.grantable}>{p.module} · {prettyKey(p.key.split('.').slice(1).join('.'))}{o.effect === 'GRANT' && !p.grantable ? ' (you do not hold this)' : ''}</option>)}
                                    </select>
                                    <input className={inputCls} placeholder="Reason" value={o.reason} onChange={(e) => setOvr((l) => l.map((y, j) => (j === i ? { ...y, reason: e.target.value } : y)))} />
                                    <button className="text-gray-400 hover:text-red-600" onClick={() => setOvr((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 max-w-lg">
                        <Field label="Username" hint="Defaults to the employee code. Must be unique across the whole system.">
                            <input className={inputCls} value={f.username} onChange={(e) => set('username', e.target.value)} placeholder={f.employeeCode || 'employee code'} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!f.usePassword} onChange={(e) => set('usePassword', !e.target.checked)} /> Generate a temporary password (shown once after saving)</label>
                        {f.usePassword && <Field label="Password" hint="At least 8 characters."><input type="text" className={inputCls} value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-3 max-w-2xl text-sm">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <Row k="Name" v={f.name} /><Row k="Home unit" v={unitName(f.homeUnitId)} />
                            <Row k="Employee code" v={f.employeeCode || 'next free code'} /><Row k="Username" v={f.username || f.employeeCode || 'employee code'} />
                            <Row k="Email" v={f.email || '—'} /><Row k="Phone" v={f.phone || '—'} />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Access</div>
                            <div className="flex flex-wrap gap-1">
                                <Chip tone="blue">{primary?.name.replace(' (access template)', '')} · {unitName(f.homeUnitId)} (primary)</Chip>
                                {extra.map((x, i) => <Chip key={i} tone="blue">{roleName(x.roleId)} · {unitName(x.unitId)}</Chip>)}
                                {ovr.map((o, i) => <Chip key={i} tone={o.effect === 'GRANT' ? 'green' : 'red'}>{o.effect} {o.permissionKey}</Chip>)}
                            </div>
                        </div>
                        <Notice kind="info">Saving creates the login, the employee record and all of the above together, and writes an entry to the change log.</Notice>
                    </div>
                )}
            </Card>

            <div className="flex justify-between">
                <Btn kind="ghost" disabled={step === 0} onClick={() => { setError(''); setStep((s) => s - 1); }}>Back</Btn>
                {step < STEPS.length - 1 ? <Btn onClick={next}>Continue</Btn> : <Btn busy={busy} onClick={save}>Create user</Btn>}
            </div>
        </AdminPage>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return <div><div className="text-[10px] uppercase text-gray-400 font-semibold">{k}</div><div className="font-semibold text-gray-800">{v}</div></div>;
}
