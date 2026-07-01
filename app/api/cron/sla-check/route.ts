import { NextResponse } from 'next/server';
import { TicketStatus } from '@prisma/client';
import { prisma } from '@/backend/db';
import { evaluateTicketSla } from '@/app/lib/sla';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SLA Breach Detection Cron Job
 * Scans all open/unresolved tickets (across every organization) and flags those
 * that have breached their first-response or resolution SLA.
 *
 * Vercel Cron invokes this via GET with `Authorization: Bearer $CRON_SECRET`.
 * Vercel Cron config:
 * { "path": "/api/cron/sla-check", "schedule": "*\/15 * * * *" }
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Enforced whenever a secret is configured (always true on Vercel).
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        console.log('[SLA Check Cron] Starting scan at', now.toISOString());

        // Base prisma is NOT tenant-scoped -> scans every organization's tickets.
        const tickets = await prisma.ticket.findMany({
            where: { status: { not: TicketStatus.Resolved } },
            select: {
                id: true,
                title: true,
                priority: true,
                status: true,
                created_at: true,
                organizationId: true,
                branch: { select: { branch_name: true } },
                user: { select: { name: true, username: true } },
            },
        });

        const breaches = [];

        for (const ticket of tickets) {
            const sla = evaluateTicketSla(ticket, now);
            if (!sla.breached) continue;

            const breach = {
                ticketId: ticket.id,
                title: ticket.title,
                priority: ticket.priority,
                status: ticket.status,
                organizationId: ticket.organizationId,
                facility: ticket.branch?.branch_name ?? null,
                createdBy: ticket.user?.name || ticket.user?.username || null,
                createdAt: ticket.created_at.toISOString(),
                responseBreached: sla.responseBreached,
                resolutionBreached: sla.resolutionBreached,
                responseDeadline: sla.responseDeadline?.toISOString() ?? null,
                resolutionDeadline: sla.resolutionDeadline?.toISOString() ?? null,
                responseOverdueMinutes: sla.responseOverdueMinutes,
                resolutionOverdueMinutes: sla.resolutionOverdueMinutes,
            };

            // Flag it (visible in logs / monitoring).
            console.warn('[SLA Check Cron] BREACH', JSON.stringify(breach));
            breaches.push(breach);
        }

        const summary = {
            timestamp: now.toISOString(),
            scanned: tickets.length,
            breachCount: breaches.length,
            responseBreaches: breaches.filter((b) => b.responseBreached).length,
            resolutionBreaches: breaches.filter((b) => b.resolutionBreached).length,
        };

        console.log('[SLA Check Cron] Summary:', summary);

        return NextResponse.json({ success: true, summary, breaches });
    } catch (error: any) {
        console.error('[SLA Check Cron] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
