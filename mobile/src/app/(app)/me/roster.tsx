import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { Card, Empty, ErrorBox, Loader, Pill, Row, Screen, T } from '@/components/ui';
import { fmtClock, fmtLong } from '@/utils/dates';
import { space, useTheme } from '@/theme';

export default function Roster() {
    const t = useTheme();
    const q = useQuery({ queryKey: ['roster'], queryFn: () => meApi.roster(undefined, 28).then(r => r.data) });
    return (
        <Screen edges={[]} onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? q.data.map(d => (
                <Card key={d.date} style={{ gap: 4, paddingVertical: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <T v="h3">{fmtLong(d.date)}</T>
                        {d.holiday ? <Pill label="Holiday" tone="info" /> : d.onLeave ? <Pill label="On leave" tone="info" /> : d.weekOff && !d.shift ? <Pill label="Week off" /> : d.shift ? <Pill label={d.shift.name} tone="primary" /> : null}
                    </Row>
                    <T v="sub" color={t.sub}>
                        {d.holiday ?? (d.shift ? `${fmtClock(d.shift.start)} – ${fmtClock(d.shift.end)}` : d.onLeave ? 'Approved leave' : d.weekOff ? 'Weekly off' : 'General hours')}
                    </T>
                </Card>
            )) : <Empty title="Nothing scheduled" />}
        </Screen>
    );
}
