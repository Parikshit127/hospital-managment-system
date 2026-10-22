import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Field, Screen, T, errText } from '@/components/ui';
import { APP_VERSION } from '@/config';
import { space, useTheme } from '@/theme';

export default function Login() {
    const t = useTheme();
    const { signIn, submitMfa, cancelMfa, mfaToken } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true); setError(null);
        try { await fn(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
    };

    return (
        <Screen keyboard>
            <View style={{ paddingTop: space.xxl, paddingBottom: space.lg, gap: 6 }}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }}>
                    <T v="h1" color={t.onPrimary}>A</T>
                </View>
                <T v="big">Axten HR</T>
                <T v="sub">Attendance, leave and approvals for your hospital.</T>
            </View>

            {mfaToken ? (
                <Card style={{ gap: space.md }}>
                    <T v="h2">Two-step verification</T>
                    <T v="sub">Enter the 6-digit code from your authenticator app.</T>
                    <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} autoFocus />
                    {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                    <Button title="Verify" loading={busy} disabled={code.trim().length < 4} onPress={() => run(() => submitMfa(code))} />
                    <Button title="Back" variant="ghost" onPress={() => { cancelMfa(); setCode(''); setError(null); }} />
                </Card>
            ) : (
                <Card style={{ gap: space.md }}>
                    <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" />
                    <View>
                        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" textContentType="password" />
                        <Pressable onPress={() => setShow(s => !s)} style={{ alignSelf: 'flex-end', paddingTop: 6 }}>
                            <T v="sub" color={t.primary}>{show ? 'Hide' : 'Show'} password</T>
                        </Pressable>
                    </View>
                    {error ? <T v="sub" color={t.danger}>{error}</T> : null}
                    <Button
                        title="Sign in" loading={busy} disabled={!username.trim() || !password}
                        onPress={() => run(() => signIn(username, password))}
                    />
                    <T v="sub" style={{ textAlign: 'center' }}>Your location is recorded when you sign in and when you punch.</T>
                </Card>
            )}
            <T v="sub" style={{ textAlign: 'center', marginTop: space.lg }}>Version {APP_VERSION}</T>
        </Screen>
    );
}
