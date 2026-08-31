import { NextResponse } from 'next/server';
import { runActivityTick } from '@/app/lib/sim-tick';
import { isActivityGeneratorPermitted, ActivityGeneratorDisabledError } from '@/scripts/sim/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Background activity generator — scheduler entry point.
 *
 * Advances the designated organization by one tick. Safe at any cadence; every five
 * minutes is a good default:
 *   { "path": "/api/cron/sim-tick", "schedule": "*\/5 * * * *" }
 *
 * Two independent gates, both required:
 *   1. SIM_ENABLED=1 + SIM_ORG_ID  — absent on real deploys, so this route does not
 *      exist there. It returns 404 rather than 403 deliberately: a deploy that never
 *      opted in should not advertise that the endpoint is implemented.
 *   2. The organization's own activity_generator_enabled toggle, checked inside the tick.
 *
 * /api/cron/* is already bypassed in proxy.ts, so no route-guard change is needed —
 * auth is the CRON_SECRET bearer token below.
 */
export async function GET(request: Request) {
    // Gate 1: does this deployment run the generator at all?
    if (!isActivityGeneratorPermitted()) {
        return new NextResponse(null, { status: 404 });
    }

    // Unlike the read-only cron jobs, this endpoint writes patient-shaped records, so a
    // missing secret is a misconfiguration rather than a reason to skip the check.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.error('[activity-tick] CRON_SECRET is not configured — refusing to run.');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await runActivityTick();
        return NextResponse.json(result);
    } catch (err) {
        // A guard failure means the environment is pointed somewhere it should not be.
        // Surface it as a hard error rather than an empty success.
        if (err instanceof ActivityGeneratorDisabledError) {
            console.error('[activity-tick] refused:', err.message);
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        console.error('[activity-tick] failed:', err);
        return NextResponse.json({ error: 'Tick failed' }, { status: 500 });
    }
}
