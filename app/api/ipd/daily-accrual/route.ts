import { NextRequest, NextResponse } from 'next/server';
import { getIPDAdmissions, accrueIPDDailyCharges } from '@/app/actions/ipd-actions';

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
        let processed = 0, succeeded = 0, failed = 0;

        for (const admission of admissions) {
            processed++;
            const result = await accrueIPDDailyCharges(admission.admission_id);
            if (result.success) succeeded++;
            else failed++;
        }

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            processed,
            succeeded,
            failed,
        });
    } catch (error: any) {
        console.error('[CRON] IPD daily accrual error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
