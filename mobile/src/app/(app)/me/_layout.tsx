import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function MeStack() {
    const t = useTheme();
    return (
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="edit" options={{ title: 'Edit my details' }} />
            <Stack.Screen name="roster" options={{ title: 'My roster' }} />
        </Stack>
    );
}
