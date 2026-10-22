import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { hrApi } from '@/api/hr';
import { Card, Empty, ErrorBox, Field, Loader, Row, Screen, T } from '@/components/ui';
import { addMonths, currentMonthKey, fmtMonth } from '@/utils/dates';
import { space, statusTone, toneColors, useTheme } from '@/theme';

export default function Monthly() {
    const t = useTheme();
    const router = useRouter();
    const [month, setMonth] = useState(currentMonthKey());
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => { const id = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(id); }, [text]);
    const q = useQuery({ queryKey: ['hr', 'monthly', month, search], queryFn: () => hrApi.monthly(month, search || undefined).then(r => r.data) });
    const atCurrent = month >= currentMonthKey();

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading} keyboard edges={[]}>
            <Row style={{ justifyContent: 'space-between' }}>
                <Pressable hitSlop={12} onPress={() => setMonth(addMonths(month, -1))}><Ionicons name="chevron-back" size={24} color={t.text} /></Pressable>
                <T v="h2">{fmtMonth(month)}</T>
                <Pressable hitSlop={12} disabled={atCurrent} onPress={() => setMonth(addMonths(month, 1))}>
                    <Ionicons name="chevron-forward" size={24} color={atCurrent ? t.border : t.text} />
                </Pressable>
            </Row>
            <Field label="Search" value={text} onChangeText={setText} placeholder="Name or code" autoCapitalize="none" />
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data?.rows.length ? q.data.rows.map(r => (
                <Card key={r.employee.id} style={{ gap: space.sm }} onPress={() => router.push({ pathname: '/hr/employee/[id]', params: { id: String(r.employee.id) } })}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                            <T v="h3" numberOfLines={1}>{r.employee.name}</T>
                            <T v="sub">{r.employee.employee_code}</T>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <T v="h2" color={t.primary}>{r.summary.payableDays}</T>
                            <T v="sub">payable days</T>
                        </View>
                    </Row>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                        {r.days.map(d => {
                            const c = toneColors(t, statusTone(d.status));
                            const dim = d.status === 'Upcoming' || d.status === 'N/A' || d.status === 'Week-Off';
                            return <View key={d.date} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: dim ? t.muted : c.fg }} />;
                        })}
                    </View>
                    <T v="sub">P {r.summary.present} · HD {r.summary.halfDay} · A {r.summary.absent} · L {r.summary.leave} · Late {r.summary.lateCount} · {r.summary.totalHours}h</T>
                </Card>
            )) : <Empty title="No data for this month" />}
        </Screen>
    );
}
