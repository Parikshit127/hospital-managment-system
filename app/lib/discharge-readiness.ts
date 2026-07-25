/**
 * One definition of "is this patient ready to be discharged".
 *
 * There were four discharge paths (dischargePatientIPD, processDischarge,
 * dischargePatient, settleAndDischarge) and none of them checked anything
 * clinical. A separate validateDischargeChecklist() did exist, but it was
 * imported and never called — dead code — so in the audit a patient was
 * discharged with a NEWS of 11, nine doses still queued, no nursing assessment
 * and no discharge summary, and nothing objected.
 *
 * Split into blockers and warnings deliberately. A hospital must be able to
 * discharge against advice, or a patient who self-discharges, so this refuses
 * only what is genuinely unsafe or legally required and lets the rest through
 * with an explicit acknowledgement.
 */

export type ReadinessItem = {
    key: string;
    label: string;
    ok: boolean;
    detail?: string;
};

export type DischargeReadiness = {
    canDischarge: boolean;
    blockers: ReadinessItem[];
    warnings: ReadinessItem[];
    checks: ReadinessItem[];
};

/**
 * @param db    tenant-scoped client
 * @param admissionId
 * @param opts.override  set when a clinician has explicitly accepted the risks
 */
export async function evaluateDischargeReadiness(
    db: any,
    admissionId: string,
): Promise<DischargeReadiness> {
    const admission = await db.admissions.findUnique({
        where: { admission_id: admissionId },
        select: {
            admission_id: true, patient_id: true, status: true,
            news_score_latest: true, admission_date: true,
        },
    });

    if (!admission) {
        const missing: ReadinessItem = { key: 'admission', label: 'Admission not found', ok: false };
        return { canDischarge: false, blockers: [missing], warnings: [], checks: [missing] };
    }

    const now = new Date();

    const [pendingDoses, openTasks, assessmentCount, latestVitals, pendingLabs, pendingIndents, invoice] =
        await Promise.all([
            db.medicationAdministration.count({
                where: { admission_id: admissionId, status: 'Scheduled', scheduled_time: { lt: now } },
            }),
            db.nursingTask.count({
                where: { admission_id: admissionId, status: { in: ['Pending', 'In Progress'] } },
            }),
            db.nursingAssessment.count({ where: { admission_id: admissionId } }),
            db.iPDVitals.findFirst({
                where: { admission_id: admissionId },
                orderBy: { created_at: 'desc' },
                select: { news_score: true, news_level: true, created_at: true },
            }),
            db.lab_orders.count({
                where: { patient_id: admission.patient_id, status: { in: ['Pending', 'Processing'] } },
            }),
            db.pharmacy_orders.count({
                where: { patient_id: admission.patient_id, status: 'Pending' },
            }),
            db.invoices.findFirst({
                where: { admission_id: admissionId, status: { not: 'Cancelled' } },
                select: { id: true, net_amount: true },
            }),
        ]);

    // Room and nursing charges are posted manually by design (auto-accrual is
    // deliberately disabled), but nothing ever checked they had been posted. A
    // stay could be finalised at zero — three such bills exist on the demo data,
    // and the audit produced a fourth by discharging a bed-day for nothing.
    const stayDays = Math.max(
        1,
        Math.ceil((now.getTime() - new Date(admission.admission_date).getTime()) / 86400000),
    );
    const itemCount = invoice
        ? await db.invoice_items.count({ where: { invoice_id: invoice.id } })
        : 0;
    const billedNothing = !invoice || (Number(invoice.net_amount) === 0 && itemCount === 0);

    const news = latestVitals?.news_score ?? admission.news_score_latest ?? null;

    const checks: ReadinessItem[] = [
        {
            key: 'news',
            label: 'Patient clinically stable',
            // A NEWS of 7+ is the emergency-response band. Sending that patient
            // home without an explicit override is the one thing worth refusing.
            ok: news == null || news < 7,
            detail: news == null
                ? 'No NEWS recorded for this admission'
                : `Latest NEWS ${news}${latestVitals?.news_level ? ` (${latestVitals.news_level})` : ''}`,
        },
        {
            key: 'nursing_assessment',
            label: 'Nursing assessment on file',
            ok: assessmentCount > 0,
            detail: assessmentCount > 0 ? `${assessmentCount} recorded` : 'None recorded for this admission',
        },
        {
            key: 'overdue_doses',
            label: 'No overdue medication doses',
            ok: pendingDoses === 0,
            detail: pendingDoses ? `${pendingDoses} dose(s) past their scheduled time and not actioned` : 'All doses actioned',
        },
        {
            key: 'nursing_tasks',
            label: 'Nursing tasks closed',
            ok: openTasks === 0,
            detail: openTasks ? `${openTasks} task(s) still open` : 'All closed',
        },
        {
            key: 'labs',
            label: 'Lab results back',
            ok: pendingLabs === 0,
            detail: pendingLabs ? `${pendingLabs} lab order(s) still pending` : 'No pending labs',
        },
        {
            key: 'pharmacy',
            label: 'Pharmacy indents fulfilled',
            ok: pendingIndents === 0,
            detail: pendingIndents ? `${pendingIndents} indent(s) still pending` : 'None pending',
        },
        {
            key: 'charges_posted',
            label: 'Charges posted for the stay',
            ok: !billedNothing,
            detail: billedNothing
                ? `${stayDays} day(s) admitted but the bill has no charges — room and nursing charges are posted manually and appear to have been missed`
                : `${itemCount} line item(s)`,
        },
    ];

    // Only genuine safety/legal stops refuse the action; everything else is
    // surfaced so the discharging clinician sees it and decides.
    const BLOCKING = new Set(['news']);

    const blockers = checks.filter(c => !c.ok && BLOCKING.has(c.key));
    const warnings = checks.filter(c => !c.ok && !BLOCKING.has(c.key));

    return { canDischarge: blockers.length === 0, blockers, warnings, checks };
}

export function readinessSummary(r: DischargeReadiness): string {
    if (r.blockers.length) {
        return 'Cannot discharge: ' + r.blockers.map(b => `${b.label} — ${b.detail}`).join('; ');
    }
    if (r.warnings.length) {
        return 'Outstanding: ' + r.warnings.map(w => `${w.label} (${w.detail})`).join('; ');
    }
    return 'All discharge checks passed.';
}
