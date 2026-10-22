import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Divider, ErrorBox, Field, Loader, Pill, Row, Screen, SectionTitle, Segmented, T, errText } from '@/components/ui';
import { EmployeePicker } from '@/components/EmployeePicker';
import { fmtHours, fmtLong, fmtShort, fmtTime } from '@/utils/dates';
import { notify, useInvalidate } from '@/utils/hooks';
import { space, statusTone, useTheme } from '@/theme';

const TYPES = [
    { value: 'PERMANENT', label: 'Perm.' }, { value: 'CONTRACT', label: 'Contract' }, { value: 'CONSULTANT_VISITING', label: 'Visiting' },
    { value: 'CONSULTANT_RETAINER', label: 'Retainer' }, { value: 'INTERN', label: 'Intern' },
];

export default function EmployeeDetail() {
    const t = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const empId = Number(id);
    const { me } = useAuth();
    const canEdit = !!me?.capabilities.hrEdit;
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['hr', 'employee', empId], queryFn: () => hrApi.employee(empId).then(r => r.data) });
    const e = q.data;

    const [edit, setEdit] = useState(false);
    const [f, setF] = useState({ designation: '', phone: '', email: '', employmentType: 'PERMANENT', isActive: true, reportingManagerId: null as number | null, managerName: '' });
    const [picker, setPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (e) setF({
            designation: e.designation, phone: e.phone ?? '', email: e.email ?? '', employmentType: e.employment_type, isActive: e.is_active,
            reportingManagerId: e.reporting_manager_id, managerName: e.reporting_manager?.name ?? '',
        });
    }, [e]);

    const save = useMutation({
        mutationFn: () => hrApi.updateEmployee(empId, {
            designation: f.designation, phone: f.phone, email: f.email, employmentType: f.employmentType, isActive: f.isActive,
            reportingManagerId: f.reportingManagerId,
        }),
        onSuccess: async () => { setEdit(false); await invalidate('hr'); notify('Saved'); },
        onError: (er) => setError(errText(er)),
    });

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading} keyboard edges={[]}>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : e ? (
                <>
                    <Card style={{ gap: space.sm }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                            <T v="h1">{e.name}</T>
                            <Pill label={e.is_active ? 'Active' : 'Inactive'} tone={e.is_active ? 'ok' : 'danger'} />
                        </Row>
                        <T v="sub">{e.employee_code} · {e.designation}</T>
                        {e.user ? <T v="sub">Login: @{e.user.username} ({e.user.role})</T> : <T v="sub" color={t.warn}>No login linked</T>}
                        <Divider />
                        <T>Phone: {e.phone || '—'}</T>
                        <T>Email: {e.email || '—'}</T>
                        <T>Joined: {fmtLong(e.date_of_joining.slice(0, 10))}</T>
                        <T>Type: {e.employment_type.replace(/_/g, ' ').toLowerCase()}</T>
                        <T>Reports to: {e.reporting_manager ? `${e.reporting_manager.name} (${e.reporting_manager.employee_code})` : '—'}</T>
                        {typeof e.salary_basic === 'number' && e.salary_basic > 0 ? <T>Basic salary: ₹{e.salary_basic.toLocaleString('en-IN')}</T> : null}
                        {canEdit && !edit ? <Button title="Edit" variant="secondary" onPress={() => setEdit(true)} /> : null}
                    </Card>

                    {edit ? (
                        <Card style={{ gap: space.md }}>
                            <T v="h2">Edit employee</T>
                            <Field label="Designation" value={f.designation} onChangeText={v => setF(s => ({ ...s, designation: v }))} />
                            <Field label="Phone" value={f.phone} onChangeText={v => setF(s => ({ ...s, phone: v }))} keyboardType="phone-pad" />
                            <Field label="Email" value={f.email} onChangeText={v => setF(s => ({ ...s, email: v }))} keyboardType="email-address" autoCapitalize="none" />
                            <T v="label">Employment type</T>
                            <Segmented value={f.employmentType} options={TYPES} onChange={v => setF(s => ({ ...s, employmentType: v }))} />
                            <T v="label">Reports to</T>
                            <Button title={f.managerName || (f.reportingManagerId ? `Employee #${f.reportingManagerId}` : 'Choose manager')} variant="secondary" onPress={() => setPicker(true)} />
                            {f.reportingManagerId ? <Button title="Remove manager" variant="ghost" onPress={() => setF(s => ({ ...s, reportingManagerId: null, managerName: '' }))} /> : null}
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T>Active</T>
                                <Switch value={f.isActive} onValueChange={v => setF(s => ({ ...s, isActive: v }))} trackColor={{ true: t.primary }} />
                            </Row>
                            {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                            <Button title="Save changes" loading={save.isPending} onPress={() => { setError(null); save.mutate(); }} />
                            <Button title="Cancel" variant="ghost" onPress={() => setEdit(false)} />
                        </Card>
                    ) : null}

                    <SectionTitle>Recent attendance</SectionTitle>
                    <Card style={{ gap: space.sm }}>
                        {e.attendances.length ? e.attendances.slice(0, 10).map(a => (
                            <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                                <T>{fmtShort(a.date.slice(0, 10))}</T>
                                <Pill label={a.status} tone={statusTone(a.status)} />
                                <T v="sub">{fmtTime(a.check_in)} – {fmtTime(a.check_out)} · {fmtHours(a.total_hours)}</T>
                            </Row>
                        )) : <T v="sub">No attendance yet.</T>}
                    </Card>

                    <SectionTitle>Recent leave</SectionTitle>
                    <Card style={{ gap: space.sm }}>
                        {e.leave_requests.length ? e.leave_requests.map(l => (
                            <Row key={l.id} style={{ justifyContent: 'space-between' }}>
                                <T>{l.leave_type.name}</T>
                                <T v="sub">{fmtShort(l.from_date.slice(0, 10))} · {l.days}d</T>
                                <Pill label={l.status} tone={statusTone(l.status)} />
                            </Row>
                        )) : <T v="sub">No leave.</T>}
                    </Card>

                    <EmployeePicker
                        visible={picker} onClose={() => setPicker(false)} title="Choose reporting manager"
                        onPick={m => m.id === empId ? notify('Not allowed', 'An employee cannot report to themselves.') : setF(s => ({ ...s, reportingManagerId: m.id, managerName: m.name }))}
                    />
                </>
            ) : null}
        </Screen>
    );
}
