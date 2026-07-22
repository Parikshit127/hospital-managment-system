import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

/**
 * Daily Asset Maintenance / Warranty Reminders
 *
 * Recording a "next service due" date is useless if nothing ever surfaces it —
 * previously the date sat in the register and someone had to remember to go and
 * look. This raises an in-app notification for admins when a service is overdue
 * or falls due shortly, and when a warranty is about to lapse.
 *
 * Schedule (Vercel cron):
 *   { "path": "/api/cron/asset-maintenance-reminders", "schedule": "0 3 * * *" }
 * or from the server's crontab:
 *   0 3 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/asset-maintenance-reminders
 *
 * Idempotent: re-running on the same day will not duplicate a notification,
 * because it checks for one already raised for the same asset today.
 */

const SOON_DAYS = 14;      // service falling due within a fortnight
const WARRANTY_DAYS = 30;  // warranty lapsing within a month

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const soonCutoff = new Date(now.getTime() + SOON_DAYS * 86400000);
        const warrantyCutoff = new Date(now.getTime() + WARRANTY_DAYS * 86400000);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
        const results: any[] = [];

        for (const org of organizations) {
            const assets = await prisma.fixedAsset.findMany({
                where: {
                    organizationId: org.id,
                    status: 'Active',
                    OR: [
                        { next_maintenance_date: { lte: soonCutoff } },
                        { warranty_expiry: { gte: now, lte: warrantyCutoff } },
                    ],
                },
                select: {
                    id: true, asset_code: true, asset_name: true, location: true,
                    next_maintenance_date: true, warranty_expiry: true,
                },
            });
            if (assets.length === 0) continue;

            // Notify the people who can act on it.
            const admins = await prisma.user.findMany({
                where: { organizationId: org.id, role: { in: ['admin'] }, is_active: true },
                select: { id: true },
            });
            if (admins.length === 0) continue;

            const overdue = assets.filter(a => a.next_maintenance_date && a.next_maintenance_date < now);
            const dueSoon = assets.filter(a => a.next_maintenance_date && a.next_maintenance_date >= now && a.next_maintenance_date <= soonCutoff);
            const warranty = assets.filter(a => a.warranty_expiry && a.warranty_expiry >= now && a.warranty_expiry <= warrantyCutoff);

            const lines: string[] = [];
            if (overdue.length) lines.push(`${overdue.length} overdue service${overdue.length > 1 ? 's' : ''}`);
            if (dueSoon.length) lines.push(`${dueSoon.length} due within ${SOON_DAYS} days`);
            if (warranty.length) lines.push(`${warranty.length} warranty expiring within ${WARRANTY_DAYS} days`);
            if (lines.length === 0) continue;

            // One asset can be both overdue and out of warranty — list it once.
            const sampleAssets = Array.from(
                new Map([...overdue, ...dueSoon, ...warranty].map(a => [a.id, a])).values()
            );
            const sample = sampleAssets
                .slice(0, 3)
                .map(a => `${a.asset_code} ${a.asset_name}`)
                .join(', ');
            const extra = Math.max(0, sampleAssets.length - 3);

            const title = 'Asset maintenance due';
            const body = `${lines.join(' · ')}. e.g. ${sample}${extra ? ` and ${extra} more` : ''}.`;

            for (const admin of admins) {
                // Don't re-notify the same admin twice in one day.
                const existing = await prisma.notification.findFirst({
                    where: {
                        user_id: admin.id,
                        organizationId: org.id,
                        title,
                        created_at: { gte: startOfToday },
                    },
                    select: { id: true },
                });
                if (existing) continue;

                await prisma.notification.create({
                    data: {
                        user_id: admin.id,
                        organizationId: org.id,
                        title,
                        body,
                        type: overdue.length ? 'warning' : 'info',
                        link: '/admin/assets',
                    },
                });
            }

            results.push({ org: org.name, overdue: overdue.length, dueSoon: dueSoon.length, warranty: warranty.length, notified: admins.length });
        }

        return NextResponse.json({ ok: true, checked: organizations.length, results });
    } catch (error: any) {
        console.error('[Asset Maintenance Reminders] failed:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}

// Some schedulers can only issue GET; same work either way.
export async function GET(request: NextRequest) {
    return POST(request);
}
