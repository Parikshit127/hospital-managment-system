import { NextRequest, NextResponse } from 'next/server';
import { checkBudgetThresholds, updateActuals } from '@/app/actions/budget-actions';
import { prisma } from '@/backend/db';

/**
 * Daily Budget Alerts Cron Job
 * Run daily at midnight to check budget thresholds
 *
 * Vercel Cron config:
 * { "path": "/api/cron/budget-alerts", "schedule": "0 0 * * *" }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Budget Alerts Cron] Starting daily check');

    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results = [];

    for (const org of organizations) {
      // Find all active budgets for this org
      const activeBudgets = await prisma.budgetMaster.findMany({
        where: {
          organizationId: org.id,
          status: { in: ['Active', 'Approved'] },
          start_date: { lte: new Date() },
          end_date: { gte: new Date() },
        },
      });

      for (const budget of activeBudgets) {
        // Update actuals from expenses
        await updateActuals(budget.id);

        // Check thresholds and create alerts
        const alertResult = await checkBudgetThresholds(budget.id);

        results.push({
          organization: org.name,
          budget: budget.budget_name,
          alerts_created: alertResult.success ? alertResult.alerts_created : 0,
          error: alertResult.success ? null : alertResult.error,
        });
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      organizations_checked: organizations.length,
      budgets_checked: results.length,
      total_alerts: results.reduce((s: number, r: any) => s + (r.alerts_created || 0), 0),
    };

    console.log('[Budget Alerts Cron] Summary:', summary);

    return NextResponse.json({ success: true, summary, results });
  } catch (error: any) {
    console.error('[Budget Alerts Cron] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Budget Alerts Cron Job',
    usage: 'POST to trigger daily budget threshold check',
    schedule: 'Daily at midnight (0 0 * * *)',
  });
}
