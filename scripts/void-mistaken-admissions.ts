/**
 * Void admissions that were created by mistake — patient was never actually admitted.
 *
 * Why: the in-app "Cancel Admission" button (app/ipd/page.tsx -> cancelAdmission)
 * blocks anything older than 8 hours unless forceCancel is passed, and the UI never
 * passes forceCancel — there is no checkbox for it. So a mistaken admission that sat
 * for weeks (e.g. AVS-ADM-26-27-040, AVS-ADM-26-27-032, both 40+ days old) cannot be
 * cleared from the app. This mirrors cancelAdmission's forceCancel cascade exactly
 * (app/actions/ipd-actions.ts ~line 2334) but skips the 8-hour gate.
 *
 * Both targets turned out to have real charge history (pharmacy dispensed today on
 * AVS-ADM-26-27-040, lab charges from June on AVS-ADM-26-27-032) — confirmed with the
 * user 2026-07-24 that these should be voided anyway, charges written off, rather than
 * discharged. Hence --force is required: it is a deliberate write-off, not a no-op
 * cleanup of an empty admission.
 *
 * What it changes, per targeted admission (only reached with --force):
 *   ipdChargePosting  : rows for this admission -> deleted
 *   pharmacy_orders    : status -> 'Cancelled'
 *   ipdAdmissionPackage: status -> 'Cancelled'
 *   invoices           : status -> 'Cancelled' (any not already cancelled)
 *   admissions         : status -> 'Cancelled', discharge_date/type/reason/cancelled_by set
 *   beds               : bed_id (if any) -> status 'Available'
 *   system_audit_logs  : one FORCE_CANCEL_ADMISSION row per admission
 *
 * Never touched: lab_orders (cancelAdmission's own forceCancel path doesn't touch them
 * either — matching existing app behavior, not introducing new drift).
 *
 * Without --force, an admission with any invoice/charge/pharmacy/lab data is reported
 * and skipped — same safety gate as a plain Cancel Admission.
 *
 * Usage (dry run prints what would change, writes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/void-mistaken-admissions.ts
 * Apply, forcing past the charges gate:
 *   DATABASE_URL="<url>" npx tsx scripts/void-mistaken-admissions.ts --apply --force
 * Target different admissions:
 *   DATABASE_URL="<url>" npx tsx scripts/void-mistaken-admissions.ts --only=AVS-ADM-26-27-040,AVS-ADM-26-27-032 --apply --force
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const REASON = 'Admitted by mistake — patient was never actually admitted (voided via repair script, charges written off)';

const DEFAULT_TARGETS = ['AVS-ADM-26-27-040', 'AVS-ADM-26-27-032'];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const TARGETS = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_TARGETS;

async function main() {
    console.log(`Mode    : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
    console.log(`Targets : ${TARGETS.join(', ')}\n`);

    for (const admissionId of TARGETS) {
        const admission = await prisma.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: { select: { full_name: true } } },
        });

        if (!admission) {
            console.log(`  ${admissionId} : NOT FOUND — skipping`);
            continue;
        }

        const label = `${admissionId} (${admission.patient?.full_name || '—'})`;

        if (admission.status !== 'Admitted') {
            console.log(`  ${label} : status is "${admission.status}", not "Admitted" — skipping`);
            continue;
        }

        const [invoiceCount, chargeCount, pharmacyCount, labCount] = await Promise.all([
            prisma.invoices.count({ where: { admission_id: admissionId } }),
            prisma.ipdChargePosting.count({ where: { admission_id: admissionId } }),
            prisma.pharmacy_orders.count({ where: { admission_id: admissionId } }),
            prisma.lab_orders.count({
                where: {
                    patient_id: admission.patient_id,
                    organizationId: admission.organizationId,
                    created_at: { gte: admission.admission_date },
                },
            }),
        ]);

        const hasData = !!(invoiceCount || chargeCount || pharmacyCount || labCount);

        if (hasData && !FORCE) {
            console.log(
                `  ${label} : HAS DATA (invoices=${invoiceCount}, charges=${chargeCount}, pharmacy=${pharmacyCount}, lab=${labCount})` +
                ' — refusing to void without --force',
            );
            continue;
        }

        if (hasData) {
            console.log(
                `  ${label} : HAS DATA (invoices=${invoiceCount}, charges=${chargeCount}, pharmacy=${pharmacyCount}, lab=${labCount})` +
                ` — --force set, ${APPLY ? 'writing off and voiding...' : 'would write off and void.'}`,
            );
        } else {
            console.log(`  ${label} : clean — no invoices/charges/orders. ${APPLY ? 'Voiding...' : 'Would void.'}`);
        }

        if (!APPLY) continue;

        await prisma.$transaction(async (tx) => {
            if (hasData) {
                // ipdChargePosting has no status column — delete the rows (mirrors
                // cancelAdmission's forceCancel path).
                await tx.ipdChargePosting.deleteMany({ where: { admission_id: admissionId } });
                await tx.pharmacy_orders.updateMany({ where: { admission_id: admissionId }, data: { status: 'Cancelled' } });
                await tx.ipdAdmissionPackage.updateMany({ where: { admission_id: admissionId }, data: { status: 'Cancelled' } });
                await tx.invoices.updateMany({
                    where: { admission_id: admissionId, status: { not: 'Cancelled' } },
                    data: { status: 'Cancelled' },
                });
            }

            await tx.admissions.update({
                where: { admission_id: admissionId },
                data: {
                    status: 'Cancelled',
                    discharge_date: new Date(),
                    discharge_type: 'Cancelled',
                    cancellation_reason: REASON,
                    cancellation_date: new Date(),
                    cancelled_by: 'repair-script',
                },
            });
            if (admission.bed_id) {
                await tx.beds.update({
                    where: { bed_id: admission.bed_id },
                    data: { status: 'Available' },
                });
            }
            await tx.system_audit_logs.create({
                data: {
                    action: 'FORCE_CANCEL_ADMISSION',
                    module: 'ipd',
                    entity_type: 'admission',
                    entity_id: admissionId,
                    details: JSON.stringify({ reason: REASON, bed_id: admission.bed_id, force: true, had_charges: hasData }),
                    organizationId: admission.organizationId,
                },
            });
        });
        console.log(`    -> voided, bed freed${hasData ? ', charges written off' : ''}`);
    }

    if (!APPLY) {
        console.log('\nDry run — nothing written. Re-run with --apply to make these changes.');
    }
}

main()
    .catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
