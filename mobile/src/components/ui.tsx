import React from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
    View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, toneColors, useTheme, type Tone } from '@/theme';
import { ApiError } from '@/api/client';

/** Screen: safe area + scroll + pull-to-refresh. Every tab/screen uses this so spacing is consistent. */
export function Screen({
    children, onRefresh, refreshing = false, scroll = true, edges = ['top'], padded = true, keyboard = false,
}: {
    children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean;
    edges?: ('top' | 'bottom' | 'left' | 'right')[]; padded?: boolean; keyboard?: boolean;
}) {
    const t = useTheme();
    const body = scroll ? (
        <ScrollView
            contentContainerStyle={{ padding: padded ? space.lg : 0, paddingBottom: space.xxl * 2, gap: space.md }}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} colors={[t.primary]} /> : undefined}
        >
            {children}
        </ScrollView>
    ) : (
        <View style={{ flex: 1, padding: padded ? space.lg : 0, gap: space.md }}>{children}</View>
    );
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={edges}>
            {keyboard ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{body}</KeyboardAvoidingView> : body}
        </SafeAreaView>
    );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
    const t = useTheme();
    const base: ViewStyle = { backgroundColor: t.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: space.lg };
    if (onPress) {
        return <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>;
    }
    return <View style={[base, style]}>{children}</View>;
}

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'sub' | 'label' | 'big';
const TEXT: Record<Variant, TextStyle> = {
    big: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
    h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
    h2: { fontSize: 18, fontWeight: '700' },
    h3: { fontSize: 15, fontWeight: '600' },
    body: { fontSize: 15 },
    sub: { fontSize: 13 },
    label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
};

export function T({ v = 'body', color, style, children, numberOfLines }: {
    v?: Variant; color?: string; style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number;
}) {
    const t = useTheme();
    const c = color ?? (v === 'sub' || v === 'label' ? t.sub : t.text);
    return <Text numberOfLines={numberOfLines} style={[TEXT[v], { color: c }, style]}>{children}</Text>;
}

export function Button({
    title, onPress, variant = 'primary', loading = false, disabled = false, icon, style,
}: {
    title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean;
    disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
    const t = useTheme();
    const map = {
        primary: { bg: t.primary, fg: t.onPrimary, border: t.primary },
        secondary: { bg: t.card, fg: t.text, border: t.border },
        danger: { bg: t.danger, fg: '#fff', border: t.danger },
        ghost: { bg: 'transparent', fg: t.primary, border: 'transparent' },
    }[variant];
    const off = disabled || loading;
    return (
        <Pressable
            onPress={off ? undefined : onPress}
            accessibilityRole="button"
            style={({ pressed }) => [{
                backgroundColor: map.bg, borderColor: map.border, borderWidth: 1, borderRadius: radius.md, minHeight: 48,
                paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm,
                opacity: off ? 0.55 : pressed ? 0.85 : 1,
            }, style]}
        >
            {loading ? <ActivityIndicator color={map.fg} /> : icon}
            <Text style={{ color: map.fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        </Pressable>
    );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
    const t = useTheme();
    const c = toneColors(t, tone);
    return (
        <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
            <Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
        </View>
    );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
    const t = useTheme();
    return (
        <View style={{ gap: 6 }}>
            <T v="label">{label}</T>
            <TextInput
                placeholderTextColor={t.sub}
                {...props}
                style={[{
                    backgroundColor: t.card, color: t.text, borderColor: error ? t.danger : t.border, borderWidth: 1, borderRadius: radius.md,
                    paddingHorizontal: space.md, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 16,
                }, props.multiline ? { minHeight: 90, textAlignVertical: 'top' } : null, props.style]}
            />
            {error ? <T v="sub" color={t.danger}>{error}</T> : null}
        </View>
    );
}

export function Stat({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: Tone }) {
    const t = useTheme();
    const c = toneColors(t, tone);
    return (
        <View style={{ flex: 1, backgroundColor: tone === 'neutral' ? t.muted : c.bg, borderRadius: radius.md, padding: space.md, gap: 2, minWidth: 90 }}>
            <Text style={{ color: tone === 'neutral' ? t.text : c.fg, fontSize: 22, fontWeight: '700' }}>{value}</Text>
            <Text style={{ color: t.sub, fontSize: 12 }}>{label}</Text>
        </View>
    );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function Divider() {
    const t = useTheme();
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
            <T v="h2">{children}</T>
            {right}
        </View>
    );
}

export function Loader({ label }: { label?: string }) {
    const t = useTheme();
    return (
        <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator color={t.primary} />
            {label ? <T v="sub">{label}</T> : null}
        </View>
    );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <View style={{ padding: space.xl, alignItems: 'center', gap: 4 }}>
            <T v="h3">{title}</T>
            {hint ? <T v="sub" style={{ textAlign: 'center' }}>{hint}</T> : null}
        </View>
    );
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
    const t = useTheme();
    const offline = error instanceof ApiError && error.isNetwork;
    return (
        <Card style={{ backgroundColor: t.dangerSoft, borderColor: t.dangerSoft, gap: space.sm }}>
            <T v="h3" color={t.danger}>{offline ? 'No connection' : 'Could not load'}</T>
            <T v="sub" color={t.danger}>{errText(error)}</T>
            {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
        </Card>
    );
}

export function Segmented<V extends string>({ value, options, onChange }: {
    value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
    const t = useTheme();
    return (
        <View style={{ flexDirection: 'row', backgroundColor: t.muted, borderRadius: radius.md, padding: 3 }}>
            {options.map(o => {
                const on = o.value === value;
                return (
                    <Pressable key={o.value} onPress={() => onChange(o.value)} style={{
                        flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md - 2, backgroundColor: on ? t.card : 'transparent',
                    }}>
                        <Text style={{ color: on ? t.text : t.sub, fontWeight: on ? '700' : '500', fontSize: 13 }}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Simple list row with title/subtitle/right-side element, used across HR lists. */
export function ListRow({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
    return (
        <Card onPress={onPress} style={{ paddingVertical: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: 2 }}>
                    <T v="h3" numberOfLines={1}>{title}</T>
                    {subtitle ? <T v="sub" numberOfLines={2}>{subtitle}</T> : null}
                </View>
                {right}
            </Row>
        </Card>
    );
}
