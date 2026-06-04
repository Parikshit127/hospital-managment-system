import { NextRequest, NextResponse } from 'next/server';
import { getIPDAdmissions, accrueIPDDailyCharges } from '@/app/actions/ipd-actions';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Auto-accrual disabled — room/nursing charges are added manually
        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            message: 'Auto-accrual disabled. Room/nursing charges are added manually.',
            processed: 0,
            succeeded: 0,
            failed: 0,
        });
    } catch (error: any) {
        console.error('[CRON] IPD daily accrual error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
