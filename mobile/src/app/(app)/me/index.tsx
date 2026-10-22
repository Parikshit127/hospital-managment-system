import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Divider, ErrorBox, Loader, Pill, Row, Screen, SectionTitle, T } from '@/components/ui';
import { APP_VERSION, API_URL } from '@/config';
import { fmtLong } from '@/utils/dates';
import { confirm } from '@/utils/hooks';
import { space, useTheme } from '@/theme';

function Line({ label, value }: { label: string; value?: string | null }) {
    return (
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <T v="sub">{label}</T>
            <T style={{ flexShrink: 1, textAlign: 'right', marginLeft: space.lg }}>{value || '—'}</T>
        </Row>
    );
}

export default function Me() {
    const t = useTheme();
    const router = useRouter();
    const { me, signOut } = useAuth();
    const q = useQuery({ queryKey: ['profile'], queryFn: () => meApi.profile().then(r => r.data) });
    const p = q.data;
    const caps = me?.capabilities;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <Row style={{ gap: space.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <T v="h1" color={t.primary}>{(me?.employee.name || '?').charAt(0).toUpperCase()}</T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                    <T v="h2">{me?.employee.name}</T>
                    <T v="sub">{me?.employee.designation} · {me?.employee.code}</T>
                </View>
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
                <Pill label={me?.organization.name ?? ''} tone="primary" />
                {caps?.manager ? <Pill label={`Manager · ${caps.directReports}`} tone="info" /> : null}
                {caps?.hr ? <Pill label="HR" tone="ok" /> : null}
            </Row>

            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : p ? (
                <>
                    <SectionTitle>Job</SectionTitle>
                    <Card style={{ gap: space.md }}>
                        <Line label="Department" value={p.department} />
                        <Line label="Employment" value={p.employmentType.replace(/_/g, ' ').toLowerCase()} />
                        <Line label="Joined" value={fmtLong(p.joined)} />
                        <Line label="Reports to" value={p.manager} />
                        <Line label="Username" value={p.username} />
                    </Card>

                    <SectionTitle>Contact</SectionTitle>
                    <Card style={{ gap: space.md }}>
                        <Line label="Phone" value={p.phone} />
                        <Line label="Email" value={p.email} />
                        <Line label="Address" value={p.address} />
                        <Line label="Blood group" value={p.bloodGroup} />
                        <Line label="Date of birth" value={p.dateOfBirth ? fmtLong(p.dateOfBirth) : null} />
                        <Divider />
                        <Line label="Emergency contact" value={p.emergencyContactName} />
                        <Line label="Emergency phone" value={p.emergencyContactPhone} />
                        <Button title="Edit my details" variant="secondary" onPress={() => router.push('/me/edit')} />
                    </Card>
                </>
            ) : null}

            <Button title="My roster & holidays" variant="secondary" onPress={() => router.push('/me/roster')} />
            <Button
                title="Sign out" variant="danger"
                onPress={() => confirm('Sign out?', 'You will need your username and password to sign back in.', 'Sign out', () => { signOut(); }, true)}
            />
            <T v="sub" style={{ textAlign: 'center' }}>Axten HR {APP_VERSION} · {API_URL.replace('https://', '')}</T>
        </Screen>
    );
}
