import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { meApi } from '@/api/hr';
import { Button, Card, Divider, Empty, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, Stat, T, errText } from '@/components/ui';
import { CalendarLegend, MonthCalendar } from '@/components/MonthCalendar';
import { addMonths, currentMonthKey, fmtHours, fmtLong, fmtMonth, fmtShort, fmtTime, todayKey } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { space, statusTone, useTheme } from '@/theme';

export default function Attendance() {
    const t = useTheme();
    const router = useRouter();
    const invalidate = useInvalidate();
    const [month, setMonth] = useState(currentMonthKey());
    const [selected, setSelected] = useState<string | null>(todayKey());

    const q = useQuery({ queryKey: ['attendance', month], queryFn: () => meApi.attendance(month).then(r => r.data) });
    const data = q.data;
    useEffect(() => { setSelected(month === currentMonthKey() ? todayKey() : `${month}-01`); }, [month]);

    const cancel = useMutation({
        mutationFn: (id: number) => meApi.cancelFix(id),
        onSuccess: () => invalidate('attendance', 'workspace'),
        onError: (e) => notify('Could not withdraw', errText(e)),
    });

    const day = data?.days.find(d => d.date === selected) ?? null;
    const canFix = day && day.date <= todayKey() && day.status !== 'N/A' && day.status !== 'Holiday' && day.status !== 'Week-Off';
    const atCurrent = month >= currentMonthKey();

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <Row style={{ justifyContent: 'space-between' }}>
                <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, -1))}><Ionicons name="chevron-back" size={24} color={t.text} /></Pressable>
                <T v="h2">{fmtMonth(month)}</T>
                <Pressable hitSlop={12} disabled={atCurrent} onPress={() => setMonth(addMonths(month, 1))}>
                    <Ionicons name="chevron-forward" size={24} color={atCurrent ? t.border : t.text} />
                </Pressable>
            </Row>

            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : data ? (
                <>
                    <Row style={{ gap: space.sm }}>
                        <Stat label="Present" value={data.summary.present} tone="ok" />
                        <Stat label="Half-day" value={data.summary.halfDay} tone={data.summary.halfDay ? 'warn' : 'neutral'} />
                        <Stat label="Absent" value={data.summary.absent} tone={data.summary.absent ? 'danger' : 'neutral'} />
                        <Stat label="Leave" value={data.summary.leave} tone="info" />
                    </Row>
                    <Card style={{ gap: space.md }}>
                        <MonthCalendar monthKey={month} days={data.days} selected={selected} onSelect={setSelected} />
                        <CalendarLegend />
                    </Card>

                    {day ? (
                        <Card style={{ gap: space.sm }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{fmtLong(day.date)}</T>
                                <Pill label={day.status} tone={statusTone(day.status)} />
                            </Row>
                            {day.holiday ? <T v="sub">{day.holiday}</T> : null}
                            <Row style={{ justifyContent: 'space-between' }}><T v="sub">In</T><T>{fmtTime(day.check_in)}</T></Row>
                            <Row style={{ justifyContent: 'space-between' }}><T v="sub">Out</T><T>{fmtTime(day.check_out)}</T></Row>
                            <Row style={{ justifyContent: 'space-between' }}><T v="sub">Hours</T><T>{fmtHours(day.total_hours)}</T></Row>
                            {day.late_minutes > 0 ? <Row style={{ justifyContent: 'space-between' }}><T v="sub">Late by</T><T color={t.warn}>{day.late_minutes} min</T></Row> : null}
                            {canFix ? (
                                <Button title="Request correction" variant="secondary" onPress={() => router.push({ pathname: '/attendance/fix', params: { date: day.date } })} />
                            ) : null}
                            <T v="sub">Corrections are allowed for the last {data.policy.regularizationWindowDays} days.</T>
                        </Card>
                    ) : null}

                    <SectionTitle>My correction requests</SectionTitle>
                    {data.regularizations.length ? data.regularizations.map(r => (
                        <Card key={r.id} style={{ gap: 6 }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                                <T v="h3">{fmtShort(r.date)}</T>
                                <Pill label={r.status} tone={statusTone(r.status)} />
                            </Row>
                            <T v="sub">{r.reason}</T>
                            {r.requestedIn || r.requestedOut ? (
                                <T v="sub">Requested: {r.requestedIn ? fmtTime(r.requestedIn) : '—'} → {r.requestedOut ? fmtTime(r.requestedOut) : '—'}</T>
                            ) : null}
                            {r.reviewNote ? <T v="sub">Note: {r.reviewNote}</T> : null}
                            {r.status === 'Pending' ? (
                                <>
                                    <Divider />
                                    <Button title="Withdraw" variant="ghost" onPress={() => confirm('Withdraw request?', 'Your manager will no longer see it.', 'Withdraw', () => cancel.mutate(r.id), true)} />
                                </>
                            ) : null}
                        </Card>
                    )) : <Empty title="No requests" hint="Forgot to punch? Select the day above and request a correction." />}
                </>
            ) : null}
        </Screen>
    );
}
