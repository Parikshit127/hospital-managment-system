import { NextRequest, NextResponse } from 'next/server';
import { escalateBedCleaningSLA, getBedCleaningSLAStatus } from '@/app/actions/ipd-automation-actions';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [statusRes, escalationRes] = await Promise.all([
            getBedCleaningSLAStatus(),
            escalateBedCleaningSLA(),
        ]);

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            beds_in_cleaning: statusRes.data?.length ?? 0,
            breached: statusRes.data?.filter((b: any) => b.breached).length ?? 0,
            escalated: escalationRes.success ? (escalationRes as any).escalated : 0,
            details: statusRes.data,
        });
    } catch (error: any) {
        console.error('[CRON] Bed cleaning SLA error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
