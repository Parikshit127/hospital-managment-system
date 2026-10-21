'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Plus, Search, Loader2, ShieldCheck } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { getAccessOverviewAction, listAccessUsersAction } from '@/app/actions/access-admin-actions';
import { AccessTabs, Btn, Card, Chip, Notice, inputCls } from '../ui';

type Overview = Extract<Awaited<ReturnType<typeof getAccessOverviewAction>>, { success: true }>['data'];
type Row = Extract<Awaited<ReturnType<typeof listAccessUsersAction>>, { success: true }>['data'][number];

export default function AccessUsersPage() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [unitId, setUnitId] = useState('');
    const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');

    const load = useCallback(async () => {
        setLoading(true);
        const [o, l] = await Promise.all([getAccessOverviewAction(), listAccessUsersAction({ q: q || undefined, unitId: unitId || undefined, status })]);
        if (!o.success) setError(o.error); else { setOverview(o.data); setError(''); }
        if (l.success) setRows(l.data); else setError((e) => e || l.error);
        setLoading(false);
    }, [q, unitId, status]);

    useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

    return (
        <AdminPage
            pageTitle="Access Control"
            pageIcon={<KeyRound className="h-5 w-5" />}
            headerActions={<Btn href="/admin/access/users/new"><Plus className="h-4 w-4" /> Add user</Btn>}
        >
            <AccessTabs active="users" />
            {error && <Notice kind="error">{error}</Notice>}

            {overview && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        ['Active users', overview.activeUsers],
                        ['With access roles', `${overview.usersWithAccessRoles} / ${overview.activeUsers}`],
                        ['Units', overview.units.length],
                        ['Company owners', overview.companyOwners],
                    ].map(([label, v]) => (
                        <div key={String(label)} className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
                            <div className="text-xl font-extrabold text-gray-900">{v}</div>
                        </div>
                    ))}
                </div>
            )}
            {overview && overview.usersWithAccessRoles < overview.activeUsers && (
                <Notice kind="info">
                    {overview.activeUsers - overview.usersWithAccessRoles} active user(s) have no access role yet. They keep working exactly as before; the Company-OS
                    backfill (<code>scripts/backfill-company-os.ts</code>) assigns roles to existing users.
                </Notice>
            )}

            <Card>
                <div className="flex flex-wrap gap-3 mb-4">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                        <input className={`${inputCls} pl-9`} placeholder="Search name or username" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <select className={`${inputCls} max-w-[220px]`} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                        <option value="">All units</option>
                        {overview?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <select className={`${inputCls} max-w-[160px]`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                        <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
                    </select>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">No users match.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                                    <th className="py-2 pr-3">User</th><th className="pr-3">Code</th><th className="pr-3">Home unit</th><th className="pr-3">Access roles</th><th className="pr-3">Overrides</th><th className="pr-3">Status</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                        <td className="py-2.5 pr-3">
                                            <div className="font-semibold text-gray-900">{r.name ?? r.username}</div>
                                            <div className="text-xs text-gray-400">{r.username} · {r.legacyRole}</div>
                                        </td>
                                        <td className="pr-3 text-gray-600">{r.employeeCode ?? '—'}</td>
                                        <td className="pr-3 text-gray-600">{r.homeUnit}</td>
                                        <td className="pr-3">
                                            <div className="flex flex-wrap gap-1">
                                                {r.roles.length === 0 && <Chip tone="gray">none yet</Chip>}
                                                {r.roles.map((x) => (
                                                    <Chip key={x.id} tone={x.templateKey === 'admin' ? 'violet' : x.templateKey?.startsWith('custom:') ? 'orange' : 'blue'}>
                                                        {x.name.replace(' (access template)', '')}{x.unitId === null ? ' · all units' : ''}
                                                    </Chip>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="pr-3 text-gray-600">{r.overrides || '—'}</td>
                                        <td className="pr-3">{r.active ? <Chip tone="green">Active</Chip> : <Chip tone="red">Inactive</Chip>}</td>
                                        <td className="text-right"><Link href={`/admin/access/users/${r.id}`} className="text-orange-600 font-semibold hover:underline">Manage</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="mt-3 text-[11px] text-gray-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Showing up to 500 users in your company.</div>
            </Card>
        </AdminPage>
    );
}
