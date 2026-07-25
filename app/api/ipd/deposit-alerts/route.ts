import { NextRequest, NextResponse } from 'next/server';
import { getDepositAlerts } from '@/app/actions/ipd-automation-actions';
import { prisma, getTenantPrisma } from '@/backend/db';

/**
 * Scheduled deposit-consumption sweep, across every active organization.
 *
 * This called an action that resolves the tenant from a user session. A cron has
 * none, so requireTenantContext() threw and the endpoint answered 500 — it could
 * never have been scheduled at all. The tenant is now passed in explicitly, one
 * organization at a time.
 *
 * It also notifies rather than only reporting. An alert nobody reads is the same
 * defect as a NEWS score that is calculated and then left on a screen.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orgs = await prisma.organization.findMany({
            where: { is_active: true },
            select: { id: true, name: true },
        });

        const results: Array<Record<string, unknown>> = [];
        let totalAlerts = 0;
        let totalNotified = 0;

        for (const org of orgs) {
            try {
                const db = getTenantPrisma(org.id);
                const res = await getDepositAlerts({ db, organizationId: org.id });
                const alerts = (res.data ?? []) as Array<{ alert_level: string; patient_name: string; percentage: number }>;
                totalAlerts += alerts.length;

                // Only the ones that need money chasing today.
                const urgent = alerts.filter(a => a.alert_level === 'critical' || a.alert_level === 'blocked');
                let notified = 0;
                if (urgent.length) {
                    const staff = await db.user.findMany({
                        where: { organizationId: org.id, is_active: true, role: { in: ['admin', 'ipd_manager', 'finance'] } },
                        select: { id: true },
                    });
                    if (staff.length) {
                        await db.notification.createMany({
                            data: staff.map((s: { id: string }) => ({
                                organizationId: org.id,
                                user_id: s.id,
                                title: `${urgent.length} inpatient deposit(s) nearly consumed`,
                                body: urgent
                                    .slice(0, 5)
                                    .map(a => `${a.patient_name} — ${a.percentage}% of advance used`)
                                    .join('; '),
                                type: 'warning',
                            })),
                        });
                        notified = staff.length;
                        totalNotified += notified;
                    }
                }

                results.push({
                    organization: org.name,
                    alerts: alerts.length,
                    blocked: alerts.filter(a => a.alert_level === 'blocked').length,
                    critical: alerts.filter(a => a.alert_level === 'critical').length,
                    warning: alerts.filter(a => a.alert_level === 'warning').length,
                    notified,
                });
            } catch (e) {
                // One tenant failing must not stop the sweep for the rest.
                results.push({ organization: org.name, error: e instanceof Error ? e.message : 'unknown' });
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            organizations: orgs.length,
            total_alerts: totalAlerts,
            staff_notified: totalNotified,
            results,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Deposit alert sweep failed';
        console.error('[CRON] deposit-alerts error:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
