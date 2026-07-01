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

export interface AudienceSelector {
    audience: BroadcastAudience;
    facility_id?: string | null;
    target_role?: string | null;
    organizationId: string;
}

interface DeliverableBroadcast extends AudienceSelector {
    id: string;
    title: string;
    body: string;
    facility_id: string | null;
    target_role: string | null;
}

/**
 * SINGLE SOURCE OF TRUTH for resolving a broadcast audience to the set of
 * recipient users. Used by BOTH deliverBroadcast (who actually gets a receipt)
 * and getBroadcastAudienceCount (the compose-time preview), so the previewed
 * count can never drift from actual delivery.
 *
 * Note: User has a scalar `branch_id` (no `branches` relation), so FACILITY
 * filters on the scalar. An audience missing its required target matches nobody.
 */
export function audienceUserWhere(sel: AudienceSelector): Record<string, unknown> {
    const where: Record<string, unknown> = {
        organizationId: sel.organizationId,
        is_active: true,
    };
    if (sel.audience === BroadcastAudience.FACILITY) {
        if (!sel.facility_id) return { ...where, id: { in: [] } }; // matches nobody
        where.branch_id = sel.facility_id;
    } else if (sel.audience === BroadcastAudience.ROLE) {
        if (!sel.target_role) return { ...where, id: { in: [] } }; // matches nobody
        where.role = sel.target_role;
    }
    // ALL_FACILITIES => no extra filter (every active user in the org).
    return where;
}

// Accept any Prisma-like client (tenant-scoped or base).
export async function deliverBroadcast(db: any, broadcast: DeliverableBroadcast): Promise<number> {
    const users: Array<{ id: string }> = await db.user.findMany({
        where: audienceUserWhere(broadcast),
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
