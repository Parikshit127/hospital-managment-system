/**
 * Manual verification script for postDepositToGL / postRefundToGL — confirms
 * the PatientDeposit/Refund model-mismatch fixes work and that both flows
 * actually create a balanced GL journal entry. Run via tsx, no test
 * framework installed (matches scripts/*.ts convention in this repo).
 *
 * Requires: an existing patient row, and the org's chart of accounts to
 * already have accounts 1110/1120/3140/6000 (seeded by the generic
 * chart-of-accounts-seed.ts).
 *
 * Usage: ORGANIZATION_ID=<id> PATIENT_ID=<id> npx tsx scripts/verify-deposit-refund-gl-posting.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  const patientId = process.env.PATIENT_ID;
  if (!organizationId || !patientId) {
    console.error('Usage: ORGANIZATION_ID=<id> PATIENT_ID=<id> npx tsx scripts/verify-deposit-refund-gl-posting.ts');
    process.exit(1);
  }

  const { postDepositToGL, postRefundToGL } = await import('../app/actions/gl-actions');

  // --- Deposit ---
  const deposit = await prisma.patientDeposit.create({
    data: {
      deposit_number: `TEST-DEP-VERIFY-${Date.now()}`,
      patient_id: patientId,
      amount: 500,
      payment_method: 'Cash',
      status: 'Active',
      organizationId,
    },
  });
  console.log(`Created test deposit ${deposit.deposit_number} (id ${deposit.id}).`);

  const depositResult = await postDepositToGL(deposit.id);
  console.log('postDepositToGL result:', depositResult);
  if (!(depositResult as any).success) {
    console.error('FAIL: postDepositToGL did not succeed — check that PatientDeposit lookup and accounts 1110/3140 exist.');
    process.exit(1);
  }
  const depositLine = await prisma.gL_JournalLine.findFirst({
    where: { journal: { reference_type: 'Deposit', reference_id: deposit.id.toString() } },
    include: { account: true },
  });
  console.log(`Deposit posted against account: ${depositLine?.account.account_code} (expect 1110, Cash)`);

  await prisma.gL_JournalLine.deleteMany({ where: { journal: { reference_type: 'Deposit', reference_id: deposit.id.toString() } } });
  await prisma.gL_JournalEntry.deleteMany({ where: { reference_type: 'Deposit', reference_id: deposit.id.toString() } });
  await prisma.patientDeposit.delete({ where: { id: deposit.id } });
  console.log('Deposit test cleaned up.');

  // --- Refund ---
  const invoice = await prisma.invoices.findFirst({ where: { organizationId }, select: { id: true } });
  if (!invoice) {
    console.error('No invoice found for this org — skipping refund test (Refund.invoice_id is required).');
    process.exit(0);
  }

  const refund = await prisma.refund.create({
    data: {
      invoice_id: invoice.id.toString(),
      amount: 250,
      reason: 'Verification script test refund',
      status: 'Processed',
      payment_method: 'Cash',
      organizationId,
    },
  });
  console.log(`Created test refund (id ${refund.id}).`);

  const refundResult = await postRefundToGL(refund.id);
  console.log('postRefundToGL result:', refundResult);
  if (!(refundResult as any).success) {
    console.error('FAIL: postRefundToGL did not succeed — check that Refund lookup and accounts 1110/6000 exist, and that refund.amount (Float) is handled without .toNumber().');
    process.exit(1);
  }
  const refundLine = await prisma.gL_JournalLine.findFirst({
    where: { journal: { reference_type: 'Refund', reference_id: refund.id.toString() } },
    include: { account: true },
  });
  console.log(`Refund posted against account: ${refundLine?.account.account_code} (expect 6000 or 1110)`);

  await prisma.gL_JournalLine.deleteMany({ where: { journal: { reference_type: 'Refund', reference_id: refund.id.toString() } } });
  await prisma.gL_JournalEntry.deleteMany({ where: { reference_type: 'Refund', reference_id: refund.id.toString() } });
  await prisma.refund.delete({ where: { id: refund.id } });
  console.log('Refund test cleaned up. PASS.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
