/**
 * Verifies the package-aware Room/Nursing suppression logic.
 *
 *   1. Reads Chinmay's admission + its package
 *   2. Computes the package coverage window (admission_date + validity_days - 1)
 *   3. Counts Room + Nursing line items WITHIN the window — should be 0 for new admissions
 *      (existing admissions before the fix may have legacy charges; those are reported as info)
 *   4. Prints the coverage window and a verdict
 *
 * Run:  npx tsx scripts/test-package-room-suppression.ts <ADMISSION_ID>
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const admissionId = process.argv[2] || '42808672-f90a-4dc0-b97b-3c87dd5e48ba'; // Chinmay default
    console.log(`Checking admission: ${admissionId}\n`);

    const admission = await prisma.admissions.findUnique({
        where: { admission_id: admissionId },
        include: {
            patient: { select: { full_name: true, patient_id: true } },
            ipd_admission_packages: {
                where: { is_broken_open: false },
                include: { package: true },
                take: 1,
            },
        },
    });
    if (!admission) {
        console.error('❌ Admission not found');
        process.exit(1);
    }
    const pkg = admission.ipd_admission_packages?.[0];
    console.log(`Patient:        ${admission.patient.full_name}  (${admission.patient.patient_id})`);
    console.log(`Admission date: ${admission.admission_date.toISOString().slice(0,10)}`);
    console.log(`Status:         ${admission.status}`);

    if (!pkg) {
        console.log(`\n⚠️  No active package attached — the fix doesn't apply here.`);
        console.log(`    Room/Nursing should accrue normally for this admission.`);
        return;
    }

    const validity = pkg.package.validity_days || 7;
    const admitMidnight = new Date(admission.admission_date);
    admitMidnight.setHours(0, 0, 0, 0);
    const coveredUntil = new Date(admitMidnight);
    coveredUntil.setDate(admitMidnight.getDate() + validity - 1);
    coveredUntil.setHours(23, 59, 59, 999);

    console.log(`\n📦 Package:      ${pkg.package.package_code} — ${pkg.package.package_name}`);
    console.log(`   validity:     ${validity} day(s)`);
    console.log(`   covers from:  ${admitMidnight.toISOString().slice(0,10)}`);
    console.log(`   covers until: ${coveredUntil.toISOString().slice(0,10)} (inclusive)`);

    // Find Room/Nursing line items for this admission's invoice (any status)
    const invoice = await prisma.invoices.findFirst({
        where: { admission_id: admissionId },
        orderBy: { created_at: 'desc' },
        include: {
            items: {
                where: { service_category: { in: ['Room', 'Nursing'] } },
                orderBy: { created_at: 'asc' },
            },
        },
    });
    if (!invoice) {
        console.log(`\n⚠️  No invoice found.`);
        return;
    }
    console.log(`\nInvoice ${invoice.invoice_number} has ${invoice.items.length} Room/Nursing line item(s):\n`);
    let withinWindow = 0;
    let beyondWindow = 0;
    for (const it of invoice.items) {
        const createdAt = new Date(it.created_at);
        const isWithin = createdAt <= coveredUntil;
        if (isWithin) withinWindow++;
        else beyondWindow++;
        const flag = isWithin ? '⚠️  WITHIN package window' : '✓ beyond window (correct extra charge)';
        console.log(`  ${createdAt.toISOString().slice(0,10)}  ${it.service_category.padEnd(7)}  ₹${Number(it.net_price).toLocaleString('en-IN').padStart(8)}  ${flag}`);
    }

    console.log('\n=== Verdict ===');
    if (withinWindow === 0) {
        console.log('✅ PASS — no Room/Nursing accrued within package coverage window.');
        console.log('   (New accruals will correctly be suppressed by the fix.)');
    } else {
        console.log(`⚠️  ${withinWindow} legacy Room/Nursing line(s) inside the package window.`);
        console.log('   These were posted BEFORE the fix and are still on the bill.');
        console.log('   Future accruals will be suppressed. Existing rows can be removed manually if needed.');
    }
    if (beyondWindow > 0) {
        console.log(`✓ ${beyondWindow} line(s) beyond the package window — correctly billed extra.`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
