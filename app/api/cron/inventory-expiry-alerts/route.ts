import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { runExpiryAlertsForOrg, scheduleCycleCountsForOrg } from '@/app/actions/inventory-analytics-actions';

/**
 * Expiry alerts + cycle count scheduler
 * Schedule: 0 6 * * * (6 AM daily)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const results = [];

    for (const org of orgs) {
      const alerts = await runExpiryAlertsForOrg(org.id);
      const cycleCounts = await scheduleCycleCountsForOrg(org.id);
      results.push({ organization: org.name, alerts, cycleCountsCreated: cycleCounts });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Inventory expiry alerts + ABC cycle count scheduler',
    schedule: 'Daily at 6 AM',
  });
}
