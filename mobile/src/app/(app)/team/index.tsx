import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { teamApi } from '@/api/hr';
import { Button, Card, Empty, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, T, errText } from '@/components/ui';
import { DecisionSheet } from '@/components/DecisionSheet';
import { fmtShort, fmtTime } from '@/utils/dates';
import { notify, useInvalidate } from '@/utils/hooks';
import { space } from '@/theme';

type Target = { kind: 'leave' | 'fix'; id: number; title: string; subtitle: string; decision: 'Approved' | 'Rejected' };

export default function Team() {
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['team'], queryFn: () => teamApi.approvals().then(r => r.data) });
    const [target, setTarget] = useState<Target | null>(null);

    const decide = useMutation({
        mutationFn: ({ t, note }: { t: Target; note: string }) =>
            t.kind === 'leave' ? teamApi.reviewLeave(t.id, t.decision, note) : teamApi.reviewFix(t.id, t.decision, note),
        onSuccess: async () => { setTarget(null); await invalidate('team', 'workspace'); },
        onError: (e) => { setTarget(null); notify('Could not save', errText(e)); },
    });

    const d = q.data;
    const empty = d && !d.leave.length && !d.regularizations.length;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <T v="h1">Team approvals</T>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
                <>
                    {empty ? <Empty title="All caught up" hint="No pending requests from your direct reports." /> : null}

                    {d.leave.length ? <SectionTitle>Leave requests</SectionTitle> : null}
                    {d.leave.map(l => (
                        <Card key={`l${l.id}`} style={{ gap: space.sm }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{l.employee}</T><Pill label={l.type} tone="info" />
                            </Row>
                            <T v="sub">{l.code} · {fmtShort(l.from)}{l.to !== l.from ? ` → ${fmtShort(l.to)}` : ''} · {l.days} day(s)</T>
                            {l.reason ? <T>{l.reason}</T> : null}
                            <Row style={{ gap: space.sm }}>
                                <Button title="Reject" variant="secondary" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'leave', id: l.id, title: l.employee, subtitle: `${l.type} · ${l.days} day(s)`, decision: 'Rejected' })} />
                                <Button title="Approve" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'leave', id: l.id, title: l.employee, subtitle: `${l.type} · ${l.days} day(s)`, decision: 'Approved' })} />
                            </Row>
                        </Card>
                    ))}

                    {d.regularizations.length ? <SectionTitle>Attendance corrections</SectionTitle> : null}
                    {d.regularizations.map(r => (
                        <Card key={`r${r.id}`} style={{ gap: space.sm }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{r.employee}</T><Pill label={fmtShort(r.date)} tone="warn" />
                            </Row>
                            <T v="sub">{r.code}</T>
                            <T>{r.reason}</T>
                            <T v="sub">
                                Asks for: {r.requestedIn ? `in ${fmtTime(r.requestedIn)}` : ''}{r.requestedIn && r.requestedOut ? ', ' : ''}{r.requestedOut ? `out ${fmtTime(r.requestedOut)}` : ''}
                                {!r.requestedIn && !r.requestedOut ? `status ${r.requestedStatus ?? '—'}` : ''}
                            </T>
                            <Row style={{ gap: space.sm }}>
                                <Button title="Reject" variant="secondary" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'fix', id: r.id, title: r.employee, subtitle: fmtShort(r.date), decision: 'Rejected' })} />
                                <Button title="Approve" style={{ flex: 1 }} onPress={() => setTarget({ kind: 'fix', id: r.id, title: r.employee, subtitle: fmtShort(r.date), decision: 'Approved' })} />
                            </Row>
                        </Card>
                    ))}
                </>
            ) : null}

            <DecisionSheet
                visible={!!target} title={target?.title ?? ''} subtitle={target?.subtitle} decision={target?.decision ?? 'Approved'}
                busy={decide.isPending} onCancel={() => setTarget(null)} onConfirm={(note) => target && decide.mutate({ t: target, note })}
            />
        </Screen>
    );
}
