/**
 * Server-side Supabase Realtime broadcast publisher for notifications.
 *
 * WHY HTTP (not a socket): Vercel serverless functions can't hold a persistent
 * WebSocket, so we publish via Supabase Realtime's HTTP broadcast endpoint
 * (POST /realtime/v1/api/broadcast). Browsers still SUBSCRIBE over WebSocket;
 * only the server->Supabase publish leg is HTTP. (Distinct from the client-side
 * useRealtimeSubscription hook in app/lib/realtime.ts.)
 *
 * CHANNEL NAMING CONVENTION (client subscribes to exactly this):
 *   notifications:{organizationId}:{userId}
 * EVENT NAME:
 *   new_notification
 * Per-user channels keep one user's notifications private to that user.
 */

export const NOTIFICATION_EVENT = 'new_notification';

export function userNotificationChannel(organizationId: string, userId: string): string {
    return `notifications:${organizationId}:${userId}`;
}

export interface NotificationRealtimePayload {
    kind: 'broadcast';
    broadcastId: string;
    title: string;
    body: string;
    createdAt: string;
    // A hint only — clients should call GET /api/notifications/unread-count for
    // the authoritative, tab-accurate unread count.
}

const MAX_MESSAGES_PER_REQUEST = 100;

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function postBroadcast(url: string, serviceKey: string, messages: unknown[]): Promise<void> {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
        console.error('[Realtime] broadcast failed', res.status, await res.text().catch(() => ''));
    }
}

/**
 * Publish a notification to many users at once (one message per user's channel).
 * Never throws — realtime is best-effort; the REST unread-count is authoritative.
 */
export async function publishNotificationToUsers(
    organizationId: string,
    userIds: string[],
    payload: NotificationRealtimePayload,
): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.error('[Realtime] Missing Supabase env; skipping publish');
        return;
    }
    if (userIds.length === 0) return;

    const messages = userIds.map((userId) => ({
        topic: userNotificationChannel(organizationId, userId),
        event: NOTIFICATION_EVENT,
        payload,
    }));

    try {
        for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
            await postBroadcast(url, serviceKey, batch);
        }
    } catch (err) {
        console.error('[Realtime] publish error', err);
    }
}
