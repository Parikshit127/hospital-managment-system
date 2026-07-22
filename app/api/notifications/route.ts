import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications?limit=50
 * The current user's notifications, newest first, with a per-user read flag and
 * the total unread count for resync.
 *
 * Two sources are merged here:
 *  - Broadcast receipts — admin announcements sent to an audience.
 *  - Direct notifications (the `Notification` table) — raised per user by
 *    features such as lab results, dunning, coordinator hand-offs and asset
 *    maintenance reminders.
 *
 * The bell previously read broadcasts only, so everything in the second group
 * was written and never surfaced there — you had to open /notifications or the
 * Help Center panel (which already merged both) to see any of it.
 */
export async function GET(request: NextRequest) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const limitParam = Number(request.nextUrl.searchParams.get('limit'));
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

        const [receipts, receiptUnread, direct, directUnread] = await Promise.all([
            db.notificationReceipt.findMany({
                where: { user_id: session.id, organizationId },
                orderBy: { created_at: 'desc' },
                take: limit,
                include: {
                    broadcast: {
                        select: {
                            id: true,
                            title: true,
                            body: true,
                            audience: true,
                            release_note_id: true,
                            sent_at: true,
                        },
                    },
                },
            }),
            db.notificationReceipt.count({
                where: { user_id: session.id, organizationId, read_at: null },
            }),
            db.notification.findMany({
                where: { user_id: session.id, organizationId },
                orderBy: { created_at: 'desc' },
                take: limit,
            }),
            db.notification.count({
                where: { user_id: session.id, organizationId, is_read: false },
            }),
        ]);

        const fromBroadcasts = receipts.map((r: any) => ({
            id: r.id,
            source: 'broadcast' as const,
            receiptId: r.id,
            broadcastId: r.broadcast.id,
            title: r.broadcast.title,
            body: r.broadcast.body,
            audience: r.broadcast.audience,
            releaseNoteId: r.broadcast.release_note_id,
            link: null as string | null,
            read: r.read_at !== null,
            readAt: r.read_at ? r.read_at.toISOString() : null,
            createdAt: (r.broadcast.sent_at ?? r.created_at).toISOString(),
        }));

        const fromDirect = direct.map((n: any) => ({
            id: `direct:${n.id}`,
            source: 'direct' as const,
            receiptId: `direct:${n.id}`,   // the bell marks read by this key
            broadcastId: null as string | null,
            title: n.title,
            body: n.body,
            // Reuse the audience field for the badge colour; the bell keys off it.
            audience: (n.type ?? 'info').toUpperCase(),
            releaseNoteId: null as string | null,
            link: n.link ?? null,
            read: Boolean(n.is_read),
            readAt: null as string | null,
            createdAt: new Date(n.created_at).toISOString(),
        }));

        const notifications = [...fromBroadcasts, ...fromDirect]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);

        return NextResponse.json({
            success: true,
            notifications,
            unreadCount: receiptUnread + directUnread,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('List Notifications Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
