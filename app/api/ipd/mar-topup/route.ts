import { NextRequest, NextResponse } from 'next/server';
import { topUpMedicationSchedules } from '@/app/actions/ipd-emr-actions';
import { prisma, getTenantPrisma } from '@/backend/db';

/**
 * Nightly medication-chart top-up, across every active organization.
 *
 * The MAR is filled to a rolling three-day horizon rather than a fortnight, so
 * something has to move the window. Opening an eMAR already tops it up, which
 * covers any ward in normal use — this job is the guarantee for the ward that
 * has not been opened since the weekend, so a chart cannot quietly run dry.
 *
 * The tenant is passed in explicitly: a cron has no session, and an action that
 * resolves the tenant from one would throw, be swallowed, and report success
 * having scheduled nothing.
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

        const results: Array<{ organization: string; added: number; error?: string }> = [];
        let totalAdded = 0;

        for (const org of orgs) {
            try {
                const db = getTenantPrisma(org.id);
                const res = await topUpMedicationSchedules(undefined, { db, organizationId: org.id });
                const added = res?.added ?? 0;
                totalAdded += added;
                results.push({ organization: org.name, added });
            } catch (e) {
                // One tenant failing must not stop the sweep for the rest.
                results.push({
                    organization: org.name,
                    added: 0,
                    error: e instanceof Error ? e.message : 'unknown',
                });
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            organizations: orgs.length,
            doses_scheduled: totalAdded,
            results,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'MAR top-up failed';
        console.error('[CRON] mar-topup error:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
