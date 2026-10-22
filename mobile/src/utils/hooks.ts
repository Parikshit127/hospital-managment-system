import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

/** Re-render every `ms` so "worked so far" counters stay live. */
export function useNow(ms = 30_000): number {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(id);
    }, [ms]);
    return now;
}

/** Invalidate several query families at once after a mutation. */
export function useInvalidate() {
    const qc = useQueryClient();
    return (...keys: string[]) => Promise.all(keys.map(k => qc.invalidateQueries({ queryKey: [k] })));
}

export function confirm(title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) {
    Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
}

export const notify = (title: string, message?: string) => Alert.alert(title, message);
