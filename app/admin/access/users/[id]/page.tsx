'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye, KeyRound, Loader2, LogOut, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    addOverrideAction, assignRoleAction, getUserAccessDetailAction, getWizardLookupsAction, listChangeLogAction, offboardUserAction,
    removeOverrideAction, revokeUserRoleAction,
} from '@/app/actions/access-admin-actions';
import { EmployeeAccessPanel } from '@/app/components/access/EmployeeAccessPanel';
import { Btn, Card, Chip, Field, Notice, fmt, inputCls, prettyKey } from '../../ui';

type Detail = Extract<Awaited<ReturnType<typeof getUserAccessDetailAction>>, { success: true }>['data'];
type Lookups = Extract<Awaited<ReturnType<typeof getWizardLookupsAction>>, { success: true }>['data'];
type Log = Extract<Awaited<ReturnType<typeof listChangeLogAction>>, { success: true }>['data'];

export default function UserAccessPage() {
    const { id } = useParams<{ id: string }>();
    const [d, setD] = useState<Detail | null>(null);
    const [lk, setLk] = useState<Lookups | null>(null);
    const [log, setLog] = useState<Log>([]);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');
    const [busy, setBusy] = useState('');
    const [viewUnit, setViewUnit] = useState('');

    const [roleForm, setRoleForm] = useState({ roleId: '', unitId: '', validTo: '' });
    const [ovrForm, setOvrForm] = useState({ permissionKey: '', effect: 'GRANT' as 'GRANT' | 'DENY', unitId: '', scope: '', expiresAt: '', reason: '' });
    const [offReason, setOffReason] = useState('');
    const [offOpen, setOffOpen] = useState(false);

    const load = useCallback(async () => {
        const [a, b, c] = await Promise.all([getUserAccessDetailAction(id), getWizardLookupsAction(), listChangeLogAction({ targetUserId: id, limit: 50 })]);
        if (!a.success) { setError(a.error); return; }
        setD(a.data); setViewUnit((v) => v || a.data.user.organizationId);
        if (b.success) setLk(b.data);
        if (c.success) setLog(c.data);
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const act = async (label: string, fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(label); setError(''); setOk('');
        const r = await fn();
        setBusy('');
        if (!r.success) return setError((r as { error: string }).error);
        setOk(done); await load();
    };

    const allPerms = useMemo(() => (lk?.catalogue ?? []).flatMap((m) => m.permissions.map((p) => ({ ...p, module: m.name }))), [lk]);
    const eff = d?.effective.find((e) => e.unitId === viewUnit) ?? d?.effective[0];

    if (!d) {
        return (
            <AdminPage pageTitle="User access" pageIcon={<KeyRound className="h-5 w-5" />}>
                {error ? <Notice kind="error">{error}</Notice> : <div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}
            </AdminPage>
        );
    }
    const u = d.user;

    return (
        <AdminPage
            pageTitle={u.name ?? u.username}
            pageIcon={<KeyRound className="h-5 w-5" />}
            headerActions={<Btn kind="ghost" href="/admin/access/users"><ArrowLeft className="h-4 w-4" /> Users</Btn>}
        >
            {error && <Notice kind="error">{error}</Notice>}
            {ok && <Notice kind="ok">{ok}</Notice>}

            <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-2 text-sm">
                        <Info k="Username" v={u.username} />
                        <Info k="Employee code" v={d.employee?.employee_code ?? '—'} />
                        <Info k="Designation" v={d.employee?.designation ?? '—'} />
                        <Info k="Reports to" v={d.employee?.reporting_manager?.name ?? '—'} />
                        <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Status</div>{u.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="red">Inactive</Chip>}</div>
                    </div>
                    {u.is_active && <Btn kind="danger" small onClick={() => setOffOpen((o) => !o)}><LogOut className="h-3.5 w-3.5" /> Offboard</Btn>}
                </div>
                {offOpen && (
                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3 max-w-xl">
                        <Notice kind="error"><ShieldAlert className="h-4 w-4 inline mr-1" />Offboarding disables the login, ends every role, revokes all overrides and closes the employee record. History stays in the log.</Notice>
                        <Field label="Reason *"><input className={inputCls} value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="e.g. resigned, end of contract" /></Field>
                        <div className="flex gap-2">
                            <Btn kind="danger" busy={busy === 'off'} onClick={() => act('off', () => offboardUserAction({ targetUserId: id, reason: offReason }), 'User offboarded.')}>Confirm offboard</Btn>
                            <Btn kind="ghost" onClick={() => setOffOpen(false)}>Cancel</Btn>
                        </div>
                    </div>
                )}
            </Card>

            {d.employee?.id != null && (
                <Card title="Module access (per-employee profile)">
                    <p className="text-xs text-gray-500 mb-4">
                        Choose module by module what this person can open and do. Once a profile is saved it is the whole truth for this person — the roles and
                        one-off exceptions further down are then ignored for them. Removing the profile puts them back on their base role.
                    </p>
                    <EmployeeAccessPanel employeeId={d.employee.id} onChanged={load} />
                </Card>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
                <Card title="Roles">
                    <div className="space-y-2 mb-4">
                        {d.roles.length === 0 && <div className="text-sm text-gray-400">No access roles yet.</div>}
                        {d.roles.map((r) => (
                            <div key={r.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${r.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                                <div>
                                    <div className="text-sm font-semibold text-gray-800">{r.name.replace(' (access template)', '')} {r.primary && <Chip tone="blue">primary</Chip>} {r.templateKey === 'admin' && <Chip tone="violet">admin</Chip>}</div>
                                    <div className="text-xs text-gray-400">{r.unitName}{r.validTo ? ` · ${r.active ? 'until' : 'ended'} ${fmt(r.validTo)}` : ''}</div>
                                </div>
                                {r.active && u.is_active && (
                                    <button className="text-gray-400 hover:text-red-600" title="Revoke" disabled={!!busy} onClick={() => act('rv' + r.id, () => revokeUserRoleAction(r.id), 'Role revoked.')}><Trash2 className="h-4 w-4" /></button>
                                )}
                            </div>
                        ))}
                    </div>
                    {u.is_active && lk && (
                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <div className="text-xs font-bold text-gray-500 uppercase">Assign a role</div>
                            <select className={inputCls} value={roleForm.roleId} onChange={(e) => setRoleForm({ ...roleForm, roleId: e.target.value })}>
                                <option value="">— choose a role —</option>
                                {lk.roles.map((r) => <option key={r.id} value={r.id} disabled={!r.assignable} title={r.reason ?? ''}>{r.name.replace(' (access template)', '')}{!r.assignable ? ' — you cannot grant this' : ''}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <select className={inputCls} value={roleForm.unitId} onChange={(e) => setRoleForm({ ...roleForm, unitId: e.target.value })}>
                                    <option value="">All units (company owners only)</option>
                                    {lk.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <input type="date" className={`${inputCls} max-w-[170px]`} value={roleForm.validTo} onChange={(e) => setRoleForm({ ...roleForm, validTo: e.target.value })} title="Optional end date" />
                            </div>
                            <Btn busy={busy === 'assign'} disabled={!roleForm.roleId} onClick={() => act('assign', () => assignRoleAction({ targetUserId: id, roleId: roleForm.roleId, unitId: roleForm.unitId || null, validTo: roleForm.validTo ? new Date(roleForm.validTo + 'T23:59:59').toISOString() : null }), 'Role assigned.')}><Plus className="h-4 w-4" /> Assign</Btn>
                        </div>
                    )}
                </Card>

                <Card title="One-off grants & denies">
                    <div className="space-y-2 mb-4">
                        {d.overrides.length === 0 && <div className="text-sm text-gray-400">None.</div>}
                        {d.overrides.map((o) => (
                            <div key={o.id} className={`rounded-xl border px-3 py-2 ${o.expired ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold"><Chip tone={o.effect === 'GRANT' ? 'green' : 'red'}>{o.effect}</Chip> <span className="font-mono text-xs">{o.permission_key}</span></div>
                                    {!o.expired && u.is_active && <button className="text-gray-400 hover:text-red-600" disabled={!!busy} onClick={() => act('ro' + o.id, () => removeOverrideAction(o.id), 'Override removed.')}><Trash2 className="h-4 w-4" /></button>}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">“{o.reason}” · {o.unit_id ? d.units.find((x) => x.id === o.unit_id)?.name : 'all units'}{o.scope ? ` · ${o.scope}` : ''}{o.expires_at ? ` · ${o.expired ? 'expired' : 'expires'} ${fmt(o.expires_at)}` : ''}</div>
                            </div>
                        ))}
                    </div>
                    {u.is_active && lk && (
                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <div className="text-xs font-bold text-gray-500 uppercase">Add an exception</div>
                            <div className="flex gap-2">
                                <select className={`${inputCls} max-w-[110px]`} value={ovrForm.effect} onChange={(e) => setOvrForm({ ...ovrForm, effect: e.target.value as 'GRANT' | 'DENY' })}><option>GRANT</option><option>DENY</option></select>
                                <select className={inputCls} value={ovrForm.permissionKey} onChange={(e) => setOvrForm({ ...ovrForm, permissionKey: e.target.value })}>
                                    <option value="">— permission —</option>
                                    {allPerms.map((p) => <option key={p.key} value={p.key} disabled={ovrForm.effect === 'GRANT' && !p.grantable}>{p.module} · {prettyKey(p.key.split('.').slice(1).join('.'))}{ovrForm.effect === 'GRANT' && !p.grantable ? ' (you do not hold this)' : ''}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <select className={inputCls} value={ovrForm.unitId} onChange={(e) => setOvrForm({ ...ovrForm, unitId: e.target.value })}>
                                    <option value="">All units (company owners only)</option>{lk.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <select className={`${inputCls} max-w-[150px]`} value={ovrForm.scope} onChange={(e) => setOvrForm({ ...ovrForm, scope: e.target.value })} disabled={ovrForm.effect === 'DENY'}>
                                    <option value="">Scope: unit</option><option value="OWN">own records</option><option value="TEAM">my team</option><option value="DEPARTMENT">department</option><option value="UNIT">whole unit</option><option value="COMPANY">company</option>
                                </select>
                                <input type="date" className={`${inputCls} max-w-[160px]`} value={ovrForm.expiresAt} onChange={(e) => setOvrForm({ ...ovrForm, expiresAt: e.target.value })} title="Optional expiry" />
                            </div>
                            <input className={inputCls} placeholder="Reason (required)" value={ovrForm.reason} onChange={(e) => setOvrForm({ ...ovrForm, reason: e.target.value })} />
                            <Btn busy={busy === 'ovr'} disabled={!ovrForm.permissionKey || ovrForm.reason.trim().length < 3}
                                onClick={() => act('ovr', () => addOverrideAction({
                                    targetUserId: id, permissionKey: ovrForm.permissionKey, effect: ovrForm.effect, unitId: ovrForm.unitId || null,
                                    scope: (ovrForm.scope || null) as never, expiresAt: ovrForm.expiresAt ? new Date(ovrForm.expiresAt + 'T23:59:59').toISOString() : null, reason: ovrForm.reason,
                                }), 'Exception saved.')}><Plus className="h-4 w-4" /> Add</Btn>
                        </div>
                    )}
                </Card>
            </div>

            <Card title="What this person actually gets" actions={
                <select className={`${inputCls} !py-1 text-xs max-w-[220px]`} value={eff?.unitId ?? ''} onChange={(e) => setViewUnit(e.target.value)}>
                    {d.effective.map((e) => <option key={e.unitId} value={e.unitId}>{e.unitName}</option>)}
                </select>
            }>
                {eff && (
                    <div className="space-y-4">
                        {!eff.provisioned && <Notice kind="info">Not provisioned in this unit yet — they work exactly as before under the legacy rules.</Notice>}
                        <div>
                            <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Apps ({eff.modules.length})</div>
                            <div className="flex flex-wrap gap-1">{eff.modules.map((m) => <Chip key={m} tone="blue">{m.replace(/_/g, ' ')}</Chip>)}</div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1 flex items-center gap-1"><Eye className="h-3 w-3" /> Their sidebar</div>
                                <div className="border border-gray-100 rounded-xl p-3 max-h-72 overflow-auto text-sm">
                                    {eff.nav.length === 0 && <div className="text-gray-400">Nothing.</div>}
                                    {eff.nav.map((s) => (
                                        <div key={s.title} className="mb-2">
                                            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{s.title}</div>
                                            {s.items.map((i) => <div key={i.href} className="text-gray-700 pl-2">{i.label}</div>)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Permissions ({eff.permissions.length})</div>
                                <div className="border border-gray-100 rounded-xl p-3 max-h-72 overflow-auto">
                                    {eff.isAdmin && <Chip tone="violet">Administrator — everything enabled in this unit</Chip>}
                                    {eff.permissions.map((p) => <div key={p.key} className="flex justify-between text-xs py-0.5"><span className="font-mono text-gray-700">{p.key}</span><span className="text-gray-400">{p.scope.toLowerCase()}</span></div>)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            <Card title="History">
                {log.length === 0 ? <div className="text-sm text-gray-400">No changes recorded.</div> : (
                    <div className="space-y-1.5">
                        {log.map((l) => (
                            <div key={l.id} className="text-xs flex gap-3 border-b border-gray-50 pb-1.5">
                                <span className="text-gray-400 w-40 shrink-0">{fmt(l.at)}</span>
                                <span className="font-semibold text-gray-700 w-36 shrink-0">{String(l.change.event)}</span>
                                <span className="text-gray-500">by {l.actor}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </AdminPage>
    );
}

function Info({ k, v }: { k: string; v: string }) {
    return <div><div className="text-[10px] uppercase text-gray-400 font-semibold">{k}</div><div className="font-semibold text-gray-800">{v}</div></div>;
}
