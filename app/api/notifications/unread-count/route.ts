import { NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/unread-count
 * Authoritative unread count for the current user. Clients call this on page
 * load and on realtime reconnect to resync, independent of the realtime channel.
 */
export async function GET() {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const unreadCount = await db.notificationReceipt.count({
            where: { user_id: session.id, organizationId, read_at: null },
        });

        return NextResponse.json({ success: true, unreadCount });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Unread Count Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
