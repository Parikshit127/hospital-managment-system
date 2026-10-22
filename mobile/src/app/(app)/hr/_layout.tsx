import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function HrStack() {
    const t = useTheme();
    return (
        <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="employees" options={{ title: 'Employees' }} />
            <Stack.Screen name="employee/[id]" options={{ title: 'Employee' }} />
            <Stack.Screen name="daily" options={{ title: 'Daily attendance' }} />
            <Stack.Screen name="monthly" options={{ title: 'Monthly sheet' }} />
            <Stack.Screen name="requests" options={{ title: 'Requests' }} />
            <Stack.Screen name="roster" options={{ title: 'Shifts & roster' }} />
            <Stack.Screen name="settings" options={{ title: 'HR settings' }} />
            <Stack.Screen name="devices" options={{ title: 'Signed-in phones' }} />
        </Stack>
    );
}
