'use client';

import React, { useState } from 'react';
import { Download, KeyRound, Upload } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { commitUserImportAction, previewUserImportAction } from '@/app/actions/access-admin-actions';
import { AccessTabs, Btn, Card, Chip, Notice, inputCls } from '../ui';

type Preview = Extract<Awaited<ReturnType<typeof previewUserImportAction>>, { success: true }>['data'];
type Results = Extract<Awaited<ReturnType<typeof commitUserImportAction>>, { success: true }>['data'];

const TEMPLATE = 'name,username,email,phone,role,unit,employee_code,designation\nAsha Rao,,asha@example.com,9800000000,receptionist,main-hospital,,Front desk\n';

const download = (name: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

export default function ImportPage() {
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [results, setResults] = useState<Results | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');

    const onFile = async (f: File | undefined) => {
        if (!f) return;
        setCsv(await f.text()); setPreview(null); setResults(null); setError('');
    };
    const doPreview = async () => {
        setBusy('p'); setError(''); setResults(null);
        const r = await previewUserImportAction(csv);
        setBusy('');
        if (!r.success) { setPreview(null); return setError(r.error); }
        setPreview(r.data);
    };
    const doCommit = async () => {
        setBusy('c'); setError('');
        const r = await commitUserImportAction(csv);
        setBusy('');
        if (!r.success) return setError(r.error);
        setResults(r.data); setPreview(null);
    };

    const good = preview?.rows.filter((r) => r.ok).length ?? 0;
    const bad = (preview?.rows.length ?? 0) - good;

    return (
        <AdminPage pageTitle="Access Control" pageIcon={<KeyRound className="h-5 w-5" />}>
            <AccessTabs active="import" />
            {error && <Notice kind="error">{error}</Notice>}

            <Card title="Bulk import users" actions={<Btn small kind="ghost" onClick={() => download('users-template.csv', TEMPLATE)}><Download className="h-3 w-3" /> Template</Btn>}>
                <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                        Columns: <code>name, username, email, phone, role, unit, employee_code, designation</code>. Only <b>name, role and unit</b> are required.
                        <code> role</code> is a standard role key (e.g. <code>nurse</code>, <code>receptionist</code>); <code>unit</code> is the unit’s slug or name.
                        You can only import roles you are allowed to grant.
                    </p>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 cursor-pointer"><Upload className="h-4 w-4" /> Choose a CSV file
                        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </label>
                    <textarea className={`${inputCls} font-mono text-xs h-40`} placeholder="…or paste CSV here" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setResults(null); }} />
                    <Btn busy={busy === 'p'} disabled={!csv.trim()} onClick={doPreview}>Check file</Btn>
                </div>
            </Card>

            {preview && (
                <Card title={`Preview — ${good} ready, ${bad} with problems`} actions={<Btn busy={busy === 'c'} disabled={bad > 0 || good === 0} onClick={doCommit}>Create {good} user(s)</Btn>}>
                    {bad > 0 && <div className="mb-3"><Notice kind="error">Fix the highlighted rows and check the file again. Nothing is created until every row is valid.</Notice></div>}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400"><th className="py-2 pr-3">Line</th><th className="pr-3">Name</th><th className="pr-3">Role</th><th className="pr-3">Unit</th><th>Result</th></tr></thead>
                            <tbody>
                                {preview.rows.map((r) => (
                                    <tr key={r.line} className={`border-t border-gray-100 ${r.ok ? '' : 'bg-red-50/50'}`}>
                                        <td className="py-2 pr-3 text-gray-400">{r.line}</td><td className="pr-3">{r.data.name}</td><td className="pr-3">{r.data.role}</td><td className="pr-3">{r.data.unit}</td>
                                        <td>{r.ok ? <Chip tone="green">ok</Chip> : <span className="text-red-700 text-xs">{r.errors.join('; ')}</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {results && (
                <Card title="Import finished" actions={
                    <Btn small onClick={() => download('imported-users.csv', 'username,employee_code,temporary_password,error\n' + results.map((r) => [r.username, r.employeeCode, r.temporaryPassword ?? '', r.error ?? ''].join(',')).join('\n'))}><Download className="h-3 w-3" /> Download credentials</Btn>
                }>
                    <Notice kind="ok">{results.filter((r) => !r.error).length} created, {results.filter((r) => r.error).length} failed. The temporary passwords are shown only now — download them before leaving this page.</Notice>
                    <table className="w-full text-sm mt-3">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400"><th className="py-2 pr-3">Line</th><th className="pr-3">Username</th><th className="pr-3">Code</th><th>Temporary password</th></tr></thead>
                        <tbody>
                            {results.map((r) => (
                                <tr key={r.line} className="border-t border-gray-100">
                                    <td className="py-2 pr-3 text-gray-400">{r.line}</td><td className="pr-3 font-mono">{r.username}</td><td className="pr-3 font-mono">{r.employeeCode}</td>
                                    <td className="font-mono">{r.error ? <span className="text-red-700 font-sans text-xs">{r.error}</span> : r.temporaryPassword}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </AdminPage>
    );
}
