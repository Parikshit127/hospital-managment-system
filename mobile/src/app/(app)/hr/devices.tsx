import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import { Button, Card, Empty, ErrorBox, Loader, Pill, Row, Screen, T, errText } from '@/components/ui';
import { fmtShort, fmtTime, todayKey } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { space } from '@/theme';

export default function Devices() {
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['hr', 'devices'], queryFn: () => hrApi.devices().then(r => r.data) });
    const revoke = useMutation({
        mutationFn: (id: string) => hrApi.revokeDevice(id),
        onSuccess: () => invalidate('hr'),
        onError: (e) => notify('Could not revoke', errText(e)),
    });
    const when = (iso: string) => `${iso.slice(0, 10) === todayKey() ? 'Today' : fmtShort(iso.slice(0, 10))} ${fmtTime(iso)}`;

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading} edges={[]}>
            <T v="sub">Phones currently signed in to the app. Revoking signs that phone out at its next request — use it for a lost phone or someone who left.</T>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? q.data.map(d => (
                <Card key={d.id} style={{ gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <T v="h3">{d.user}</T><Pill label={d.platform ?? 'phone'} />
                    </Row>
                    <T v="sub">@{d.username} · {d.role} · {d.deviceName ?? 'Unknown device'} · v{d.appVersion ?? '?'}</T>
                    <T v="sub">Signed in {when(d.loginAt)} · last used {when(d.lastUsedAt)}</T>
                    <T v="sub">{d.loginLocation ? `Login location: ${d.loginLocation.lat.toFixed(4)}, ${d.loginLocation.lng.toFixed(4)}${d.loginLocation.accuracyM ? ` (±${Math.round(d.loginLocation.accuracyM)} m)` : ''}` : 'Login location not captured'}</T>
                    <Button title="Revoke" variant="danger" onPress={() => confirm('Sign this phone out?', `${d.user} will have to sign in again.`, 'Revoke', () => revoke.mutate(d.id), true)} />
                </Card>
            )) : <Empty title="No phones signed in" />}
        </Screen>
    );
}
