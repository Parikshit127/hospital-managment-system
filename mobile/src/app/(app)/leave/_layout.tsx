import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function LeaveStack() {
    const t = useTheme();
    return (
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="apply" options={{ title: 'Apply for leave', presentation: 'modal' }} />
        </Stack>
    );
}
