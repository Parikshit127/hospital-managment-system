import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/backend/db';
import { nextChaseAt, MAX_ESCALATION_LEVEL } from '@/app/lib/escalation-policy';

/**
 * Chase a NEWS escalation nobody has answered.
 *
 * The gap this closes: a deteriorating patient was alerted once and then
 * forgotten. If the doctor missed the notification — off the ward, phone down,
 * simply busy — nothing happened at all, and the nurse had no way to tell the
 * difference between "seen and being handled" and "nobody is coming".
 *
 * Level 1 re-alerts the same doctor, because a missed notification is far more
 * likely than a refusal. Level 2 pulls in the people who can find another
 * doctor: at that point the problem is organisational, not clinical.
 *
 * Runs every minute. The emergency band allows ten minutes to acknowledge, so a
 * coarser schedule would spend most of the budget waiting for the next tick.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orgs = await prisma.organization.findMany({
            where: { is_active: true },
            select: { id: true, name: true },
        });

        const now = new Date();
        const results: Array<{ organization: string; chased: number; error?: string }> = [];
        let totalChased = 0;

        for (const org of orgs) {
            try {
                const db = getTenantPrisma(org.id);

                const overdue = await db.nEWSEscalation.findMany({
                    where: {
                        status: 'awaiting',
                        due_at: { lt: now },
                        escalation_level: { lt: MAX_ESCALATION_LEVEL },
                    },
                    take: 200,
                });
                if (!overdue.length) { results.push({ organization: org.name, chased: 0 }); continue; }

                for (const esc of overdue) {
                    const level = esc.escalation_level + 1;

                    const admission = await db.admissions.findUnique({
                        where: { admission_id: esc.admission_id },
                        select: { bed_id: true, patient: { select: { full_name: true } }, ward: { select: { ward_name: true } } },
                    });
                    const who = admission?.patient?.full_name ?? esc.patient_id;
                    const where = [admission?.ward?.ward_name, admission?.bed_id].filter(Boolean).join(' · ');
                    const waited = Math.round((now.getTime() - new Date(esc.raised_at).getTime()) / 60000);

                    const recipients = new Set<string>();
                    if (level === 1 && esc.target_doctor_id) {
                        recipients.add(esc.target_doctor_id);
                    } else {
                        // Level 2, or level 1 with no doctor to chase.
                        const staff = await db.user.findMany({
                            where: { is_active: true, role: { in: ['ipd_manager', 'admin'] } },
                            select: { id: true },
                        });
                        staff.forEach((s: { id: string }) => recipients.add(s.id));
                        if (esc.target_doctor_id) recipients.add(esc.target_doctor_id);
                    }

                    if (recipients.size) {
                        await db.notification.createMany({
                            data: [...recipients].map((user_id) => ({
                                user_id,
                                title: level === 1
                                    ? `UNANSWERED — NEWS ${esc.news_score}, ${waited} min`
                                    : `NOBODY HAS ANSWERED — NEWS ${esc.news_score}, ${waited} min`,
                                body: level === 1
                                    ? `${who} (${where}) scored NEWS ${esc.news_score} ${waited} minutes ago and has not been acknowledged. Open Escalations to respond.`
                                    : `${who} (${where}) scored NEWS ${esc.news_score} ${waited} minutes ago. The attending doctor has not responded. Find a doctor for this patient now.`,
                                type: 'error',
                                link: '/doctor/escalations',
                            })),
                        });
                    }

                    await db.nEWSEscalation.update({
                        where: { id: esc.id },
                        data: {
                            escalation_level: level,
                            last_escalated_at: now,
                            // Give the next tier its own window rather than
                            // re-firing every minute from here on.
                            due_at: nextChaseAt(esc.band, now),
                        },
                    });

                    totalChased++;
                }

                results.push({ organization: org.name, chased: overdue.length });
            } catch (e) {
                results.push({
                    organization: org.name,
                    chased: 0,
                    error: e instanceof Error ? e.message : 'unknown',
                });
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: now.toISOString(),
            organizations: orgs.length,
            escalations_chased: totalChased,
            results,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Escalation sweep failed';
        console.error('[CRON] escalation-timeout error:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
