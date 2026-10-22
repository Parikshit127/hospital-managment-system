import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { Button, Card, Field, Screen, Segmented, T, errText } from '@/components/ui';
import { DateField, TimeField } from '@/components/Pickers';
import { addDays, isDayKey, isTime, todayKey } from '@/utils/dates';
import { notify, useInvalidate } from '@/utils/hooks';
import { space, useTheme } from '@/theme';

export default function Fix() {
    const t = useTheme();
    const router = useRouter();
    const invalidate = useInvalidate();
    const params = useLocalSearchParams<{ date?: string }>();
    const [date, setDate] = useState(params.date && isDayKey(params.date) ? params.date : todayKey());
    const [inTime, setInTime] = useState('');
    const [outTime, setOutTime] = useState('');
    const [status, setStatus] = useState<'' | 'Present' | 'Half-Day'>('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const m = useMutation({
        mutationFn: () => meApi.requestFix({
            date, inTime: inTime || undefined, outTime: outTime || undefined, status: status || undefined, reason,
        }),
        onSuccess: async () => {
            await invalidate('attendance', 'workspace');
            notify('Request sent', 'Your manager or HR will review it.');
            router.back();
        },
        onError: (e) => setError(errText(e)),
    });

    const submit = () => {
        setError(null);
        if (!isDayKey(date)) return setError('Choose the day to correct.');
        if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) return setError('Check the in/out time.');
        if (inTime && outTime && outTime <= inTime) return setError('Out-time must be after in-time.');
        if (!inTime && !outTime && !status) return setError('Enter the correct in/out time or choose a status.');
        if (reason.trim().length < 5) return setError('Please give a short reason.');
        m.mutate();
    };

    return (
        <Screen edges={[]} keyboard>
            <Card style={{ gap: space.md }}>
                <DateField label="Day to correct" value={date} onChange={setDate} max={todayKey()} min={addDays(todayKey(), -90)} />
                <TimeField label="Correct in-time (optional)" value={inTime} onChange={setInTime} />
                <TimeField label="Correct out-time (optional)" value={outTime} onChange={setOutTime} />
                <T v="label">Or mark the day as</T>
                <Segmented
                    value={status}
                    onChange={setStatus}
                    options={[{ value: '', label: 'Keep' }, { value: 'Present', label: 'Present' }, { value: 'Half-Day', label: 'Half-day' }]}
                />
                <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Forgot to punch out, was on rounds" />
                {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                <Button title="Send request" loading={m.isPending} onPress={submit} />
            </Card>
        </Screen>
    );
}
