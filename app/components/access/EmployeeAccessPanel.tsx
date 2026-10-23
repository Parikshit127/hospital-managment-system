'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Power, ShieldAlert } from 'lucide-react';
import {
    createLoginForEmployeeAction, getAccessEditorSetupAction, getEmployeeAccessAction, resetEmployeeAccessAction, saveEmployeeAccessAction,
    resetEmployeePasswordAction, setEmployeeLoginActiveAction,
} from '@/app/actions/access-profile-actions';
import type { AccessProfileValue } from '@/app/lib/access/presets';
import { AccessProfileEditor, type EditorSetup } from './AccessProfileEditor';

type Access = Extract<Awaited<ReturnType<typeof getEmployeeAccessAction>>, { success: true }>['data'];
type Created = { username: string; temporaryPassword: string | null };

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500';
const primaryBtn = 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtn = 'inline-flex items-center justify-center gap-2 px-3 py-2 bg-white text-gray-700 text-sm font-bold rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50';

/**
 * "Login & Access" for one employee: create the login, choose modules and permissions, reset, switch the login
 * on/off. Used on the HR employee page and on the Admin → Access Control user page.
 */
export function EmployeeAccessPanel({ employeeId, onChanged }: { employeeId: number; onChanged?: () => void }) {
    const [setup, setSetup] = useState<EditorSetup | null>(null);
    const [data, setData] = useState<Access | null>(null);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');
    const [busy, setBusy] = useState('');
    const [value, setValue] = useState<AccessProfileValue | null>(null);
    const [baseline, setBaseline] = useState<AccessProfileValue | null>(null);
    const [note, setNote] = useState('');
    const [login, setLogin] = useState({ username: '', password: '' });
    const [created, setCreated] = useState<Created | null>(null);
    const [copied, setCopied] = useState(false);
    const [newPw, setNewPw] = useState<string | null>(null);

    const load = useCallback(async () => {
        const [s, a] = await Promise.all([getAccessEditorSetupAction(), getEmployeeAccessAction(employeeId)]);
        if (!s.success) return setError(s.error);
        if (!a.success) return setError(a.error);
        setSetup(s.data); setData(a.data);
        const start: AccessProfileValue = a.data.current ?? { preset: '', modules: [], permissions: {} }; // new login: nothing chosen until a base role is picked
        setValue(start); setBaseline(start); setNote(a.data.profile?.note ?? '');
    }, [employeeId]);
    useEffect(() => { load(); }, [load]);

    const act = async (label: string, fn: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(label); setError(''); setOk('');
        const r = await fn();
        setBusy('');
        if (!r.success) { setError((r as { error: string }).error); return false; }
        setOk(done); await load(); onChanged?.();
        return true;
    };

    if (!setup || !data || !value || !baseline) {
        return <div className="py-10 text-center text-gray-400">{error ? <span className="text-red-600 text-sm">{error}</span> : <Loader2 className="h-5 w-5 animate-spin inline" />}</div>;
    }
    const canAssign = setup.actor.canAssign;
    const user = data.user;

    const banner = (
        <>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-2.5 rounded-xl">{error}</div>}
            {ok && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-4 py-2.5 rounded-xl">{ok}</div>}
        </>
    );

    // ── no login yet ──
    if (!user) {
        if (created) {
            return (
                <div className="space-y-3 max-w-lg">
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-4 py-2.5 rounded-xl">
                        Login created. Share these details securely — the password is shown only once.
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Username</div><div className="font-mono font-bold">{created.username}</div></div>
                        {created.temporaryPassword && (
                            <div>
                                <div className="text-[10px] uppercase text-gray-400 font-semibold">Temporary password</div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold">{created.temporaryPassword}</span>
                                    <button className={ghostBtn} onClick={() => { navigator.clipboard?.writeText(created.temporaryPassword!); setCopied(true); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return (
            <div className="space-y-5">
                {banner}
                <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    <KeyRound className="h-5 w-5 shrink-0 mt-0.5 text-gray-400" />
                    <div>This employee has no system login yet, so they cannot sign in to the web portal or the mobile app.{canAssign ? ' Create one below and choose exactly what they can open.' : ' Ask an administrator or HR to create one.'}</div>
                </div>
                {canAssign && (
                    <>
                        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
                            <label className="block"><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Username</span>
                                <input className={inputCls} value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} placeholder="Defaults to the employee code" /></label>
                            <label className="block"><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Password</span>
                                <input className={inputCls} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Leave blank to generate one" /></label>
                        </div>
                        <AccessProfileEditor setup={setup} value={value} baseline={{ preset: '', modules: [], permissions: {} }} onChange={setValue} personName={data.employee.name} />
                        <button className={primaryBtn} disabled={!!busy || !value.preset}
                            onClick={async () => {
                                setBusy('login'); setError(''); setOk('');
                                const r = await createLoginForEmployeeAction(employeeId, { username: login.username || undefined, password: login.password || undefined, profile: { preset: value.preset, modules: value.modules, permissions: value.permissions } });
                                setBusy('');
                                if (!r.success) return setError(r.error);
                                setCreated({ username: r.data.username, temporaryPassword: r.data.temporaryPassword });
                                onChanged?.();
                            }}>
                            {busy === 'login' && <Loader2 className="h-4 w-4 animate-spin" />} Create login
                        </button>
                    </>
                )}
            </div>
        );
    }

    // ── has a login ──
    const managed = !!data.profile;
    const targetIsAdmin = user.role === 'admin';
    const unknownRole = !data.current;
    const dirty = JSON.stringify(value) !== JSON.stringify(baseline) || note !== (data.profile?.note ?? '');

    return (
        <div className="space-y-5">
            {banner}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Username</div><div className="font-mono font-bold">{user.username}</div></div>
                    <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Login</div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{user.is_active ? 'Active' : 'Switched off'}</span></div>
                    <div><div className="text-[10px] uppercase text-gray-400 font-semibold">Access</div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${managed ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {managed ? `Custom profile · ${data.profile!.modules.length} module(s)` : `Following the ${user.role.replace(/_/g, ' ')} role`}</span></div>
                </div>
                {canAssign && !targetIsAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                    <button className={ghostBtn} disabled={!!busy}
                        onClick={async () => {
                            if (!confirm('Generate a new password for this login? The old one stops working immediately.')) return;
                            setBusy('pw'); setError(''); setOk(''); setNewPw(null);
                            const r = await resetEmployeePasswordAction(employeeId);
                            setBusy('');
                            if (!r.success) return setError(r.error);
                            setNewPw(r.data.temporaryPassword);
                        }}>
                        <KeyRound className="h-4 w-4" /> Reset password
                    </button>
                    <button className={ghostBtn} disabled={!!busy}
                        onClick={() => { if (confirm(user.is_active ? 'Switch this login off? They will be signed out within minutes.' : 'Switch this login back on?')) act('active', () => setEmployeeLoginActiveAction(employeeId, !user.is_active), user.is_active ? 'Login switched off.' : 'Login switched on.'); }}>
                        <Power className="h-4 w-4" /> {user.is_active ? 'Switch login off' : 'Switch login on'}
                    </button>
                    </div>
                )}
            </div>

            {newPw && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <span>New password for <b className="font-mono">{user.username}</b> (shown once):</span>
                    <span className="font-mono font-bold text-base">{newPw}</span>
                    <button className={ghostBtn} onClick={() => { navigator.clipboard?.writeText(newPw); setCopied(true); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </div>
            )}

            {targetIsAdmin ? (
                <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                    <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>This is an administrator account. Administrators are managed in <b>Admin → Access Control</b>.</div>
                </div>
            ) : unknownRole ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">This login uses the role “{user.role}”, which has no module template. It keeps working as before; choose a base role from an administrator account to switch it to a profile.</div>
            ) : (
                <>
                    {!managed && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            Right now this person simply follows the <b>{user.role.replace(/_/g, ' ')}</b> role, exactly as before. The modules below show what that role gives. Change anything and save to give them their own access profile.
                        </div>
                    )}
                    {!data.canEdit && canAssign && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">You cannot change this person’s access (it includes rights only an administrator can change, or it is your own login).</div>
                    )}
                    <AccessProfileEditor setup={setup} value={value} baseline={baseline} onChange={setValue} readOnly={!canAssign || !data.canEdit} personName={data.employee.name} />
                    {canAssign && data.canEdit && (
                        <div className="space-y-3">
                            <label className="block max-w-xl"><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Note (optional)</span>
                                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this person has this access" /></label>
                            <div className="flex flex-wrap items-center gap-3">
                                <button className={primaryBtn} disabled={!!busy || (!dirty && managed)}
                                    onClick={() => act('save', () => saveEmployeeAccessAction(user.id, { preset: value.preset, modules: value.modules, permissions: value.permissions, note }), 'Access saved. It applies the next time they sign in, or within about 5 minutes if they are signed in now.')}>
                                    {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} {managed ? 'Save access' : 'Save as custom profile'}
                                </button>
                                {managed && (
                                    <button className={ghostBtn} disabled={!!busy}
                                        onClick={() => { if (confirm('Remove the custom profile? They go back to following the base role only.')) act('reset', () => resetEmployeeAccessAction(user.id), 'Back to the base role.'); }}>
                                        Remove custom profile
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {data.history.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Recent changes</div>
                    <div className="space-y-1">
                        {data.history.map((h, i) => (
                            <div key={i} className="text-xs text-gray-600 flex gap-3"><span className="text-gray-400 w-36 shrink-0">{new Date(h.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="font-semibold">{h.event}</span><span className="text-gray-400">by {h.by}</span></div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
