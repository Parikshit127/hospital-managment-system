import { NextRequest, NextResponse } from 'next/server';
import { runReorderEngine } from '@/app/actions/inventory-analytics-actions';

/**
 * Daily inventory reorder engine
 * Schedule: 0 1 * * * (1 AM daily)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runReorderEngine();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Inventory reorder cron — generates draft indents and PRs',
    schedule: 'Daily at 1 AM',
  });
}
