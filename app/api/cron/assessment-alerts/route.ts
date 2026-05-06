import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

/**
 * GAP 5 — Cron: Check overdue 2-hour initial assessments and send group alerts
 * Run every 15 minutes via Vercel Cron or external scheduler.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    try {
        // Find assessments that are overdue and haven't had alerts sent yet
        const overdueAlerts = await (prisma as any).nursingAssessmentAlert.findMany({
            where: {
                assessment_completed: false,
                assessment_due_at: { lt: now },
                alert_sent_to_group: false,
            },
        });

        let notified = 0;

        for (const alert of overdueAlerts) {
            if (alert.doctor_group_id) {
                // Get group members
                const groupMembers = await (prisma.user.findMany as any)({
                    where: { doctor_group_id: alert.doctor_group_id },
                    select: { id: true },
                });

                const notifications = groupMembers.map((m: { id: string }) => ({
                    organizationId: alert.organizationId,
                    user_id: m.id,
                    title: '🚨 OVERDUE: Initial Assessment',
                    body: `Patient ${alert.patient_id} initial assessment is OVERDUE. Was due at ${new Date(alert.assessment_due_at).toLocaleTimeString()}. Please complete immediately.`,
                    type: 'critical',
                }));

                if (notifications.length > 0) {
                    await prisma.notification.createMany({ data: notifications });
                }
            }

            // Mark alert as sent
            await (prisma as any).nursingAssessmentAlert.update({
                where: { id: alert.id },
                data: { alert_sent_to_group: true, alert_sent_at: now },
            });

            notified++;
        }

        return NextResponse.json({
            success: true,
            overdue_count: overdueAlerts.length,
            notifications_sent: notified,
            checked_at: now.toISOString(),
        });
    } catch (error) {
        console.error('Assessment alert cron error:', error);
        return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
    }
}
