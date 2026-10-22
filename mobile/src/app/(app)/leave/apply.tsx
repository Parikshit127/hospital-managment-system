import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { Button, Card, Field, Loader, Row, Screen, T, errText } from '@/components/ui';
import { DateField } from '@/components/Pickers';
import { isDayKey, todayKey } from '@/utils/dates';
import { notify, useInvalidate } from '@/utils/hooks';
import { radius, space, useTheme } from '@/theme';

export default function ApplyLeave() {
    const t = useTheme();
    const router = useRouter();
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['leave'], queryFn: () => meApi.leave().then(r => r.data) });
    const [typeId, setTypeId] = useState<number | null>(null);
    const [from, setFrom] = useState(todayKey());
    const [to, setTo] = useState(todayKey());
    const [half, setHalf] = useState(false);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (typeId === null && q.data?.types.length) setTypeId(q.data.types[0].id); }, [q.data, typeId]);
    useEffect(() => { if (to < from) setTo(from); }, [from, to]);
    useEffect(() => { if (half) setTo(from); }, [half, from]);

    const bal = q.data?.balances.find(b => b.leaveTypeId === typeId);

    const m = useMutation({
        mutationFn: () => meApi.applyLeave({ leaveTypeId: typeId!, fromDate: from, toDate: half ? from : to, reason: reason.trim() || undefined, isHalfDay: half }),
        onSuccess: async (r) => {
            await invalidate('leave', 'workspace');
            notify('Leave requested', `${r.data.days} day(s) sent for approval.`);
            router.back();
        },
        onError: (e) => setError(errText(e)),
    });

    const submit = () => {
        setError(null);
        if (!typeId) return setError('Choose a leave type.');
        if (!isDayKey(from) || !isDayKey(to)) return setError('Choose valid dates.');
        m.mutate();
    };

    if (q.isLoading) return <Screen edges={[]}><Loader /></Screen>;

    return (
        <Screen edges={[]} keyboard>
            <Card style={{ gap: space.md }}>
                <T v="label">Leave type</T>
                <View style={{ gap: space.sm }}>
                    {q.data?.types.map(ty => {
                        const on = ty.id === typeId;
                        return (
                            <Pressable key={ty.id} onPress={() => setTypeId(ty.id)} style={{
                                borderWidth: 1.5, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.card,
                                borderRadius: radius.md, padding: space.md,
                            }}>
                                <T v="h3" color={on ? t.primary : t.text}>{ty.name}{ty.isPaid ? '' : ' (unpaid)'}</T>
                            </Pressable>
                        );
                    })}
                </View>
                {bal ? <T v="sub">{bal.remaining} day(s) left of {bal.total}</T> : null}

                <Row style={{ justifyContent: 'space-between' }}>
                    <T>Half day</T>
                    <Switch value={half} onValueChange={setHalf} trackColor={{ true: t.primary }} />
                </Row>
                <DateField label={half ? 'Date' : 'From'} value={from} onChange={setFrom} />
                {!half ? <DateField label="To" value={to} onChange={setTo} min={from} /> : null}
                <Field label="Reason (optional)" value={reason} onChangeText={setReason} multiline />
                {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                <Button title="Submit request" loading={m.isPending} onPress={submit} />
                <T v="sub">Weekly offs and public holidays in the range are not counted.</T>
            </Card>
        </Screen>
    );
}
