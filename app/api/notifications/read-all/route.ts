import { NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/read-all
 * Mark every unread receipt for the current user as read.
 */
export async function POST() {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const result = await db.notificationReceipt.updateMany({
            where: { user_id: session.id, organizationId, read_at: null },
            data: { read_at: new Date() },
        });

        return NextResponse.json({ success: true, updated: result.count });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Mark All Notifications Read Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
