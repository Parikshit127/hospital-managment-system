import { NextResponse } from 'next/server';
import { processPillReminders } from '@/backend/pill-scheduler';

export async function GET(request: Request) {
  // Verify secret token in the header to ensure only authorized callers can execute
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    await processPillReminders();
    return NextResponse.json({ success: true, message: 'Pill reminders processed' });
  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
