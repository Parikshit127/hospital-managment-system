import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/api/client';
import { Button, Loader, Screen, T } from '@/components/ui';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            // Retry flaky mobile networks, but never retry auth/permission/validation errors.
            retry: (count, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && count < 2,
        },
    },
});

function Gate() {
    const { status, reload } = useAuth();

    if (status === 'loading') return <Screen scroll={false}><Loader label="Starting…" /></Screen>;
    if (status === 'offline') {
        return (
            <Screen scroll={false}>
                <T v="h1">Can’t reach the server</T>
                <T v="sub">Your session is safe. Check your internet connection and try again.</T>
                <Button title="Retry" onPress={reload} />
            </Screen>
        );
    }

    // Stack.Protected removes the guarded screens entirely while the guard is false, so a signed-out user
    // can never reach (or deep-link into) the app, and sign-in/out redirects happen automatically.
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={status === 'in'}>
                <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'out'}>
                <Stack.Screen name="login" />
            </Stack.Protected>
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <StatusBar style="auto" />
                        <Gate />
                    </AuthProvider>
                </QueryClientProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
