import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { meApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { getFix, LocationError } from '@/location/fix';
import { Button, Card, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, Stat, T, errText } from '@/components/ui';
import { fmtClock, fmtDuration, fmtLong, fmtShort, fmtTime } from '@/utils/dates';
import { notify, useInvalidate, useNow } from '@/utils/hooks';
import { radius, space, statusTone, useTheme } from '@/theme';

export default function Home() {
    const t = useTheme();
    const router = useRouter();
    const { me, locationWarning, geofence } = useAuth();
    const invalidate = useInvalidate();
    const now = useNow();
    const [punchError, setPunchError] = useState<string | null>(null);

    const q = useQuery({ queryKey: ['workspace'], queryFn: () => meApi.workspace().then(r => r.data) });
    const w = q.data;

    const punch = useMutation({
        mutationFn: async (type: 'IN' | 'OUT') => {
            const fix = await getFix({ strict: true });
            return (await meApi.punch({ type, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, mocked: fix.mocked })).data;
        },
        onMutate: () => setPunchError(null),
        onSuccess: async (r) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await invalidate('workspace', 'attendance');
            notify(r.type === 'IN' ? 'Punched in' : 'Punched out', `${fmtTime(r.at)}${r.lateMinutes > 0 ? ` · ${r.lateMinutes} min late` : ''}`);
        },
        onError: (e) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            setPunchError(e instanceof LocationError || e instanceof Error ? e.message : errText(e));
        },
    });

    const isIn = !!w?.punch.isIn;
    const sinceMs = w?.punch.since ? now - new Date(w.punch.since).getTime() : 0;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <View style={{ gap: 2 }}>
                <T v="sub">{w ? fmtLong(w.todayKey) : ' '}</T>
                <T v="h1">Hello, {(me?.employee.name || me?.user.name || '').split(' ')[0]}</T>
            </View>

            {locationWarning ? (
                <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
                    <T v="sub" color={t.warn}>Location was not captured at sign-in: {locationWarning}</T>
                </Card>
            ) : null}

            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : w ? (
                <>
                    <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl }}>
                        <Pill label={isIn ? 'Punched in' : 'Not punched in'} tone={isIn ? 'ok' : 'neutral'} />
                        <T v="big">{isIn ? fmtDuration(sinceMs) : w.today?.check_out ? fmtTime(w.today.check_out) : '--:--'}</T>
                        <T v="sub">
                            {isIn ? `since ${fmtTime(w.punch.since)}` : w.today?.check_out ? 'Last punched out' : 'Tap below to start your day'}
                        </T>
                        <Button
                            title={isIn ? 'Punch out' : 'Punch in'}
                            variant={isIn ? 'danger' : 'primary'}
                            loading={punch.isPending}
                            icon={!punch.isPending ? <Ionicons name={isIn ? 'log-out-outline' : 'finger-print'} size={20} color={isIn ? '#fff' : t.onPrimary} /> : undefined}
                            onPress={() => punch.mutate(isIn ? 'OUT' : 'IN')}
                            style={{ alignSelf: 'stretch', minHeight: 56 }}
                        />
                        {punchError ? (
                            <View style={{ backgroundColor: t.dangerSoft, borderRadius: radius.md, padding: space.md, alignSelf: 'stretch' }}>
                                <T v="sub" color={t.danger}>{punchError}</T>
                            </View>
                        ) : null}
                        <T v="sub" style={{ textAlign: 'center' }}>
                            {w.policy.requireGeo ? 'You must be at the workplace to punch. ' : ''}Time is taken from the server.
                        </T>
                    </Card>

                    <Row style={{ gap: space.md }}>
                        <Card style={{ flex: 1, gap: 4 }}>
                            <T v="label">Today’s shift</T>
                            <T v="h3">{w.todayShift.name}</T>
                            <T v="sub">{fmtClock(w.todayShift.start)} – {fmtClock(w.todayShift.end)}</T>
                        </Card>
                        <Card style={{ flex: 1, gap: 4 }}>
                            <T v="label">Status today</T>
                            <Row><Pill label={w.today?.status ?? 'Not Marked'} tone={statusTone(w.today?.status)} /></Row>
                            <T v="sub">
                                {w.today?.check_in ? `In ${fmtTime(w.today.check_in)}` : 'No punch yet'}
                                {w.today && w.today.late_minutes > 0 ? ` · ${w.today.late_minutes}m late` : ''}
                            </T>
                        </Card>
                    </Row>

                    {w.todayEvents.length ? (
                        <Card style={{ gap: space.sm }}>
                            <T v="label">Today’s punches</T>
                            {w.todayEvents.map(e => (
                                <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                                    <Pill label={e.type === 'IN' ? 'IN' : 'OUT'} tone={e.type === 'IN' ? 'ok' : 'warn'} />
                                    <T>{fmtTime(e.at)}</T>
                                    <T v="sub">{e.source === 'MOBILE' ? 'App' : e.source === 'WEB' ? 'Web' : e.source}</T>
                                </Row>
                            ))}
                        </Card>
                    ) : null}

                    <SectionTitle>This month</SectionTitle>
                    <Row style={{ gap: space.sm }}>
                        <Stat label="Present" value={w.month.summary.present} tone="ok" />
                        <Stat label="Absent" value={w.month.summary.absent} tone={w.month.summary.absent ? 'danger' : 'neutral'} />
                        <Stat label="Late" value={w.month.summary.lateCount} tone={w.month.summary.lateCount ? 'warn' : 'neutral'} />
                    </Row>

                    {w.pending.leave + w.pending.regularizations > 0 ? (
                        <Card onPress={() => router.push('/attendance')} style={{ backgroundColor: t.infoSoft, borderColor: t.infoSoft }}>
                            <T v="sub" color={t.info}>
                                Waiting for approval: {w.pending.leave} leave · {w.pending.regularizations} attendance correction
                            </T>
                        </Card>
                    ) : null}

                    {w.team && w.team.pendingLeave + w.team.pendingRegularizations > 0 ? (
                        <Card onPress={() => router.push('/team')} style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
                            <T v="h3" color={t.warn}>{w.team.pendingLeave + w.team.pendingRegularizations} request(s) need your approval</T>
                            <T v="sub" color={t.warn}>Tap to review your team’s requests</T>
                        </Card>
                    ) : null}

                    <SectionTitle>Leave balance</SectionTitle>
                    <Card style={{ gap: space.sm }}>
                        {w.leaveBalances.length ? w.leaveBalances.map(b => (
                            <Row key={b.leaveTypeId} style={{ justifyContent: 'space-between' }}>
                                <T>{b.leaveType}</T>
                                <T v="h3">{b.remaining} <T v="sub">of {b.total}</T></T>
                            </Row>
                        )) : <T v="sub">No leave types set up yet.</T>}
                    </Card>

                    {w.upcomingHolidays.length || w.upcomingShifts.length ? (
                        <>
                            <SectionTitle>Coming up</SectionTitle>
                            <Card style={{ gap: space.sm }}>
                                {w.upcomingHolidays.slice(0, 3).map(h => (
                                    <Row key={h.date + h.name} style={{ justifyContent: 'space-between' }}>
                                        <T>{h.name}</T><T v="sub">{fmtShort(h.date)}</T>
                                    </Row>
                                ))}
                                {w.upcomingShifts.slice(0, 3).map(s => (
                                    <Row key={s.date} style={{ justifyContent: 'space-between' }}>
                                        <T>{s.name} shift</T><T v="sub">{fmtShort(s.date)} · {fmtClock(s.start)}</T>
                                    </Row>
                                ))}
                                <Button title="View full roster" variant="ghost" onPress={() => router.push('/me/roster')} />
                            </Card>
                        </>
                    ) : null}

                    {geofence && geofence.configured && geofence.required && geofence.inside === false ? (
                        <T v="sub" style={{ textAlign: 'center' }}>You signed in {geofence.distanceM} m from the workplace.</T>
                    ) : null}
                </>
            ) : null}
        </Screen>
    );
}
