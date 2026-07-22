import { NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/read-all
 * Mark everything unread for the current user as read — both broadcast
 * receipts and direct notifications, matching what the list endpoint returns.
 */
export async function POST() {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const [receipts, direct] = await Promise.all([
            db.notificationReceipt.updateMany({
                where: { user_id: session.id, organizationId, read_at: null },
                data: { read_at: new Date() },
            }),
            db.notification.updateMany({
                where: { user_id: session.id, organizationId, is_read: false },
                data: { is_read: true },
            }),
        ]);

        return NextResponse.json({ success: true, updated: receipts.count + direct.count });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Mark All Notifications Read Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
