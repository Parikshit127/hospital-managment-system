import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { hrApi } from '@/api/hr';
import { Button, Empty, ErrorBox, Field, Loader, T } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

export interface PickedEmployee { id: number; name: string; code: string; designation: string }

/** Searchable employee chooser (modal). Used for reporting manager, roster assignment, filing leave. */
export function EmployeePicker({ visible, onClose, onPick, title = 'Choose employee' }: {
    visible: boolean; onClose: () => void; onPick: (e: PickedEmployee) => void; title?: string;
}) {
    const t = useTheme();
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => { const id = setTimeout(() => setSearch(text.trim()), 300); return () => clearTimeout(id); }, [text]);
    useEffect(() => { if (visible) { setText(''); setSearch(''); } }, [visible]);

    const q = useQuery({
        queryKey: ['hr-employees-pick', search], enabled: visible,
        queryFn: () => hrApi.employees({ search: search || undefined, limit: 30, isActive: true }).then(r => r.data),
    });

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: space.xxl, padding: space.lg, gap: space.md }}>
                <T v="h2">{title}</T>
                <Field label="Search name, code or phone" value={text} onChangeText={setText} autoCapitalize="none" />
                <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
                    {q.isLoading ? <Loader /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? q.data.map(e => (
                        <Pressable key={e.id} onPress={() => { onPick({ id: e.id, name: e.name, code: e.employee_code, designation: e.designation }); onClose(); }}
                            style={{ backgroundColor: t.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: t.border }}>
                            <T v="h3">{e.name}</T>
                            <T v="sub">{e.employee_code} · {e.designation}</T>
                        </Pressable>
                    )) : <Empty title="No matches" />}
                </ScrollView>
                <Button title="Close" variant="secondary" onPress={onClose} />
            </View>
        </Modal>
    );
}
