import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Divider, Empty, ErrorBox, Field, Loader, Pill, Row, Screen, SectionTitle, T, errText } from '@/components/ui';
import { DateField, TimeField } from '@/components/Pickers';
import { EmployeePicker, type PickedEmployee } from '@/components/EmployeePicker';
import { fmtClock, todayKey } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { radius, space, useTheme } from '@/theme';

export default function RosterAdmin() {
    const t = useTheme();
    const { me } = useAuth();
    const canEdit = !!me?.capabilities.hrEdit;
    const invalidate = useInvalidate();
    const [date, setDate] = useState(todayKey());

    const shifts = useQuery({ queryKey: ['hr', 'shifts'], queryFn: () => hrApi.shifts().then(r => r.data) });
    const day = useQuery({ queryKey: ['hr', 'roster', date], queryFn: () => hrApi.roster(date).then(r => r.data) });

    const [emp, setEmp] = useState<PickedEmployee | null>(null);
    const [picker, setPicker] = useState(false);
    const [shiftId, setShiftId] = useState<number | null>(null);
    const [start, setStart] = useState(todayKey());
    const [end, setEnd] = useState(todayKey());
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => { if (end < start) setEnd(start); }, [start, end]);
    useEffect(() => { if (shiftId === null && shifts.data?.length) setShiftId(shifts.data[0].id); }, [shifts.data, shiftId]);

    const assign = useMutation({
        mutationFn: () => hrApi.assignShift({ employeeId: emp!.id, shiftPatternId: shiftId!, startDate: start, endDate: end }),
        onSuccess: async () => { await invalidate('hr'); notify('Shift assigned'); },
        onError: (e) => setErr(errText(e)),
    });
    const remove = useMutation({
        mutationFn: (id: number) => hrApi.removeShift(id),
        onSuccess: () => invalidate('hr'),
        onError: (e) => notify('Could not remove', errText(e)),
    });

    const [name, setName] = useState('');
    const [sT, setST] = useState('09:00');
    const [eT, setET] = useState('17:00');
    const [shiftErr, setShiftErr] = useState<string | null>(null);
    const create = useMutation({
        mutationFn: () => hrApi.createShift({ name, startTime: sT, endTime: eT }),
        onSuccess: async () => { setName(''); await invalidate('hr'); },
        onError: (e) => setShiftErr(errText(e)),
    });

    return (
        <Screen keyboard edges={[]} onRefresh={() => { day.refetch(); shifts.refetch(); }} refreshing={day.isRefetching && !day.isLoading}>
            <DateField label="Roster for" value={date} onChange={setDate} />
            {day.isLoading ? <Loader /> : day.error ? <ErrorBox error={day.error} onRetry={() => day.refetch()} /> : day.data?.length ? day.data.map(a => (
                <Card key={a.id} style={{ paddingVertical: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                            <T v="h3" numberOfLines={1}>{a.employee.name}</T>
                            <T v="sub">{a.shift_pattern.name} · {fmtClock(a.shift_pattern.start_time)} – {fmtClock(a.shift_pattern.end_time)}</T>
                        </View>
                        {canEdit ? <Button title="Remove" variant="ghost" onPress={() => confirm('Remove shift?', `${a.employee.name} will fall back to general hours.`, 'Remove', () => remove.mutate(a.id), true)} /> : null}
                    </Row>
                </Card>
            )) : <Empty title="No shifts assigned" hint="Everyone follows general hours that day." />}

            {canEdit ? (
                <>
                    <SectionTitle>Assign a shift</SectionTitle>
                    <Card style={{ gap: space.md }}>
                        <Button title={emp ? `${emp.name} (${emp.code})` : 'Choose employee'} variant="secondary" onPress={() => setPicker(true)} />
                        <T v="label">Shift</T>
                        <Row style={{ flexWrap: 'wrap' }}>
                            {shifts.data?.map(s => (
                                <Pressable key={s.id} onPress={() => setShiftId(s.id)} style={{
                                    borderWidth: 1.5, borderColor: s.id === shiftId ? t.primary : t.border, backgroundColor: s.id === shiftId ? t.primarySoft : t.card,
                                    borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12,
                                }}>
                                    <T v="h3" color={s.id === shiftId ? t.primary : t.text}>{s.name}</T>
                                    <T v="sub">{fmtClock(s.start_time)} – {fmtClock(s.end_time)}</T>
                                </Pressable>
                            ))}
                        </Row>
                        {!shifts.data?.length ? <T v="sub">Create a shift pattern below first.</T> : null}
                        <DateField label="From" value={start} onChange={setStart} />
                        <DateField label="To (max 62 days)" value={end} onChange={setEnd} min={start} />
                        {err ? <T v="sub" color={t.danger}>{err}</T> : null}
                        <Button title="Assign" loading={assign.isPending} disabled={!emp || !shiftId} onPress={() => { setErr(null); assign.mutate(); }} />
                    </Card>

                    <SectionTitle>New shift pattern</SectionTitle>
                    <Card style={{ gap: space.md }}>
                        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Night" />
                        <TimeField label="Starts" value={sT} onChange={setST} />
                        <TimeField label="Ends" value={eT} onChange={setET} />
                        {shiftErr ? <T v="sub" color={t.danger}>{shiftErr}</T> : null}
                        <Button title="Create shift" variant="secondary" loading={create.isPending} disabled={!name.trim() || !sT || !eT} onPress={() => { setShiftErr(null); create.mutate(); }} />
                    </Card>
                    <Divider />
                </>
            ) : null}
            <EmployeePicker visible={picker} onClose={() => setPicker(false)} onPick={setEmp} />
        </Screen>
    );
}
