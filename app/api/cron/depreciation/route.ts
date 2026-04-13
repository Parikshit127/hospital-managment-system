import { NextRequest, NextResponse } from 'next/server';
import { postMonthlyDepreciation } from '@/app/actions/asset-management-actions';
import { prisma } from '@/backend/db';

/**
 * Monthly Depreciation Cron Job
 * Run on 1st of each month to post depreciation for all organizations
 * 
 * Usage with Vercel Cron:
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/depreciation",
 *     "schedule": "0 0 1 * *"
 *   }]
 * }
 * 
 * Or trigger manually:
 * curl -X POST http://localhost:3000/api/cron/depreciation \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current period (MMYYYY)
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const period = `${month}${year}`;

    console.log(`[Depreciation Cron] Starting for period: ${period}`);

    // Get all active organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results = [];

    for (const org of organizations) {
      console.log(`[Depreciation Cron] Processing organization: ${org.name}`);

      const result = await postMonthlyDepreciation(org.id, period);

      results.push({
        organization_id: org.id,
        name: org.name,
        ...result,
      });

      if (result.success) {
        console.log(
          `[Depreciation Cron] Success for ${org.name}: ` +
          `${result.processed} assets processed, ` +
          `Total depreciation: ${result.total_depreciation}`
        );
      } else {
        console.error(
          `[Depreciation Cron] Failed for ${org.name}: ${result.error}`
        );
      }
    }

    const summary = {
      period,
      timestamp: new Date().toISOString(),
      total_organizations: organizations.length,
      successful: results.filter((r: any) => r.success).length,
      failed: results.filter((r: any) => !r.success).length,
      total_depreciation: results.reduce(
        (sum: number, r: any) => sum + (r.total_depreciation || 0),
        0
      ),
    };

    console.log('[Depreciation Cron] Summary:', summary);

    return NextResponse.json({
      success: true,
      summary,
      results,
    });
  } catch (error: any) {
    console.error('[Depreciation Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for manual testing
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Depreciation Cron Job',
    usage: 'POST to this endpoint to trigger monthly depreciation',
    schedule: 'Runs on 1st of each month at midnight (0 0 1 * *)',
    env_required: 'CRON_SECRET',
  });
}
