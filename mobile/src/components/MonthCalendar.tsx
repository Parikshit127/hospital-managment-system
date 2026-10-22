import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DayCell } from '@/api/types';
import { WEEKDAYS, weekdayOf } from '@/utils/dates';
import { radius, toneColors, useTheme, statusTone } from '@/theme';

/** Month grid coloured by attendance status. Pure view: parent owns the data and the selection. */
export function MonthCalendar({ monthKey, days, selected, onSelect }: {
    monthKey: string; days: DayCell[]; selected: string | null; onSelect: (key: string) => void;
}) {
    const t = useTheme();
    if (!days.length) return null;
    const lead = weekdayOf(days[0].date);
    const cells: (DayCell | null)[] = [...Array(lead).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const weeks: (DayCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return (
        <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row' }}>
                {WEEKDAYS.map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: t.sub, fontSize: 11, fontWeight: '600' }}>{d.slice(0, 2)}</Text>
                ))}
            </View>
            {weeks.map((w, wi) => (
                <View key={wi} style={{ flexDirection: 'row', gap: 6 }}>
                    {w.map((c, ci) => {
                        if (!c) return <View key={ci} style={{ flex: 1, aspectRatio: 1 }} />;
                        const tone = toneColors(t, statusTone(c.status));
                        const dim = c.status === 'Upcoming' || c.status === 'N/A' || c.status === 'Week-Off';
                        const isSel = selected === c.date;
                        return (
                            <Pressable
                                key={c.date}
                                onPress={() => onSelect(c.date)}
                                style={{
                                    flex: 1, aspectRatio: 1, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: dim ? 'transparent' : tone.bg,
                                    borderWidth: isSel ? 2 : 0, borderColor: t.primary,
                                }}
                            >
                                <Text style={{ color: dim ? t.sub : tone.fg, fontWeight: '700', fontSize: 14 }}>{Number(c.date.slice(8))}</Text>
                                {c.late_minutes > 0 ? <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: t.warn }} /> : null}
                            </Pressable>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

export function CalendarLegend() {
    const t = useTheme();
    const items: [string, ReturnType<typeof statusTone>][] = [['Present', 'ok'], ['Half-day', 'warn'], ['Absent', 'danger'], ['Leave/Holiday', 'info']];
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {items.map(([label, tone]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: toneColors(t, tone).fg }} />
                    <Text style={{ color: t.sub, fontSize: 12 }}>{label}</Text>
                </View>
            ))}
        </View>
    );
}
