'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { listChangeLogAction } from '@/app/actions/access-admin-actions';
import { AccessTabs, Card, Chip, Notice, fmt } from '../ui';

type Log = Extract<Awaited<ReturnType<typeof listChangeLogAction>>, { success: true }>['data'];

function describe(c: Record<string, unknown>): string {
    const g = (k: string) => (c[k] === undefined || c[k] === null ? '' : String(c[k]));
    switch (c.event) {
        case 'user.create': return `created ${g('username')} (${g('employeeCode')}) as ${g('primaryRole')}`;
        case 'user.offboard': return `offboarded — ${g('reason')} (${g('rolesEnded')} role(s) ended, ${g('overridesRevoked')} override(s) revoked)`;
        case 'user.import': return `imported users — ${g('created')} created, ${g('failed')} failed`;
        case 'role.assign': return `assigned ${g('role')}${c.unitId ? '' : ' to all units'}`;
        case 'role.revoke': return `revoked ${g('role')}`;
        case 'role.create': return `created role ${g('name')} (${g('permissions')} permissions)`;
        case 'role.update': return `edited role ${g('name')} (+${(c.added as unknown[] | undefined)?.length ?? 0} / −${(c.removed as unknown[] | undefined)?.length ?? 0}, ${g('holders')} holder(s))`;
        case 'role.delete': return `deleted role ${g('name')}`;
        case 'override.grant': return `granted ${g('permission')} — “${g('reason')}”`;
        case 'override.deny': return `denied ${g('permission')} — “${g('reason')}”`;
        case 'override.remove': return `removed ${g('effect').toLowerCase()} on ${g('permission')}`;
        case 'backfill-company-os': return 'initial company backfill';
        default: return JSON.stringify(c);
    }
}

export default function AccessLogPage() {
    const [rows, setRows] = useState<Log | null>(null);
    const [error, setError] = useState('');
    useEffect(() => { listChangeLogAction({ limit: 300 }).then((r) => (r.success ? setRows(r.data) : setError(r.error))); }, []);

    return (
        <AdminPage pageTitle="Access Control" pageIcon={<KeyRound className="h-5 w-5" />}>
            <AccessTabs active="log" />
            {error && <Notice kind="error">{error}</Notice>}
            <Card>
                {!rows ? <div className="py-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                    : rows.length === 0 ? <div className="text-sm text-gray-400">Nothing recorded yet.</div> : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400"><th className="py-2 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">Change</th><th>Affected user</th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id} className="border-t border-gray-100 align-top">
                                        <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{fmt(r.at)}</td>
                                        <td className="pr-3 text-gray-700">{r.actor}</td>
                                        <td className="pr-3"><Chip>{String(r.change.event)}</Chip> <span className="text-gray-700">{describe(r.change)}</span></td>
                                        <td className="text-gray-600">{r.target ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </Card>
        </AdminPage>
    );
}
