'use client';

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useCallback, useState } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!supabaseClient) {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

/**
 * Hook that subscribes to Supabase Realtime changes on a table.
 * Falls back to polling if Supabase is not configured.
 *
 * @param table - Postgres table name to subscribe to (e.g., 'appointments')
 * @param onUpdate - Callback fired when a row change is detected
 * @param pollIntervalMs - Fallback polling interval (default 15s)
 */
export function useRealtimeSubscription(
    table: string,
    onUpdate: () => void,
    pollIntervalMs: number = 15000
) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const [isRealtime, setIsRealtime] = useState(false);

    useEffect(() => {
        const supabase = getSupabase();

        if (supabase) {
            // Use Supabase Realtime
            const channel = supabase
                .channel(`${table}-changes`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table },
                    () => {
                        onUpdate();
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        setIsRealtime(true);
                    }
                });

            channelRef.current = channel;

            return () => {
                channel.unsubscribe();
                channelRef.current = null;
            };
        } else {
            // Fallback to polling
            setIsRealtime(false);
            const interval = setInterval(onUpdate, pollIntervalMs);
            return () => clearInterval(interval);
        }
    }, [table, onUpdate, pollIntervalMs]);

    return { isRealtime };
}

/**
 * Calculate dynamic wait time based on doctor's average consultation duration.
 * Position 1 = 1x avg, Position 2 = 2x avg, etc.
 */
export function calculateWaitTime(position: number, avgConsultMinutes: number = 15): number {
    return position * avgConsultMinutes;
}

/**
 * Format wait time as human-readable string.
 */
export function formatWaitTime(minutes: number): string {
    if (minutes < 1) return 'Next';
    if (minutes < 60) return `~${Math.round(minutes)}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `~${hrs}h ${mins}m` : `~${hrs}h`;
}
