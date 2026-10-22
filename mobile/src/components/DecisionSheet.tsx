import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Button, Field, T } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

/** Bottom sheet that asks for an optional note before approving/rejecting. */
export function DecisionSheet({ visible, title, subtitle, decision, busy, onCancel, onConfirm }: {
    visible: boolean; title: string; subtitle?: string; decision: 'Approved' | 'Rejected'; busy?: boolean;
    onCancel: () => void; onConfirm: (note: string) => void;
}) {
    const t = useTheme();
    const [note, setNote] = useState('');
    useEffect(() => { if (visible) setNote(''); }, [visible]);
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={onCancel} />
                <View style={{ backgroundColor: t.card, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
                    <T v="h2">{decision === 'Approved' ? 'Approve' : 'Reject'}: {title}</T>
                    {subtitle ? <T v="sub">{subtitle}</T> : null}
                    <Field label={decision === 'Rejected' ? 'Reason (shown to employee)' : 'Note (optional)'} value={note} onChangeText={setNote} multiline />
                    <Button
                        title={decision === 'Approved' ? 'Approve' : 'Reject'} variant={decision === 'Approved' ? 'primary' : 'danger'}
                        loading={busy} disabled={decision === 'Rejected' && note.trim().length < 3} onPress={() => onConfirm(note.trim())}
                    />
                    <Button title="Cancel" variant="ghost" onPress={onCancel} />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
