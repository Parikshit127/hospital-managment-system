import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName, focused: IconName) => ({ color, size, focused: f }: { color: ColorValue; size: number; focused: boolean }) =>
    <Ionicons name={f ? focused : name} size={size} color={color as string} />;

/**
 * The tab bar is built from the server's `capabilities`: everyone gets Home/Attendance/Leave/Me,
 * managers add Team, HR adds HR. Hidden tabs use href:null so they are not even routable.
 */
export default function AppTabs() {
    const t = useTheme();
    const { me } = useAuth();
    const caps = me?.capabilities;

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: t.primary,
                tabBarInactiveTintColor: t.sub,
                tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            }}
        >
            <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
            <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: icon('calendar-outline', 'calendar') }} />
            <Tabs.Screen name="leave" options={{ title: 'Leave', tabBarIcon: icon('airplane-outline', 'airplane') }} />
            <Tabs.Screen name="team" options={{ title: 'Team', href: caps?.manager ? undefined : null, tabBarIcon: icon('people-outline', 'people') }} />
            <Tabs.Screen name="hr" options={{ title: 'HR', href: caps?.hr ? undefined : null, tabBarIcon: icon('briefcase-outline', 'briefcase') }} />
            <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
        </Tabs>
    );
}
