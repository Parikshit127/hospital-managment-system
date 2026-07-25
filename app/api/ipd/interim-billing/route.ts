import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/backend/db';

const INTERIM_BILLING_INTERVAL_DAYS = 7;

/**
 * Flags long-staying admissions that are due an interim bill.
 *
 * Two things were wrong with the previous version.
 *
 * It could not run. It called getIPDAdmissions() and generateInterimBill(), both
 * of which resolve the tenant from a user session; a cron has none, so the
 * endpoint answered 500. It now iterates active organizations with an explicit
 * tenant.
 *
 * And it would have done nothing even if it had run: eligibility was computed
 * from `admission.admitted_at`, which is not a field on the model — the column
 * is `admission_date` — so daysSince was NaN, `NaN % 7 === 0` is false, and no
 * admission was ever eligible.
 *
 * It now flags and notifies rather than generating bills unattended. Raising a
 * financial document needs an accountable user, and generateInterimBill() writes
 * package invoice lines using the acting session — exactly the "who did this"
 * problem being cleaned up elsewhere in this codebase. The billing team is told
 * which patients are due; a person generates the bill.
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
        const results: Array<Record<string, unknown>> = [];
        let totalDue = 0;
        let totalNotified = 0;

        for (const org of orgs) {
            try {
                const db = getTenantPrisma(org.id);

                const admissions = await db.admissions.findMany({
                    where: { organizationId: org.id, status: 'Admitted' },
                    select: { admission_id: true, admission_date: true, patient_id: true },
                });

                const patientIds = [...new Set(admissions.map((a: { patient_id: string }) => a.patient_id))] as string[];
                const patients = patientIds.length
                    ? await db.oPD_REG.findMany({
                        where: { patient_id: { in: patientIds } },
                        select: { patient_id: true, full_name: true },
                    })
                    : [];
                const nameOf = Object.fromEntries(
                    patients.map((p: { patient_id: string; full_name: string }) => [p.patient_id, p.full_name]),
                );

                const due = admissions
                    .map((a: { admission_id: string; admission_date: Date; patient_id: string }) => ({
                        ...a,
                        days: Math.floor((now.getTime() - new Date(a.admission_date).getTime()) / 86400000),
                    }))
                    .filter((a: { days: number }) => a.days > 0 && a.days % INTERIM_BILLING_INTERVAL_DAYS === 0);

                totalDue += due.length;

                let notified = 0;
                if (due.length) {
                    const staff = await db.user.findMany({
                        where: { organizationId: org.id, is_active: true, role: { in: ['admin', 'finance', 'ipd_manager'] } },
                        select: { id: true },
                    });
                    if (staff.length) {
                        await db.notification.createMany({
                            data: staff.map((s: { id: string }) => ({
                                organizationId: org.id,
                                user_id: s.id,
                                title: `${due.length} admission(s) due an interim bill`,
                                body: due
                                    .slice(0, 5)
                                    .map((a: { patient_id: string; days: number }) =>
                                        `${nameOf[a.patient_id] ?? a.patient_id} — day ${a.days}`)
                                    .join('; '),
                                type: 'info',
                            })),
                        });
                        notified = staff.length;
                        totalNotified += notified;
                    }
                }

                results.push({
                    organization: org.name,
                    admitted: admissions.length,
                    due_for_interim_bill: due.length,
                    notified,
                    admissions: due.map((a: { admission_id: string; days: number }) => ({
                        admission_id: a.admission_id,
                        days_admitted: a.days,
                    })),
                });
            } catch (e) {
                results.push({ organization: org.name, error: e instanceof Error ? e.message : 'unknown' });
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: now.toISOString(),
            organizations: orgs.length,
            interval_days: INTERIM_BILLING_INTERVAL_DAYS,
            total_due: totalDue,
            staff_notified: totalNotified,
            results,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Interim billing sweep failed';
        console.error('[CRON] interim-billing error:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
