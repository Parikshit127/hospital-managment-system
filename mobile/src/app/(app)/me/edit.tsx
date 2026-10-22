import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { meApi } from '@/api/hr';
import { Button, Card, Field, Loader, Screen, T, errText } from '@/components/ui';
import { DateField } from '@/components/Pickers';
import { notify, useInvalidate } from '@/utils/hooks';
import { space, useTheme } from '@/theme';

export default function EditProfile() {
    const t = useTheme();
    const router = useRouter();
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['profile'], queryFn: () => meApi.profile().then(r => r.data) });
    const [f, setF] = useState({ phone: '', email: '', address: '', bloodGroup: '', gender: '', dateOfBirth: '', emergencyContactName: '', emergencyContactPhone: '' });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const p = q.data;
        if (p) setF({
            phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', bloodGroup: p.bloodGroup ?? '', gender: p.gender ?? '',
            dateOfBirth: p.dateOfBirth ?? '', emergencyContactName: p.emergencyContactName ?? '', emergencyContactPhone: p.emergencyContactPhone ?? '',
        });
    }, [q.data]);
    const set = (k: keyof typeof f) => (v: string) => setF(s => ({ ...s, [k]: v }));

    const m = useMutation({
        mutationFn: () => meApi.updateProfile(f),
        onSuccess: async () => { await invalidate('profile', 'workspace'); notify('Saved'); router.back(); },
        onError: (e) => setError(errText(e)),
    });

    if (q.isLoading) return <Screen edges={[]}><Loader /></Screen>;
    return (
        <Screen edges={[]} keyboard>
            <Card style={{ gap: space.md }}>
                <T v="sub">Job details are managed by HR. You can update your contact and emergency details.</T>
                <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
                <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
                <Field label="Address" value={f.address} onChangeText={set('address')} multiline />
                <Field label="Blood group" value={f.bloodGroup} onChangeText={set('bloodGroup')} autoCapitalize="characters" maxLength={5} />
                <Field label="Gender" value={f.gender} onChangeText={set('gender')} />
                <DateField label="Date of birth" value={f.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
                <Field label="Emergency contact name" value={f.emergencyContactName} onChangeText={set('emergencyContactName')} />
                <Field label="Emergency contact phone" value={f.emergencyContactPhone} onChangeText={set('emergencyContactPhone')} keyboardType="phone-pad" />
                {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                <Button title="Save" loading={m.isPending} onPress={() => { setError(null); m.mutate(); }} />
            </Card>
        </Screen>
    );
}
