'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { createCustomRoleAction, deleteCustomRoleAction, listRolesForEditorAction, updateCustomRoleAction } from '@/app/actions/access-admin-actions';
import { AccessTabs, Btn, Card, Chip, Field, Notice, inputCls, prettyKey } from '../ui';

type Data = Extract<Awaited<ReturnType<typeof listRolesForEditorAction>>, { success: true }>['data'];
type Role = Data['roles'][number];

export default function RolesPage() {
    const [data, setData] = useState<Data | null>(null);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');
    const [busy, setBusy] = useState(false);
    const [sel, setSel] = useState<string>('');           // selected role id, or 'new'
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [keys, setKeys] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        const r = await listRolesForEditorAction();
        if (!r.success) return setError(r.error);
        setData(r.data);
    }, []);
    useEffect(() => { load(); }, [load]);

    const role: Role | undefined = data?.roles.find((r) => r.id === sel);
    const editable = sel === 'new' || !!role?.custom;
    const pick = (r: Role | 'new') => {
        setError(''); setOk('');
        if (r === 'new') { setSel('new'); setName(''); setDesc(''); setKeys(new Set()); return; }
        setSel(r.id); setName(r.name); setDesc(r.description ?? ''); setKeys(new Set(r.permissions));
    };

    // what the editor can show per catalogue permission: held directly, or via its legacy key (cloned system roles)
    const grantable = useMemo(() => new Map((data?.catalogue ?? []).flatMap((m) => m.permissions.map((p) => [p.key, p.grantable] as const))), [data]);

    const toggle = (k: string) => setKeys((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

    const run = async (fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>, done: string, after?: (d: unknown) => void) => {
        setBusy(true); setError(''); setOk('');
        const r = await fn();
        setBusy(false);
        if (!r.success) return setError((r as { error: string }).error);
        setOk(done); after?.(r.data); await load();
    };

    const save = () => sel === 'new'
        ? run(() => createCustomRoleAction({ name, description: desc, permissionKeys: [...keys] }), 'Role created.', (d) => setSel((d as { id: string }).id))
        : run(() => updateCustomRoleAction(sel, { name, description: desc, permissionKeys: [...keys] }), 'Role saved. Everyone holding it is refreshed immediately.');

    if (error && !data) return <AdminPage pageTitle="Access Control" pageIcon={<KeyRound className="h-5 w-5" />}><Notice kind="error">{error}</Notice></AdminPage>;
    if (!data) return <AdminPage pageTitle="Access Control" pageIcon={<KeyRound className="h-5 w-5" />}><div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div></AdminPage>;

    const system = data.roles.filter((r) => !r.custom);
    const custom = data.roles.filter((r) => r.custom);

    return (
        <AdminPage pageTitle="Access Control" pageIcon={<KeyRound className="h-5 w-5" />}>
            <AccessTabs active="roles" />
            {error && <Notice kind="error">{error}</Notice>}
            {ok && <Notice kind="ok">{ok}</Notice>}

            <div className="grid lg:grid-cols-[300px_1fr] gap-6">
                <div className="space-y-4">
                    <Card title="Custom roles" actions={<Btn small onClick={() => pick('new')}><Plus className="h-3 w-3" /> New</Btn>}>
                        {custom.length === 0 && <div className="text-sm text-gray-400">None yet.</div>}
                        {custom.map((r) => <RoleRow key={r.id} r={r} active={sel === r.id} onClick={() => pick(r)} />)}
                    </Card>
                    <Card title="Standard roles">
                        {system.map((r) => <RoleRow key={r.id} r={r} active={sel === r.id} onClick={() => pick(r)} />)}
                    </Card>
                </div>

                <Card title={sel === 'new' ? 'New custom role' : role ? role.name.replace(' (access template)', '') : 'Select a role'}
                    actions={role && (
                        <>
                            {!role.isAdmin && <Btn small kind="ghost" onClick={() => run(() => createCustomRoleAction({ name: `${role.name.replace(' (access template)', '')} copy`, cloneFromRoleId: role.id }), 'Copied — find it under Custom roles.')}><Copy className="h-3 w-3" /> Clone</Btn>}
                            {role.custom && <Btn small kind="danger" disabled={role.users > 0} onClick={() => run(() => deleteCustomRoleAction(role.id), 'Role deleted.', () => setSel(''))}><Trash2 className="h-3 w-3" /> Delete</Btn>}
                        </>
                    )}>
                    {!sel && <div className="text-sm text-gray-400">Pick a role on the left, or create a new one.</div>}
                    {sel && (
                        <div className="space-y-5">
                            {!editable && (
                                <Notice kind="info"><Lock className="h-3.5 w-3.5 inline mr-1" />
                                    {role?.isAdmin ? 'The administrator role holds every permission in its unit and cannot be edited.' : 'Standard roles are read-only. Clone one to make your own version.'}
                                </Notice>
                            )}
                            <div className="grid md:grid-cols-2 gap-4 max-w-2xl">
                                <Field label="Name"><input className={inputCls} disabled={!editable} value={name} onChange={(e) => setName(e.target.value)} /></Field>
                                <Field label="Description"><input className={inputCls} disabled={!editable} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
                            </div>

                            {role && !role.isAdmin && !editable && (
                                <div>
                                    <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Permissions ({role.permissions.length})</div>
                                    <div className="flex flex-wrap gap-1">{role.permissions.map((k) => <Chip key={k}>{k}</Chip>)}</div>
                                </div>
                            )}

                            {editable && data.catalogue.map((m) => (
                                <div key={m.module}>
                                    <div className="text-sm font-bold text-gray-800 mb-1">{m.name}</div>
                                    <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">
                                        {m.permissions.map((p) => {
                                            const can = grantable.get(p.key) !== false || keys.has(p.key);
                                            return (
                                                <label key={p.key} className={`flex items-start gap-2 text-sm py-1 ${can ? '' : 'opacity-40'}`} title={can ? p.description : 'You can only grant permissions you hold yourself'}>
                                                    <input type="checkbox" className="mt-1" checked={keys.has(p.key)} disabled={!can} onChange={() => toggle(p.key)} />
                                                    <span><span className="font-semibold text-gray-700">{prettyKey(p.key.split('.').slice(1).join('.'))}</span><span className="block text-[11px] text-gray-400">{p.description}</span></span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {editable && <p className="text-[11px] text-gray-400">Apps not listed here (nursing, lab, OT, …) are still governed by the standard roles until they are brought into this model.</p>}

                            {editable && (
                                <div className="flex gap-2 pt-1">
                                    <Btn busy={busy} onClick={save}><Save className="h-4 w-4" /> {sel === 'new' ? 'Create role' : 'Save changes'}</Btn>
                                    {role && <span className="text-xs text-gray-400 self-center">{role.users} assignment(s)</span>}
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </AdminPage>
    );
}

function RoleRow({ r, active, onClick }: { r: Role; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`w-full text-left px-3 py-2 rounded-xl mb-1 border ${active ? 'border-orange-300 bg-orange-50' : 'border-transparent hover:bg-gray-50'}`}>
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">{r.name.replace(' (access template)', '')}{!r.active && <Chip tone="red">off</Chip>}{r.isAdmin && <Chip tone="violet">admin</Chip>}</div>
            <div className="text-[11px] text-gray-400">{r.isAdmin ? 'everything' : `${r.permissions.length} permissions`} · {r.users} assigned</div>
        </button>
    );
}
