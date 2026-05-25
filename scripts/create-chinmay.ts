/**
 * Create patient Chinmay + admission + ORTHO-016 package + extra line items
 * → produces a realistic packaged bill for visual testing.
 *
 * Usage: npx tsx scripts/create-chinmay.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const ORG = 'org-avani-default'; // Axten Hospitals

async function main() {
    const ts = Date.now();
    const uhid = `UHID-CHINMAY-${ts}`;

    // 1. Pick the package: ORTHO-016 Total Knee Replacement ₹2,00,000
    const pkg = await prisma.ipdPackage.findUnique({
        where: { package_code_organizationId: { package_code: 'ORTHO-016', organizationId: ORG } },
    });
    if (!pkg) throw new Error('Package ORTHO-016 not found');
    const pkgAmount = pkg.total_amount;

    // 2. Create patient Chinmay
    const patient = await prisma.oPD_REG.create({
        data: {
            patient_id: uhid,
            full_name: 'Chinmay',
            age: '28',
            gender: 'Male',
            phone: '9876543210',
            address: 'Axten Hospitals Test Bed',
            blood_group: 'B+',
            registration_consent: true,
            patient_type: 'cash',
            organizationId: ORG,
        },
    });
    console.log(`✓ Patient created: ${patient.patient_id} — ${patient.full_name}`);

    // 3. Create admission
    const admission = await prisma.admissions.create({
        data: {
            patient_id: patient.patient_id,
            status: 'Admitted',
            diagnosis: pkg.package_name,
            doctor_name: 'Dr. Test Orthopedic',
            admission_category: 'Planned',
            admission_source: 'OPD',
            patient_class: 'Private',
            billing_category: 'Private',
            organizationId: ORG,
        },
    });
    console.log(`✓ Admission created: ${admission.admission_id}`);

    // 4. Attach package
    await prisma.ipdAdmissionPackage.create({
        data: {
            admission_id: admission.admission_id,
            package_id: pkg.id,
            applied_amount: pkgAmount,
            organizationId: ORG,
        },
    });
    console.log(`✓ Package attached: ${pkg.package_code} (₹${Number(pkgAmount).toLocaleString('en-IN')})`);

    // 5. Create IPD invoice
    const invoiceNumber = `IPD-AXTEN-${ts}`;
    const extraRoom = new Prisma.Decimal(8000 * 2); // 2 extra room days
    const extraLab = new Prisma.Decimal(1500); // lab test outside package
    const extraConsult = new Prisma.Decimal(1500); // super-specialist consult
    const totalBeforeTax = new Prisma.Decimal(Number(pkgAmount) + Number(extraRoom) + Number(extraLab) + Number(extraConsult));

    const invoice = await prisma.invoices.create({
        data: {
            invoice_number: invoiceNumber,
            patient_id: patient.patient_id,
            admission_id: admission.admission_id,
            invoice_type: 'IPD',
            total_amount: totalBeforeTax,
            net_amount: totalBeforeTax,
            balance_due: totalBeforeTax,
            paid_amount: new Prisma.Decimal(0),
            status: 'Draft',
            billing_patient_type: 'cash',
            patient_payable: totalBeforeTax,
            organizationId: ORG,
        },
    });
    console.log(`✓ Invoice created: ${invoice.invoice_number}`);

    // 6. Add line items — package + 3 extras
    const items: any[] = [
        {
            description: `${pkg.package_code} — ${pkg.package_name}`,
            quantity: 1,
            unit_price: pkgAmount,
            total_price: pkgAmount,
            net_price: pkgAmount,
            department: 'IPD',
            service_category: 'Package',
        },
        {
            description: 'Private Room — Extended Stay (2 days × ₹8,000)',
            quantity: 2,
            unit_price: new Prisma.Decimal(8000),
            total_price: extraRoom,
            net_price: extraRoom,
            department: 'IPD',
            service_category: 'Room',
        },
        {
            description: 'CBC + LFT (Pre-discharge labs)',
            quantity: 1,
            unit_price: extraLab,
            total_price: extraLab,
            net_price: extraLab,
            department: 'Lab',
            service_category: 'Lab',
        },
        {
            description: 'Super-Specialist Consultation (Cardiology clearance)',
            quantity: 1,
            unit_price: extraConsult,
            total_price: extraConsult,
            net_price: extraConsult,
            department: 'OPD Consultation',
            service_category: 'Consultation',
        },
    ];

    for (const it of items) {
        await prisma.invoice_items.create({
            data: { ...it, invoice_id: invoice.id, organizationId: ORG },
        });
    }
    console.log(`✓ ${items.length} line items added`);

    // 7. Add a small deposit so the bill shows "paid_amount > 0"
    await prisma.patientDeposit.create({
        data: {
            deposit_number: `DEP-AXTEN-${ts}`,
            patient_id: patient.patient_id,
            admission_id: admission.admission_id,
            amount: new Prisma.Decimal(50000),
            applied_amount: new Prisma.Decimal(0),
            payment_method: 'UPI',
            status: 'Active',
            organizationId: ORG,
        },
    });
    console.log(`✓ Deposit of ₹50,000 recorded`);

    console.log('\n========================================');
    console.log('🟢 CHINMAY TEST PATIENT READY');
    console.log('========================================');
    console.log(`\n📋 Patient ID:    ${patient.patient_id}`);
    console.log(`🛏️  Admission ID: ${admission.admission_id}`);
    console.log(`💳 Invoice #:     ${invoice.invoice_number}`);
    console.log(`📦 Package:       ${pkg.package_code} — ${pkg.package_name}`);
    console.log(`💰 Bill total:    ₹${Number(totalBeforeTax).toLocaleString('en-IN')}`);
    console.log(`     • Package:      ₹${Number(pkgAmount).toLocaleString('en-IN')}`);
    console.log(`     • Room (extra): ₹${Number(extraRoom).toLocaleString('en-IN')}  (2 days × ₹8,000)`);
    console.log(`     • Lab:          ₹${Number(extraLab).toLocaleString('en-IN')}`);
    console.log(`     • Consult:      ₹${Number(extraConsult).toLocaleString('en-IN')}`);
    console.log(`     • Deposit held: ₹50,000`);

    console.log('\n🔗 OPEN THESE TO VIEW THE BILL:');
    console.log(`\n  1. Patient bill (financial profile):`);
    console.log(`     http://localhost:3000/billing/patient/${patient.patient_id}`);
    console.log(`\n  2. Admission detail (click "Print Package Acceptance Form" in Billing tab):`);
    console.log(`     http://localhost:3000/ipd/admission/${admission.admission_id}`);
    console.log(`\n  3. Detailed bill (line-by-line, with "Type: IPD"):`);
    console.log(`     http://localhost:3000/api/discharge/${admission.admission_id}/bill`);
    console.log(`\n  4. Summary bill (one row per category, with "Type: IPD"):`);
    console.log(`     http://localhost:3000/api/discharge/${admission.admission_id}/summary-bill`);
    console.log(`\n  5. Package Acceptance form (signed at admission):`);
    console.log(`     http://localhost:3000/api/ipd/${admission.admission_id}/package-acceptance`);
    console.log(`\n  6. Discharge settlement (with both Print buttons):`);
    console.log(`     http://localhost:3000/ipd/discharge-settlement/${admission.admission_id}`);
}

main()
    .catch((e) => {
        console.error('❌', e.message);
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
