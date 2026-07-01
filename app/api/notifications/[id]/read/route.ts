import { NextResponse } from 'next/server';
import { requireTenantContext, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/:id/read
 * Mark a single receipt as read. `id` is the NOTIFICATION RECEIPT id.
 * Scoped to the current user so one user cannot mark another's receipt.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const { id } = await params;

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
