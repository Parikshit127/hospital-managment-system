'use server';

import { requireRoleAndTenant, ForbiddenError, AuthError } from '@/backend/tenant';
import { BroadcastAudience, BroadcastStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { deliverBroadcast, audienceUserWhere } from '@/app/lib/broadcast-delivery';
import { logAudit } from '@/app/lib/audit';

interface SendBroadcastInput {
    title: string;
    body: string;
    audience: BroadcastAudience;
    facilityId?: string | null;
    targetRole?: string | null;
    // ISO datetime. If present AND in the future, the broadcast is scheduled and
    // dispatched later by the broadcast-dispatch cron. Otherwise it sends now.
    scheduledFor?: string | null;
}

/**
 * Compose + send (or schedule) an admin broadcast. Admin role only — a
 * Developer (non-admin) cannot send broadcasts.
 */
export async function sendBroadcast(input: SendBroadcastInput) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(['admin']);

        if (!input.title?.trim() || !input.body?.trim()) {
            return { success: false, error: 'Title and body are required' };
        }
        if (input.audience === BroadcastAudience.FACILITY && !input.facilityId) {
            return { success: false, error: 'facilityId is required for a FACILITY broadcast' };
        }
        if (input.audience === BroadcastAudience.ROLE && !input.targetRole) {
            return { success: false, error: 'targetRole is required for a ROLE broadcast' };
        }

        const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
        const isScheduled = scheduledFor !== null && scheduledFor.getTime() > Date.now();

        const broadcast = await db.broadcast.create({
            data: {
                title: input.title.trim(),
                body: input.body.trim(),
                audience: input.audience,
                facility_id: input.audience === BroadcastAudience.FACILITY ? input.facilityId : null,
                target_role: input.audience === BroadcastAudience.ROLE ? input.targetRole : null,
                status: isScheduled ? BroadcastStatus.SCHEDULED : BroadcastStatus.SENT,
                scheduled_for: scheduledFor,
                sent_at: isScheduled ? null : new Date(),
                created_by: session.id,
                organizationId,
            },
        });

        let recipients = 0;
        if (!isScheduled) {
            recipients = await deliverBroadcast(db, broadcast);
        }

        await logAudit({
            action: isScheduled ? 'broadcast.scheduled' : 'broadcast.sent',
            module: 'Notifications',
            entity_type: 'Broadcast',
            entity_id: broadcast.id,
            details: isScheduled
                ? `Scheduled ${input.audience} broadcast for ${scheduledFor!.toISOString()}`
                : `Sent ${input.audience} broadcast to ${recipients} recipient(s)`,
        });

        revalidatePath('/admin/broadcasts');
        return {
            success: true,
            data: { id: broadcast.id, status: broadcast.status, recipients },
        };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, error: 'Not authorized' };
        }
        console.error('Send Broadcast Error:', error);
        return { success: false, error: 'Internal error' };
    }
}

/**
 * Get audience count for broadcast preview.
 */
export async function getBroadcastAudienceCount(
    audience: BroadcastAudience,
    facilityId?: string | null,
    targetRole?: string | null
) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin']);

        // Same source of truth as deliverBroadcast — preview cannot drift from delivery.
        const count = await db.user.count({
            where: audienceUserWhere({ audience, facility_id: facilityId, target_role: targetRole, organizationId }),
        });

        return { success: true, count };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, error: 'Not authorized', count: 0 };
        }
        console.error('Get Audience Count Error:', error);
        return { success: false, error: 'Internal error', count: 0 };
    }
}

/**
 * List broadcasts for the admin broadcast console (newest first).
 */
export async function getBroadcasts() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin']);

        const data = await db.broadcast.findMany({
            where: { organizationId },
            orderBy: { created_at: 'desc' },
            include: {
                creator: { select: { id: true, name: true, username: true } },
                facility: { select: { id: true, branch_name: true } },
                _count: { select: { receipts: true } },
            },
        });

        return { success: true, data };
    } catch (error) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, data: [] };
        }
        console.error('Get Broadcasts Error:', error);
        return { success: false, data: [] };
    }
}
