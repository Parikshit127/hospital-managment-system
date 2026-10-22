import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import type { DailyRow } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Empty, ErrorBox, Loader, Pill, Row, Screen, Segmented, Stat, T, errText } from '@/components/ui';
import { DateField, TimeField } from '@/components/Pickers';
import { fmtTime, hhmm, todayKey } from '@/utils/dates';
import { notify, useInvalidate } from '@/utils/hooks';
import { radius, space, statusTone, useTheme } from '@/theme';

const STATUSES = ['Present', 'Half-Day', 'Absent', 'Leave'] as const;

export default function Daily() {
    const t = useTheme();
    const { me } = useAuth();
    const canEdit = !!me?.capabilities.hrEdit;
    const invalidate = useInvalidate();
    const [date, setDate] = useState(todayKey());
    const q = useQuery({ queryKey: ['hr', 'daily', date], queryFn: () => hrApi.daily(date).then(r => r.data) });

    const [row, setRow] = useState<DailyRow | null>(null);
    const [status, setStatus] = useState<(typeof STATUSES)[number]>('Present');
    const [inT, setInT] = useState('');
    const [outT, setOutT] = useState('');
    const [err, setErr] = useState<string | null>(null);

    const open = (r: DailyRow) => {
        setRow(r); setErr(null);
        const s = r.attendance?.status;
        setStatus((STATUSES as readonly string[]).includes(s ?? '') ? (s as (typeof STATUSES)[number]) : 'Present');
        setInT(hhmm(r.attendance?.check_in)); setOutT(hhmm(r.attendance?.check_out));
    };

    const save = useMutation({
        mutationFn: () => hrApi.markDay({ employeeId: row!.employee.id, date, status, checkIn: inT || undefined, checkOut: outT || undefined }),
        onSuccess: async () => { setRow(null); await invalidate('hr'); },
        onError: (e) => setErr(errText(e)),
    });

    const rows = q.data ?? [];
    const count = (s: string) => rows.filter(r => r.attendance?.status === s).length;
    const label = (r: DailyRow) => r.attendance?.status ?? (r.onApprovedLeave ? 'Leave' : 'Not marked');

    return (
        <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading} edges={[]}>
            <DateField label="Date" value={date} onChange={setDate} />
            {q.data ? (
                <Row style={{ gap: space.sm }}>
                    <Stat label="Present" value={count('Present')} tone="ok" />
                    <Stat label="Half-day" value={count('Half-Day')} tone="warn" />
                    <Stat label="Absent" value={count('Absent')} tone="danger" />
                    <Stat label="Not marked" value={rows.filter(r => !r.attendance && !r.onApprovedLeave).length} />
                </Row>
            ) : null}
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : rows.length ? rows.map(r => (
                <Card key={r.employee.id} onPress={canEdit ? () => open(r) : undefined} style={{ paddingVertical: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, gap: 2 }}>
                            <T v="h3" numberOfLines={1}>{r.employee.name}</T>
                            <T v="sub">{r.employee.employee_code} · {fmtTime(r.attendance?.check_in)} – {fmtTime(r.attendance?.check_out)}</T>
                        </View>
                        <Pill label={label(r)} tone={statusTone(label(r))} />
                    </Row>
                </Card>
            )) : <Empty title="No employees" />}
            {canEdit ? <T v="sub" style={{ textAlign: 'center' }}>Tap an employee to correct their day.</T> : null}

            <Modal visible={!!row} transparent animationType="slide" onRequestClose={() => setRow(null)}>
                <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={() => setRow(null)} />
                <View style={{ backgroundColor: t.card, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
                    <T v="h2">{row?.employee.name}</T>
                    <Segmented value={status} onChange={setStatus} options={STATUSES.map(s => ({ value: s, label: s }))} />
                    <TimeField label="In time" value={inT} onChange={setInT} />
                    <TimeField label="Out time" value={outT} onChange={setOutT} />
                    {err ? <T v="sub" color={t.danger}>{err}</T> : null}
                    <Button title="Save" loading={save.isPending} onPress={() => { setErr(null); save.mutate(); }} />
                    <Button title="Cancel" variant="ghost" onPress={() => setRow(null)} />
                </View>
            </Modal>
        </Screen>
    );
}
