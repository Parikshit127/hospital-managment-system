import { NextResponse } from 'next/server';
import { BroadcastStatus } from '@prisma/client';
import { prisma } from '@/backend/db';
import { deliverBroadcast } from '@/app/lib/broadcast-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled Broadcast Dispatch Cron
 * Delivers broadcasts whose scheduled_for has arrived. Reuses the same Vercel
 * Cron + CRON_SECRET pattern as /api/cron/sla-check.
 *
 * Vercel Cron config:
 * { "path": "/api/cron/broadcast-dispatch", "schedule": "*\/5 * * * *" }
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        // Base prisma is NOT tenant-scoped -> dispatches across every organization.
        const due = await prisma.broadcast.findMany({
            where: { status: BroadcastStatus.SCHEDULED, scheduled_for: { lte: now } },
        });

        let delivered = 0;
        let recipients = 0;

        for (const broadcast of due) {
            try {
                const count = await deliverBroadcast(prisma, broadcast);
                await prisma.broadcast.update({
                    where: { id: broadcast.id },
                    data: { status: BroadcastStatus.SENT, sent_at: now },
                });

                // Attribute the send to the admin who scheduled it (no session in cron).
                await prisma.system_audit_logs.create({
                    data: {
                        user_id: broadcast.created_by,
                        username: 'scheduled',
                        role: 'admin',
                        action: 'broadcast.sent',
                        module: 'Notifications',
                        entity_type: 'Broadcast',
                        entity_id: broadcast.id,
                        details: `Scheduled ${broadcast.audience} broadcast dispatched to ${count} recipient(s)`,
                        ip_address: null,
                        organizationId: broadcast.organizationId,
                    },
                });

                delivered++;
                recipients += count;
            } catch (err) {
                console.error('[Broadcast Dispatch] failed for', broadcast.id, err);
            }
        }

        const summary = { timestamp: now.toISOString(), scanned: due.length, delivered, recipients };
        console.log('[Broadcast Dispatch Cron] Summary:', summary);
        return NextResponse.json({ success: true, summary });
    } catch (error: any) {
        console.error('[Broadcast Dispatch Cron] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
