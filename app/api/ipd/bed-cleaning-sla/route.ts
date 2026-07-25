import { NextRequest, NextResponse } from 'next/server';
import { autoReleaseStaleCleaningBeds } from '@/app/actions/ipd-automation-actions';
import { prisma, getTenantPrisma } from '@/backend/db';

/**
 * Scheduled bed-cleaning sweep, across every active organization.
 *
 * This used to call actions that resolve the tenant from a user session. A cron
 * has no session, so requireTenantContext() threw, the action swallowed the
 * AuthError and returned an empty result, and the endpoint answered 200 while
 * releasing nothing — a schedule that looks healthy and does no work is worse
 * than no schedule at all. The tenant is now passed in explicitly, one
 * organization at a time.
 *
 * The status/escalation snapshot is deliberately not included: those actions are
 * still session-scoped, and reporting zeroes from them would be the same lie.
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

        const results: Array<{ organization: string; released: number; error?: string }> = [];
        let totalReleased = 0;

        for (const org of orgs) {
            try {
                const db = getTenantPrisma(org.id);
                const res = await autoReleaseStaleCleaningBeds({ db, organizationId: org.id });
                const released = (res as { released?: number }).released ?? 0;
                totalReleased += released;
                results.push({ organization: org.name, released });
            } catch (e) {
                // One tenant failing must not stop the sweep for the rest.
                results.push({
                    organization: org.name,
                    released: 0,
                    error: e instanceof Error ? e.message : 'unknown',
                });
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            organizations: orgs.length,
            beds_released: totalReleased,
            results,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Bed cleaning sweep failed';
        console.error('[CRON] bed-cleaning-sla error:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
