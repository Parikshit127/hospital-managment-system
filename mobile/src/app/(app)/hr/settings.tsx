import React, { useEffect, useState } from 'react';
import { Pressable, Switch } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import type { HrPolicy } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Divider, Empty, ErrorBox, Field, Loader, Pill, Row, Screen, SectionTitle, T, errText } from '@/components/ui';
import { DateField, TimeField } from '@/components/Pickers';
import { getFix } from '@/location/fix';
import { WEEKDAYS, fmtShort, todayKey } from '@/utils/dates';
import { confirm, notify, useInvalidate } from '@/utils/hooks';
import { radius, space, useTheme } from '@/theme';

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function PolicyCard({ policy, canEdit }: { policy: HrPolicy; canEdit: boolean }) {
    const t = useTheme();
    const invalidate = useInvalidate();
    const [f, setF] = useState({
        workStart: policy.workStart, workEnd: policy.workEnd, grace: String(policy.graceMinutes),
        full: String(policy.fullDayHours), half: String(policy.halfDayHours), win: String(policy.regularizationWindowDays),
        off: policy.weeklyOffDays, requireGeo: policy.requireGeo,
        lat: policy.geofence ? String(policy.geofence.lat) : '', lng: policy.geofence ? String(policy.geofence.lng) : '',
        radius: policy.geofence ? String(policy.geofence.radiusM) : '200',
    });
    const [err, setErr] = useState<string | null>(null);
    const [locating, setLocating] = useState(false);

    const save = useMutation({
        mutationFn: () => {
            const lat = num(f.lat), lng = num(f.lng), radiusM = num(f.radius);
            const hasFence = !isNaN(lat) && !isNaN(lng) && !isNaN(radiusM) && radiusM > 0;
            return hrApi.updatePolicy({
                workStart: f.workStart, workEnd: f.workEnd, graceMinutes: num(f.grace), fullDayHours: num(f.full), halfDayHours: num(f.half),
                regularizationWindowDays: num(f.win), weeklyOffDays: f.off, requireGeo: f.requireGeo,
                ...(hasFence ? { geofence: { lat, lng, radiusM } } : {}),
            });
        },
        onSuccess: async () => { await invalidate('hr', 'workspace'); notify('Settings saved'); },
        onError: (e) => setErr(errText(e)),
    });

    const useHere = async () => {
        setLocating(true);
        try {
            const fix = await getFix({ strict: true });
            setF(s => ({ ...s, lat: fix.lat.toFixed(6), lng: fix.lng.toFixed(6) }));
        } catch (e) { notify('Location', errText(e)); } finally { setLocating(false); }
    };

    const ro = !canEdit;
    return (
        <Card style={{ gap: space.md }}>
            <TimeField label="Work starts" value={f.workStart} onChange={v => v && setF(s => ({ ...s, workStart: v }))} />
            <TimeField label="Work ends" value={f.workEnd} onChange={v => v && setF(s => ({ ...s, workEnd: v }))} />
            <Row style={{ gap: space.sm }}>
                <Field label="Grace (min)" value={f.grace} onChangeText={v => setF(s => ({ ...s, grace: v }))} keyboardType="number-pad" editable={!ro} style={{ flex: 1 }} />
                <Field label="Full day (h)" value={f.full} onChangeText={v => setF(s => ({ ...s, full: v }))} keyboardType="decimal-pad" editable={!ro} style={{ flex: 1 }} />
                <Field label="Half day (h)" value={f.half} onChangeText={v => setF(s => ({ ...s, half: v }))} keyboardType="decimal-pad" editable={!ro} style={{ flex: 1 }} />
            </Row>
            <Field label="Correction window (days)" value={f.win} onChangeText={v => setF(s => ({ ...s, win: v }))} keyboardType="number-pad" editable={!ro} />

            <T v="label">Weekly off days</T>
            <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {WEEKDAYS.map((d, i) => {
                    const on = f.off.includes(i);
                    return (
                        <Pressable key={d} disabled={ro} onPress={() => setF(s => ({ ...s, off: on ? s.off.filter(x => x !== i) : [...s.off, i].sort() }))}
                            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.muted }}>
                            <T v="sub" color={on ? t.onPrimary : t.text} style={{ fontWeight: '600' }}>{d}</T>
                        </Pressable>
                    );
                })}
            </Row>

            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
                <T v="h3">Require workplace location to punch</T>
                <Switch value={f.requireGeo} onValueChange={v => setF(s => ({ ...s, requireGeo: v }))} disabled={ro} trackColor={{ true: t.primary }} />
            </Row>
            <Row style={{ gap: space.sm }}>
                <Field label="Latitude" value={f.lat} onChangeText={v => setF(s => ({ ...s, lat: v }))} keyboardType="numbers-and-punctuation" editable={!ro} style={{ flex: 1 }} />
                <Field label="Longitude" value={f.lng} onChangeText={v => setF(s => ({ ...s, lng: v }))} keyboardType="numbers-and-punctuation" editable={!ro} style={{ flex: 1 }} />
            </Row>
            <Field label="Allowed radius (metres)" value={f.radius} onChangeText={v => setF(s => ({ ...s, radius: v }))} keyboardType="number-pad" editable={!ro} />
            {canEdit ? <Button title="Use my current location as the workplace" variant="secondary" loading={locating} onPress={useHere} /> : null}
            {err ? <T v="sub" color={t.danger}>{err}</T> : null}
            {canEdit ? <Button title="Save settings" loading={save.isPending} onPress={() => { setErr(null); save.mutate(); }} /> : <T v="sub">View only — editing needs the HR edit permission.</T>}
        </Card>
    );
}

function LeaveTypes({ canEdit }: { canEdit: boolean }) {
    const t = useTheme();
    const invalidate = useInvalidate();
    const q = useQuery({ queryKey: ['hr', 'leave-types'], queryFn: () => hrApi.leaveTypes().then(r => r.data) });
    const [name, setName] = useState('');
    const [days, setDays] = useState('12');
    const [paid, setPaid] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const add = useMutation({
        mutationFn: () => hrApi.saveLeaveType({ name, daysPerYear: Number(days), isPaid: paid }),
        onSuccess: async () => { setName(''); await invalidate('hr', 'leave', 'workspace'); },
        onError: (e) => setErr(errText(e)),
    });
    return (
        <>
            <SectionTitle>Leave types</SectionTitle>
            <Card style={{ gap: space.sm }}>
                {q.isLoading ? <Loader /> : q.data?.length ? q.data.map(l => (
                    <Row key={l.id} style={{ justifyContent: 'space-between' }}>
                        <T>{l.name}</T><T v="sub">{l.days_per_year} d/yr · {l.is_paid ? 'paid' : 'unpaid'}{l.is_active ? '' : ' · off'}</T>
                    </Row>
                )) : <Empty title="No leave types" />}
                {canEdit ? (
                    <>
                        <Divider />
                        <Field label="New leave type" value={name} onChangeText={setName} placeholder="e.g. Casual Leave" />
                        <Row style={{ gap: space.sm, alignItems: 'flex-end' }}>
                            <Field label="Days / year" value={days} onChangeText={setDays} keyboardType="number-pad" style={{ flex: 1 }} />
                            <Row style={{ gap: 6, paddingBottom: 12 }}><T v="sub">Paid</T><Switch value={paid} onValueChange={setPaid} trackColor={{ true: t.primary }} /></Row>
                        </Row>
                        {err ? <T v="sub" color={t.danger}>{err}</T> : null}
                        <Button title="Add leave type" variant="secondary" loading={add.isPending} disabled={!name.trim() || !days} onPress={() => { setErr(null); add.mutate(); }} />
                    </>
                ) : null}
            </Card>
        </>
    );
}

function Holidays({ canEdit }: { canEdit: boolean }) {
    const invalidate = useInvalidate();
    const year = Number(todayKey().slice(0, 4));
    const q = useQuery({ queryKey: ['hr', 'holidays', year], queryFn: () => hrApi.holidays(year).then(r => r.data) });
    const [date, setDate] = useState(todayKey());
    const [name, setName] = useState('');
    const [optional, setOptional] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const add = useMutation({
        mutationFn: () => hrApi.addHoliday({ date, name, type: optional ? 'OPTIONAL' : 'PUBLIC' }),
        onSuccess: async () => { setName(''); await invalidate('hr', 'workspace', 'attendance'); },
        onError: (e) => setErr(errText(e)),
    });
    const del = useMutation({
        mutationFn: (id: number) => hrApi.deleteHoliday(id),
        onSuccess: () => invalidate('hr', 'workspace', 'attendance'),
        onError: (e) => notify('Could not delete', errText(e)),
    });
    return (
        <>
            <SectionTitle>Holidays {year}</SectionTitle>
            <Card style={{ gap: space.sm }}>
                {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? q.data.map(h => (
                    <Row key={h.id} style={{ justifyContent: 'space-between' }}>
                        <Row style={{ flex: 1 }}><T style={{ flexShrink: 1 }}>{h.name}</T>{h.type === 'OPTIONAL' ? <Pill label="Optional" /> : null}</Row>
                        <T v="sub">{fmtShort(h.date.slice(0, 10))}</T>
                        {canEdit ? <Button title="✕" variant="ghost" onPress={() => confirm('Delete holiday?', h.name, 'Delete', () => del.mutate(h.id), true)} style={{ minHeight: 32, paddingHorizontal: 8 }} /> : null}
                    </Row>
                )) : <Empty title="No holidays added" />}
                {canEdit ? (
                    <>
                        <Divider />
                        <DateField label="Date" value={date} onChange={setDate} />
                        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Diwali" />
                        <Row style={{ justifyContent: 'space-between' }}><T>Optional holiday</T><Switch value={optional} onValueChange={setOptional} /></Row>
                        {err ? <T v="sub">{err}</T> : null}
                        <Button title="Add holiday" variant="secondary" loading={add.isPending} disabled={!name.trim()} onPress={() => { setErr(null); add.mutate(); }} />
                    </>
                ) : null}
            </Card>
        </>
    );
}

export default function Settings() {
    const { me } = useAuth();
    const canEdit = !!me?.capabilities.hrEdit;
    const q = useQuery({ queryKey: ['hr', 'policy'], queryFn: () => hrApi.policy().then(r => r.data) });
    // PolicyCard seeds its form from props once; remount when fresh data arrives.
    const [rev, setRev] = useState(0);
    useEffect(() => { setRev(r => r + 1); }, [q.dataUpdatedAt]);

    return (
        <Screen keyboard edges={[]} onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isLoading}>
            <SectionTitle>Attendance policy</SectionTitle>
            {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data ? <PolicyCard key={rev} policy={q.data} canEdit={canEdit} /> : null}
            <LeaveTypes canEdit={canEdit} />
            <Holidays canEdit={canEdit} />
        </Screen>
    );
}
