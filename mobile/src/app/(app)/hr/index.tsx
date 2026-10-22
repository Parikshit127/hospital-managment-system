import React from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { hrApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { Card, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, Stat, T } from '@/components/ui';
import { fmtLong } from '@/utils/dates';
import { space, useTheme } from '@/theme';

type Tile = { title: string; hint: string; icon: React.ComponentProps<typeof Ionicons>['name']; href: Href; badge?: number };

export default function HrHome() {
    const t = useTheme();
    const router = useRouter();
    const { me } = useAuth();
    const q = useQuery({ queryKey: ['hr', 'dashboard'], queryFn: () => hrApi.dashboard().then(r => r.data) });
    const d = q.data;
    const caps = me?.capabilities;

    const tiles: Tile[] = [
        { title: 'Requests', hint: 'Leave & corrections', icon: 'checkmark-done-outline', href: '/hr/requests', badge: d ? d.pendingLeave + d.pendingRegularizations : undefined },
        { title: 'Employees', hint: 'Directory & profiles', icon: 'people-outline', href: '/hr/employees' },
        { title: 'Daily attendance', hint: 'Who is in today', icon: 'today-outline', href: '/hr/daily' },
        { title: 'Monthly sheet', hint: 'Payable days', icon: 'grid-outline', href: '/hr/monthly' },
        { title: 'Shifts & roster', hint: 'Assign shifts', icon: 'time-outline', href: '/hr/roster' },
        { title: 'HR settings', hint: 'Hours, geofence, leave', icon: 'settings-outline', href: '/hr/settings' },
    ];
    if (caps?.hrEdit) tiles.push({ title: 'Signed-in phones', hint: 'See & revoke devices', icon: 'phone-portrait-outline', href: '/hr/devices' });

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <View style={{ gap: 2 }}>
                <T v="sub">{d ? fmtLong(d.today.date) : ' '}</T>
                <T v="h1">HR dashboard</T>
            </View>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : d ? (
                <>
                    {d.today.isOffDay ? <Pill label={d.today.holiday ? `Holiday: ${d.today.holiday}` : 'Weekly off today'} tone="info" /> : null}
                    <Row style={{ gap: space.sm }}>
                        <Stat label="Strength" value={d.totalStrength} />
                        <Stat label="Present" value={d.today.present} tone="ok" />
                        <Stat label="On leave" value={d.today.onLeave} tone="info" />
                    </Row>
                    <Row style={{ gap: space.sm }}>
                        <Stat label="Half-day" value={d.today.halfDay} tone={d.today.halfDay ? 'warn' : 'neutral'} />
                        <Stat label="Late" value={d.today.late} tone={d.today.late ? 'warn' : 'neutral'} />
                        <Stat label="Not punched" value={d.today.notPunched} tone={d.today.notPunched ? 'danger' : 'neutral'} />
                    </Row>
                    {d.usersWithoutProfile > 0 ? (
                        <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
                            <T v="sub" color={t.warn}>{d.usersWithoutProfile} login user(s) have no HR profile yet. Sync them from the web portal.</T>
                        </Card>
                    ) : null}
                </>
            ) : null}

            <SectionTitle>Manage</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                {tiles.map(tile => (
                    <Card key={tile.title} onPress={() => router.push(tile.href)} style={{ width: '47.5%', gap: 6 }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                            <Ionicons name={tile.icon} size={26} color={t.primary} />
                            {tile.badge ? <Pill label={String(tile.badge)} tone="danger" /> : null}
                        </Row>
                        <T v="h3">{tile.title}</T>
                        <T v="sub">{tile.hint}</T>
                    </Card>
                ))}
            </View>
        </Screen>
    );
}
