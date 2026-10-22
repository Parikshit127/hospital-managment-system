import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi, teamApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Empty, ErrorBox, Loader, Pill, Row, Screen, Segmented, T, errText } from '@/components/ui';
import { DecisionSheet } from '@/components/DecisionSheet';
import { fmtShort, fmtTime } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { space, statusTone } from '@/theme';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';
type Target = { kind: 'leave' | 'fix'; id: number; title: string; subtitle: string; decision: 'Approved' | 'Rejected' };

export default function Requests() {
    const { me } = useAuth();
    const canApprove = !!me?.capabilities.hrApprove;
    const invalidate = useInvalidate();
    const [kind, setKind] = useState<'leave' | 'fix'>('leave');
    const [filter, setFilter] = useState<Filter>('pending');
    const [target, setTarget] = useState<Target | null>(null);

    const leave = useQuery({ queryKey: ['hr', 'leave-requests', filter], enabled: kind === 'leave', queryFn: () => hrApi.leaveRequests(filter).then(r => r.data) });
    const fixes = useQuery({ queryKey: ['hr', 'fix-requests', filter], enabled: kind === 'fix', queryFn: () => hrApi.regularizations(filter).then(r => r.data) });
    const active = kind === 'leave' ? leave : fixes;

    const decide = useMutation({
        mutationFn: ({ t, note }: { t: Target; note: string }) =>
            t.kind === 'leave' ? teamApi.reviewLeave(t.id, t.decision, note) : teamApi.reviewFix(t.id, t.decision, note),
        onSuccess: async () => { setTarget(null); await invalidate('hr', 'workspace', 'team'); },
        onError: (e) => { setTarget(null); notify('Could not save', errText(e)); },
    });
    const cancelLeave = useMutation({
        mutationFn: (id: number) => hrApi.cancelLeave(id),
        onSuccess: () => invalidate('hr', 'workspace'),
        onError: (e) => notify('Could not cancel', errText(e)),
    });

    return (
        <Screen onRefresh={() => active.refetch()} refreshing={active.isRefetching && !active.isLoading} edges={[]}>
            <Segmented value={kind} onChange={setKind} options={[{ value: 'leave', label: 'Leave' }, { value: 'fix', label: 'Attendance fixes' }]} />
            <Segmented
                value={filter} onChange={setFilter}
                options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]}
            />

            {active.isLoading ? <Loader /> : active.error ? <ErrorBox error={active.error} onRetry={() => active.refetch()} /> : null}

            {kind === 'leave' && leave.data ? (leave.data.length ? leave.data.map(l => (
                <Card key={l.id} style={{ gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <T v="h3">{l.employee.name}</T><Pill label={l.status} tone={statusTone(l.status)} />
                    </Row>
                    <T v="sub">{l.employee.employee_code} · {l.leave_type.name} · {fmtShort(l.from_date.slice(0, 10))}{l.to_date !== l.from_date ? ` → ${fmtShort(l.to_date.slice(0, 10))}` : ''} · {l.days}d</T>
                    {l.reason ? <T>{l.reason}</T> : null}
                    {l.review_note ? <T v="sub">Note: {l.review_note}</T> : null}
                    {l.status === 'Pending' && canApprove ? (
                        <Row style={{ gap: space.sm }}>
                            <Button title="Reject" variant="secondary" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'leave', id: l.id, title: l.employee.name, subtitle: l.leave_type.name, decision: 'Rejected' })} />
                            <Button title="Approve" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'leave', id: l.id, title: l.employee.name, subtitle: l.leave_type.name, decision: 'Approved' })} />
                        </Row>
                    ) : null}
                    {(l.status === 'Pending' || l.status === 'Approved') && canApprove ? (
                        <Button title="Cancel leave" variant="ghost" onPress={() => confirm('Cancel this leave?', 'Attendance for those days is restored and the employee is not notified automatically.', 'Cancel leave', () => cancelLeave.mutate(l.id), true)} />
                    ) : null}
                </Card>
            )) : <Empty title="No leave requests" />) : null}

            {kind === 'fix' && fixes.data ? (fixes.data.length ? fixes.data.map(r => (
                <Card key={r.id} style={{ gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <T v="h3">{r.employee.name}</T><Pill label={r.status} tone={statusTone(r.status)} />
                    </Row>
                    <T v="sub">{r.employee.employee_code} · {fmtShort(r.date.slice(0, 10))}</T>
                    <T>{r.reason}</T>
                    <T v="sub">Asks for: {r.requested_in ? `in ${fmtTime(r.requested_in)} ` : ''}{r.requested_out ? `out ${fmtTime(r.requested_out)} ` : ''}{r.requested_status ?? ''}</T>
                    {r.review_note ? <T v="sub">Note: {r.review_note}</T> : null}
                    {r.status === 'Pending' && canApprove ? (
                        <Row style={{ gap: space.sm }}>
                            <Button title="Reject" variant="secondary" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'fix', id: r.id, title: r.employee.name, subtitle: fmtShort(r.date.slice(0, 10)), decision: 'Rejected' })} />
                            <Button title="Approve" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'fix', id: r.id, title: r.employee.name, subtitle: fmtShort(r.date.slice(0, 10)), decision: 'Approved' })} />
                        </Row>
                    ) : null}
                </Card>
            )) : <Empty title="No attendance corrections" />) : null}

            {!canApprove ? <T v="sub" style={{ textAlign: 'center' }}>You can view requests. Approving needs the HR approve permission.</T> : null}

            <DecisionSheet
                visible={!!target} title={target?.title ?? ''} subtitle={target?.subtitle} decision={target?.decision ?? 'Approved'}
                busy={decide.isPending} onCancel={() => setTarget(null)} onConfirm={(note) => target && decide.mutate({ t: target, note })}
            />
        </Screen>
    );
}
