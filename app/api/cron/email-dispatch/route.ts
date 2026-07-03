import { NextResponse } from 'next/server';
import { EmailJobStatus } from '@prisma/client';
import { prisma } from '@/backend/db';
import { sendEmail } from '@/backend/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Email Outbox Dispatch Cron (v4 Addendum).
 * Drains PENDING EmailJob rows and sends them via the shared sendEmail() util.
 * Uses base (non-tenant) Prisma so it processes jobs across every organization.
 * Same Vercel Cron + CRON_SECRET pattern as /api/cron/broadcast-dispatch.
 *
 * Vercel Cron config:
 * { "path": "/api/cron/email-dispatch", "schedule": "*\/2 * * * *" }
 */

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        // Fail-closed: refuse to run if CRON_SECRET is unset OR the bearer token
        // does not match. An unconfigured secret must NEVER leave this
        // state-mutating endpoint publicly callable.
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const jobs = await prisma.emailJob.findMany({
            where: { status: EmailJobStatus.PENDING },
            orderBy: { created_at: 'asc' },
            take: BATCH_SIZE,
        });

        let sent = 0;
        let failed = 0;

        for (const job of jobs) {
            try {
                const res = await sendEmail({
                    to: job.recipient_email,
                    subject: job.subject,
                    html: job.body,
                    organizationId: job.organizationId ?? undefined,
                });

                if (res?.success) {
                    await prisma.emailJob.update({
                        where: { id: job.id },
                        data: {
                            status: EmailJobStatus.SENT,
                            processed_at: new Date(),
                            attempts: { increment: 1 },
                        },
                    });
                    sent++;
                } else {
                    const attempts = job.attempts + 1;
                    await prisma.emailJob.update({
                        where: { id: job.id },
                        data: {
                            attempts,
                            status: attempts >= MAX_ATTEMPTS ? EmailJobStatus.FAILED : EmailJobStatus.PENDING,
                            error_message: (res as { error?: string })?.error ?? 'sendEmail returned failure',
                        },
                    });
                    failed++;
                }
            } catch (err: any) {
                const attempts = job.attempts + 1;
                await prisma.emailJob.update({
                    where: { id: job.id },
                    data: {
                        attempts,
                        status: attempts >= MAX_ATTEMPTS ? EmailJobStatus.FAILED : EmailJobStatus.PENDING,
                        error_message: err?.message ?? 'Unknown dispatch error',
                    },
                });
                failed++;
            }
        }

        const summary = { timestamp: new Date().toISOString(), scanned: jobs.length, sent, failed };
        console.log('[Email Dispatch Cron] Summary:', summary);
        return NextResponse.json({ success: true, summary });
    } catch (error: any) {
        console.error('[Email Dispatch Cron] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
