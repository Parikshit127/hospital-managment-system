import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications?limit=50
 * List the current user's notifications (broadcast receipts), newest first,
 * with a per-user read flag and the total unread count for resync.
 */
export async function GET(request: NextRequest) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const limitParam = Number(request.nextUrl.searchParams.get('limit'));
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

        const [receipts, unreadCount] = await Promise.all([
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
        ]);

        const notifications = receipts.map((r: any) => ({
            receiptId: r.id,
            broadcastId: r.broadcast.id,
            title: r.broadcast.title,
            body: r.broadcast.body,
            audience: r.broadcast.audience,
            releaseNoteId: r.broadcast.release_note_id,
            read: r.read_at !== null,
            readAt: r.read_at ? r.read_at.toISOString() : null,
            createdAt: (r.broadcast.sent_at ?? r.created_at).toISOString(),
        }));

        return NextResponse.json({ success: true, notifications, unreadCount });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('List Notifications Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
