import { NextRequest, NextResponse } from 'next/server';
import { getDepositAlerts } from '@/app/actions/ipd-automation-actions';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await getDepositAlerts();
        if (!result.success) {
            return NextResponse.json({ ok: false, error: 'Failed to fetch deposit alerts' }, { status: 500 });
        }

        const alerts = result.data ?? [];
        const critical = alerts.filter((a: any) => a.alertLevel === 'critical' || a.alertLevel === 'blocked').length;
        const warning = alerts.filter((a: any) => a.alertLevel === 'warning').length;
        const info = alerts.filter((a: any) => a.alertLevel === 'info').length;

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            total: alerts.length,
            critical,
            warning,
            info,
            alerts,
        });
    } catch (error: any) {
        console.error('[CRON] Deposit alerts error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
