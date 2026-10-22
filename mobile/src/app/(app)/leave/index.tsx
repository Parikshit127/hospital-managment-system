import React from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { Button, Card, Divider, Empty, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, T, errText } from '@/components/ui';
import { fmtShort } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { space, statusTone, useTheme } from '@/theme';

export default function Leave() {
    const t = useTheme();
    const router = useRouter();
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['leave'], queryFn: () => meApi.leave().then(r => r.data) });
    const cancel = useMutation({
        mutationFn: (id: number) => meApi.cancelLeave(id),
        onSuccess: () => invalidate('leave', 'workspace', 'attendance'),
        onError: (e) => notify('Could not cancel', errText(e)),
    });
    const d = q.data;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <Row style={{ justifyContent: 'space-between' }}>
                <T v="h1">Leave</T>
                <Button title="Apply" onPress={() => router.push('/leave/apply')} style={{ minHeight: 40 }} />
            </Row>

            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
                <>
                    <SectionTitle>Balance {d.year}</SectionTitle>
                    {d.balances.length ? d.balances.map(b => (
                        <Card key={b.leaveTypeId} style={{ gap: 6 }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{b.leaveType}</T>
                                <T v="h2" color={b.remaining <= 0 ? t.danger : t.primary}>{b.remaining}</T>
                            </Row>
                            <T v="sub">{b.used} used · {b.pending} pending · {b.total} per year{b.isPaid ? '' : ' · unpaid'}</T>
                        </Card>
                    )) : <Empty title="No leave types" hint="HR has not set up leave types yet." />}

                    <SectionTitle>My requests</SectionTitle>
                    {d.requests.length ? d.requests.map(r => (
                        <Card key={r.id} style={{ gap: 6 }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{r.type}</T>
                                <Pill label={r.status} tone={statusTone(r.status)} />
                            </Row>
                            <T v="sub">
                                {fmtShort(r.from)}{r.to !== r.from ? ` → ${fmtShort(r.to)}` : ''} · {r.days} day{r.days === 1 ? '' : 's'}{r.isHalfDay ? ' (half day)' : ''}
                            </T>
                            {r.reason ? <T v="sub">{r.reason}</T> : null}
                            {r.reviewNote ? <T v="sub" color={t.sub}>Note: {r.reviewNote}</T> : null}
                            {r.status === 'Pending' || r.status === 'Approved' ? (
                                <>
                                    <Divider />
                                    <Button
                                        title="Cancel request" variant="ghost"
                                        onPress={() => confirm('Cancel this leave?', r.status === 'Approved' ? 'Your approved leave will be removed and HR is notified.' : 'The request will be withdrawn.', 'Cancel leave', () => cancel.mutate(r.id), true)}
                                    />
                                </>
                            ) : null}
                        </Card>
                    )) : <Empty title="No leave requests yet" />}
                    <T v="sub" style={{ textAlign: 'center', marginTop: space.sm }}>Pull down to refresh.</T>
                </>
            ) : null}
        </Screen>
    );
}
