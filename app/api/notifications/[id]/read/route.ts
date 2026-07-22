import { NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/:id/read
 * Mark a single notification as read.
 *
 * `id` is either a broadcast RECEIPT id, or `direct:<n>` for a row in the
 * `Notification` table — the list endpoint now returns both kinds.
 * Scoped to the current user so one user cannot mark another's as read.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const { id } = await params;

        if (id.startsWith('direct:')) {
            const notificationId = Number(id.slice('direct:'.length));
            if (!Number.isFinite(notificationId)) {
                return NextResponse.json({ success: false, error: 'Bad id' }, { status: 400 });
            }
            const res = await db.notification.updateMany({
                where: { id: notificationId, user_id: session.id, organizationId, is_read: false },
                data: { is_read: true },
            });
            return NextResponse.json({ success: true, updated: res.count });
        }

        // updateMany with the user_id guard: 0 rows updated => not theirs / not found.
        const result = await db.notificationReceipt.updateMany({
            where: { id, user_id: session.id, organizationId, read_at: null },
            data: { read_at: new Date() },
        });

        return NextResponse.json({ success: true, updated: result.count });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Mark Notification Read Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
