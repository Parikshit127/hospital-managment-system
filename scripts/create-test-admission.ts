/**
 * One-shot script: creates a test patient + IPD admission + attaches an
 * IpdPackage + creates the IPD invoice with the package as a line item.
 *
 * Usage:  npx tsx scripts/create-test-admission.ts [PACKAGE_CODE]
 * Example: npx tsx scripts/create-test-admission.ts ORTHO-016
 *
 * Defaults to ORTHO-016 (Total Knee Replacement, ₹2,00,000) if no arg given.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const ORG = 'org-avani-default'; // Axten Hospitals

async function main() {
  const packageCode = (process.argv[2] || 'ORTHO-016').toUpperCase();

  // 1. Resolve the package
  const pkg = await prisma.ipdPackage.findUnique({
    where: { package_code_organizationId: { package_code: packageCode, organizationId: ORG } },
  });
  if (!pkg) throw new Error(`Package "${packageCode}" not found. Run lookup-org / verify scripts.`);
  console.log(`✓ Package: ${pkg.package_code} — ${pkg.package_name} — ₹${Number(pkg.total_amount).toLocaleString('en-IN')}`);

  // 2. Create patient (OPD_REG)
  const ts = Date.now();
  const uhid = `UHID-TEST-${ts}`;
  const patient = await prisma.oPD_REG.create({
    data: {
      patient_id: uhid,
      full_name: 'Test Patient (Auto)',
      age: '45',
      gender: 'Male',
      phone: '9999999999',
      address: 'Axten Hospitals — Test Address',
      blood_group: 'O+',
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
      admission_category: 'Planned',
      admission_source: 'OPD',
      patient_class: 'General',
      billing_category: 'General',
      organizationId: ORG,
    },
  });
  console.log(`✓ Admission created: ${admission.admission_id}`);

  // 4. Attach package
  await prisma.ipdAdmissionPackage.create({
    data: {
      admission_id: admission.admission_id,
      package_id: pkg.id,
      applied_amount: pkg.total_amount,
      organizationId: ORG,
    },
  });
  console.log(`✓ Package attached to admission`);

  // 5. Create invoice (IPD type, linked to admission)
  const invoiceNumber = `IPD-AXTEN-${ts}`;
  const amount = pkg.total_amount;
  const invoice = await prisma.invoices.create({
    data: {
      invoice_number: invoiceNumber,
      patient_id: patient.patient_id,
      admission_id: admission.admission_id,
      invoice_type: 'IPD',
      total_amount: amount,
      net_amount: amount,
      balance_due: amount,
      paid_amount: new Prisma.Decimal(0),
      status: 'Draft',
      billing_patient_type: 'cash',
      patient_payable: amount,
      organizationId: ORG,
    },
  });
  console.log(`✓ Invoice created: ${invoice.invoice_number} (id=${invoice.id})`);

  // 6. Add package as invoice line item
  await prisma.invoice_items.create({
    data: {
      invoice_id: invoice.id,
      department: 'IPD',
      description: `${pkg.package_code} — ${pkg.package_name}`,
      quantity: 1,
      unit_price: amount,
      total_price: amount,
      net_price: amount,
      service_category: 'Package',
      organizationId: ORG,
    },
  });
  console.log(`✓ Invoice line item added`);

  console.log('\n========================================');
  console.log('🟢 TEST ADMISSION READY — open in browser:');
  console.log('========================================');
  console.log(`\n📋 Patient bill view:`);
  console.log(`   http://localhost:3000/billing/patient/${patient.patient_id}`);
  console.log(`\n🛏️  Admission view:`);
  console.log(`   http://localhost:3000/ipd/admission/${admission.admission_id}`);
  console.log(`\n💳 Discharge / final bill view:`);
  console.log(`   http://localhost:3000/ipd/discharge-settlement/${admission.admission_id}`);
  console.log(`\n📊 IPD billing dashboard:`);
  console.log(`   http://localhost:3000/ipd/billing`);
  console.log('\nDetails:');
  console.log(`  Patient ID:     ${patient.patient_id}`);
  console.log(`  Admission ID:   ${admission.admission_id}`);
  console.log(`  Invoice #:      ${invoice.invoice_number}`);
  console.log(`  Package:        ${pkg.package_code} (${pkg.package_name})`);
  console.log(`  Amount:         ₹${Number(amount).toLocaleString('en-IN')}`);
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
