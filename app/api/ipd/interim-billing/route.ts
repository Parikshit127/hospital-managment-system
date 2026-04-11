import { NextRequest, NextResponse } from 'next/server';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill } from '@/app/actions/ipd-finance-actions';

const INTERIM_BILLING_INTERVAL_DAYS = 7;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const admissionsRes = await getIPDAdmissions('Admitted');
        if (!admissionsRes.success) {
            return NextResponse.json({ ok: false, error: 'Failed to fetch admissions' }, { status: 500 });
        }

        const admissions = admissionsRes.data ?? [];
        const now = new Date();
        let processed = 0, eligible = 0, succeeded = 0, failed = 0;

        for (const admission of admissions) {
            processed++;
            const admittedAt = new Date(admission.admitted_at);
            const daysSince = Math.floor((now.getTime() - admittedAt.getTime()) / (1000 * 60 * 60 * 24));

            if (daysSince > 0 && daysSince % INTERIM_BILLING_INTERVAL_DAYS === 0) {
                eligible++;
                const result = await generateInterimBill(admission.admission_id);
                if (result.success) succeeded++;
                else failed++;
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: now.toISOString(),
            processed,
            eligible,
            succeeded,
            failed,
        });
    } catch (error: any) {
        console.error('[CRON] Interim billing error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
