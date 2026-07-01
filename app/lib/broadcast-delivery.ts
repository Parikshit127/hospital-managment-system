import { BroadcastAudience } from '@prisma/client';
import { publishNotificationToUsers } from '@/app/lib/notification-realtime';

/**
 * Shared broadcast delivery: resolve the audience to users, create one
 * NotificationReceipt per user (idempotent), and publish realtime events.
 *
 * Used by BOTH the immediate-send server action (tenant-scoped client) and the
 * scheduled-dispatch cron (base client). All queries filter organizationId
 * explicitly so it is correct with either client.
 */

interface DeliverableBroadcast {
    id: string;
    title: string;
    body: string;
    audience: BroadcastAudience;
    facility_id: string | null;
    target_role: string | null;
    organizationId: string;
}

// Accept any Prisma-like client (tenant-scoped or base).
export async function deliverBroadcast(db: any, broadcast: DeliverableBroadcast): Promise<number> {
    // Resolve the target audience to a set of active users in the org.
    const where: Record<string, unknown> = {
        organizationId: broadcast.organizationId,
        is_active: true,
    };
    if (broadcast.audience === BroadcastAudience.FACILITY) {
        where.branch_id = broadcast.facility_id;
    } else if (broadcast.audience === BroadcastAudience.ROLE) {
        where.role = broadcast.target_role;
    }
    // ALL_FACILITIES => no extra filter (every active user in the org).

    const users: Array<{ id: string }> = await db.user.findMany({
        where,
        select: { id: true },
    });

    if (users.length === 0) return 0;

    const userIds = users.map((u) => u.id);

    // One receipt per (broadcast, user). skipDuplicates makes re-delivery safe.
    await db.notificationReceipt.createMany({
        data: userIds.map((userId) => ({
            broadcast_id: broadcast.id,
            user_id: userId,
            organizationId: broadcast.organizationId,
        })),
        skipDuplicates: true,
    });

    // Best-effort realtime nudge; REST unread-count stays authoritative.
    await publishNotificationToUsers(broadcast.organizationId, userIds, {
        kind: 'broadcast',
        broadcastId: broadcast.id,
        title: broadcast.title,
        body: broadcast.body,
        createdAt: new Date().toISOString(),
    });

    return userIds.length;
}
