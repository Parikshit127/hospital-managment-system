import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { fmtClock, fmtLong, isDayKey, isTime } from '@/utils/dates';
import { T } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

/**
 * Date/time fields that exchange plain strings ("YYYY-MM-DD", "HH:mm") with the rest of the app.
 * The native picker works in the phone's local zone, so we only ever read/write its local Y-M-D / H:M
 * components — never a UTC conversion — which keeps IST calendar days intact whatever the phone's zone.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const keyToDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
const dateToKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeToDate = (s: string) => { const [h, m] = (isTime(s) ? s : '09:00').split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const dateToTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function Box({ label, value, placeholder, onPress, onClear }: {
    label: string; value: string; placeholder: string; onPress: () => void; onClear?: () => void;
}) {
    const t = useTheme();
    return (
        <View style={{ gap: 6 }}>
            <T v="label">{label}</T>
            <Pressable onPress={onPress} style={{
                backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: radius.md,
                paddingHorizontal: space.md, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <Text style={{ color: value ? t.text : t.sub, fontSize: 16 }}>{value || placeholder}</Text>
                {value && onClear ? <Pressable hitSlop={10} onPress={onClear}><Text style={{ color: t.sub, fontSize: 16 }}>✕</Text></Pressable> : null}
            </Pressable>
        </View>
    );
}

export function DateField({ label, value, onChange, min, max }: {
    label: string; value: string; onChange: (key: string) => void; min?: string; max?: string;
}) {
    const [iosOpen, setIosOpen] = useState(false);
    const handle = (_e: DateTimePickerEvent, d?: Date) => { if (d) onChange(dateToKey(d)); };
    const open = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: isDayKey(value) ? keyToDate(value) : new Date(), mode: 'date', onChange: handle,
                minimumDate: min ? keyToDate(min) : undefined, maximumDate: max ? keyToDate(max) : undefined,
            });
        } else setIosOpen(o => !o);
    };
    return (
        <View>
            <Box label={label} value={isDayKey(value) ? fmtLong(value) : ''} placeholder="Select date" onPress={open} />
            {Platform.OS === 'ios' && iosOpen ? (
                <DateTimePicker
                    value={isDayKey(value) ? keyToDate(value) : new Date()} mode="date" display="inline" onChange={handle}
                    minimumDate={min ? keyToDate(min) : undefined} maximumDate={max ? keyToDate(max) : undefined}
                />
            ) : null}
        </View>
    );
}

/** Optional 24h time ("" = not set). */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (hhmm: string) => void }) {
    const [iosOpen, setIosOpen] = useState(false);
    const handle = (_e: DateTimePickerEvent, d?: Date) => { if (d) onChange(dateToTime(d)); };
    const open = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({ value: timeToDate(value), mode: 'time', is24Hour: false, onChange: handle });
        } else setIosOpen(o => !o);
    };
    return (
        <View>
            <Box label={label} value={isTime(value) ? fmtClock(value) : ''} placeholder="Not set" onPress={open} onClear={value ? () => onChange('') : undefined} />
            {Platform.OS === 'ios' && iosOpen ? <DateTimePicker value={timeToDate(value)} mode="time" display="spinner" onChange={handle} /> : null}
        </View>
    );
}
