/**
 * HospitalOS — Record Restore Script for "Sunny Mehta"
 *
 * Restores:
 *  1. Patient Master (OPD_REG): Sunny Mehta (UHID: AVS-2026-00899, Phone: 7388888899)
 *  2. Admission: AVS-ADM-26-27-251 (Bed 201, Status: Admitted)
 *  3. IPD Draft Bill: AVS-IPD-26-27-234 with all 49 line items (₹1,01,000.13),
 *     applied deposits (₹79,699.24), and remaining balance (₹21,300.89).
 *  4. Deposits (PatientDeposit & payments) applied to the IPD bill.
 *  5. Earlier Walk-in Pharmacy Invoice: AVS-PHM-26-27-109 (₹2,848.82, 10 items).
 *  6. Updates Bed 201 back to 'Occupied'.
 *
 * EXCLUDED (Not restored):
 *  - Accidental duplicate counter sale AVS-PHM-26-27-112 (₹21,300.89).
 *
 * USAGE:
 *  Dry run (safe inspection):
 *    npx tsx scripts/restore-sunny-mehta.ts
 *
 *  Execute restore on AWS RDS:
 *    npx tsx scripts/restore-sunny-mehta.ts --apply
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const ORG_ID = '0425857b-6293-4d91-86b2-bd049de66252';

const IPD_LINE_ITEMS: Array<{
  dept: string;
  desc: string;
  qty: number;
  unit: number;
  net: number;
  batch?: string;
}> = [
  { dept: 'Lab', desc: 'Biopsy Medium', qty: 1, unit: 1500.0, net: 1500.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: RL 500ML (Batch R1SC160) × 4', qty: 4, unit: 74.02, net: 296.08, batch: 'R1SC160' },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS 3 3000ML  (Batch S1L26045) × 9', qty: 9, unit: 650.0, net: 5850.0, batch: 'S1L26045' },
  { dept: 'Pharmacy', desc: 'Pharmacy: ANAWIN HEAVY 4 ML INJ (Batch KP1713954) × 1', qty: 1, unit: 31.0, net: 31.0, batch: 'KP1713954' },
  { dept: 'Pharmacy', desc: 'Pharmacy: SPINAL NEEDLE 26G (Batch 2602041) × 1', qty: 1, unit: 221.5, net: 221.5, batch: '2602041' },
  { dept: 'Pharmacy', desc: 'Pharmacy: EXAMINATION GLOVE L (Batch FG97) × 40', qty: 40, unit: 15.9, net: 636.0, batch: 'FG97' },
  { dept: 'Pharmacy', desc: 'Pharmacy: GLOVES(ANSEL) 6.5-SUR-OTHER1 (Packing: 1) (Batch 26D3007) × 5', qty: 5, unit: 91.0, net: 455.0, batch: '26D3007' },
  { dept: 'Pharmacy', desc: 'Pharmacy: GLOVES SURGICARE 7 (Batch 26F3011) × 5', qty: 5, unit: 91.0, net: 455.0, batch: '26F3011' },
  { dept: 'Pharmacy', desc: 'Pharmacy: DISPO SYRINGE 2 ML (Batch 3RB26005) × 11', qty: 11, unit: 26.0, net: 286.0, batch: '3RB26005' },
  { dept: 'Pharmacy', desc: 'Pharmacy: DISPO SYRINGE 5 ML (Batch 3RD26030) × 10', qty: 10, unit: 35.0, net: 350.0, batch: '3RD26030' },
  { dept: 'Pharmacy', desc: 'Pharmacy: SYRINGE 10 -ML (Batch 032610-05) × 10', qty: 10, unit: 45.0, net: 450.0, batch: '032610-05' },
  { dept: 'Pharmacy', desc: 'Pharmacy: PCM 100 ML (Batch T383L1684) × 3', qty: 3, unit: 591.5, net: 1774.5, batch: 'T383L1684' },
  { dept: 'Pharmacy', desc: 'Pharmacy: CEFU NS 1GM INJ (Batch C13025) × 3', qty: 3, unit: 65.5, net: 196.5, batch: 'C13025' },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS-DOM INJ (Batch EA6057A) × 3', qty: 3, unit: 12.72, net: 38.16, batch: 'EA6057A' },
  { dept: 'Pharmacy', desc: 'Pharmacy: AMIKA 250 INJ (Batch NPC00009) × 2', qty: 2, unit: 67.0, net: 134.0, batch: 'NPC00009' },
  { dept: 'Pharmacy', desc: 'Pharmacy: AMIKACIN 500MG-INJ-ABBOT9 (Packing: 1) (Batch N/A) × 2', qty: 2, unit: 113.0, net: 226.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: SILKO 14 FG  (Batch G26E120007) × 1', qty: 1, unit: 926.0, net: 926.0, batch: 'G26E120007' },
  { dept: 'Pharmacy', desc: 'Pharmacy: urobag  (Batch N/A) × 1', qty: 1, unit: 397.0, net: 397.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: LOX 2% JELLY (Batch L1774) × 2', qty: 2, unit: 34.58, net: 69.16, batch: 'L1774' },
  { dept: 'Pharmacy', desc: 'Pharmacy: GUIDE WIRE 1 (Batch 250425V) × 2', qty: 2, unit: 2610.0, net: 5220.0, batch: '250425V' },
  { dept: 'Pharmacy', desc: 'Pharmacy: SILKO 14 FG  (Batch G25H010086) × 1', qty: 1, unit: 926.0, net: 926.0, batch: 'G25H010086' },
  { dept: 'Pharmacy', desc: 'Pharmacy: VICRYL 3-0 2437 (Batch E242009P) × 1', qty: 1, unit: 798.99, net: 798.99, batch: 'E242009P' },
  { dept: 'Pharmacy', desc: 'Pharmacy: CATGUT 3-0  4237 (Batch N/A) × 1', qty: 1, unit: 204.0, net: 204.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: GAUZE 10*10 (Batch K240456) × 10', qty: 10, unit: 127.0, net: 1270.0, batch: 'K240456' },
  { dept: 'Pharmacy', desc: 'Pharmacy: FACE MASK (Batch 789523L) × 9', qty: 9, unit: 10.0, net: 90.0, batch: '789523L' },
  { dept: 'Lab', desc: 'CBC', qty: 1, unit: 450.0, net: 450.0 },
  { dept: 'Surgery', desc: 'CIRCUMCISION  WITH MEATAL DILATATION WITH OIU', qty: 1, unit: 70000.0, net: 70000.0 },
  { dept: 'Lab', desc: 'LFT', qty: 1, unit: 950.0, net: 950.0 },
  { dept: 'Lab', desc: 'KFT', qty: 1, unit: 950.0, net: 950.0 },
  { dept: 'Lab', desc: 'ESR', qty: 1, unit: 200.0, net: 200.0 },
  { dept: 'Lab', desc: 'HIV', qty: 1, unit: 500.0, net: 500.0 },
  { dept: 'Lab', desc: 'HCV', qty: 1, unit: 1800.0, net: 1800.0 },
  { dept: 'Lab', desc: 'HBSAG', qty: 1, unit: 500.0, net: 500.0 },
  { dept: 'Lab', desc: 'PT WITH INR', qty: 1, unit: 550.0, net: 550.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: AMIKACIN 250 MG INJ (Batch NPC00009) × 2', qty: 2, unit: 67.21, net: 134.42, batch: 'NPC00009' },
  { dept: 'Pharmacy', desc: 'Pharmacy: IV CANNULA 20 (Batch G26D010817) × 1', qty: 1, unit: 201.0, net: 201.0, batch: 'G26D010817' },
  { dept: 'Pharmacy', desc: 'Pharmacy: EXAMINATION GLOVE L (Batch FG97) × 20', qty: 20, unit: 15.9, net: 318.0, batch: 'FG97' },
  { dept: 'Pharmacy', desc: 'Pharmacy: IV SET (Batch HT98F) × 1', qty: 1, unit: 335.0, net: 335.0, batch: 'HT98F' },
  { dept: 'Pharmacy', desc: 'Pharmacy: IV FIXATOR  (Batch G26B060032) × 1', qty: 1, unit: 91.0, net: 91.0, batch: 'G26B060032' },
  { dept: 'Pharmacy', desc: 'Pharmacy: CEFU NS 1GM INJ (Batch C13025) × 2', qty: 2, unit: 65.5, net: 131.0, batch: 'C13025' },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS PPN 40INJ (Batch N02526) × 2', qty: 2, unit: 53.89, net: 107.78, batch: 'N02526' },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS-DOM INJ (Batch EA6057A) × 2', qty: 2, unit: 12.72, net: 25.44, batch: 'EA6057A' },
  { dept: 'Pharmacy', desc: 'Pharmacy: AMIKACIN 500MG-INJ-ABBOT9 (Packing: 1) (Batch N/A) × 2', qty: 2, unit: 115.0, net: 230.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS 100 ML (Batch NITA570) × 3', qty: 3, unit: 45.22, net: 135.66, batch: 'NITA570' },
  { dept: 'Pharmacy', desc: 'Pharmacy: NS 500 ML  (Batch N1TC565) × 2', qty: 2, unit: 93.97, net: 187.94, batch: 'N1TC565' },
  { dept: 'Pharmacy', desc: 'Pharmacy: DISPO.SYRINGE 10 ML (Batch G26D020301) × 4', qty: 4, unit: 64.0, net: 256.0, batch: 'G26D020301' },
  { dept: 'Pharmacy', desc: 'Pharmacy: ABG SYRINGE 3ML (Batch N/A) × 2', qty: 2, unit: 30.0, net: 60.0 },
  { dept: 'Pharmacy', desc: 'Pharmacy: DISPO SYRINGE 5 ML (Batch 3RD26030) × 2', qty: 2, unit: 35.0, net: 70.0, batch: '3RD26030' },
  { dept: 'Pharmacy', desc: 'Pharmacy: TELMA 40 TAB (Batch N/A) × 2', qty: 2, unit: 8.0, net: 16.0 },
];

const PHM_109_ITEMS: Array<{
  desc: string;
  qty: number;
  unit: number;
  net: number;
  batch: string;
}> = [
  { desc: 'PANTOMAKS 40 TAB (Batch: PT25109)', qty: 7, unit: 9.4, net: 65.8, batch: 'PT25109' },
  { desc: 'Q-FUROX 500 MG TAB (Batch: BL-20026)', qty: 14, unit: 54.0, net: 756.0, batch: 'BL-20026' },
  { desc: 'ALDIGESIC-SP TAB (Batch: AST26006PK)', qty: 6, unit: 12.37, net: 74.22, batch: 'AST26006PK' },
  { desc: 'CHYMOTAS FORTE TAB (Batch: 25S3GTA980)', qty: 20, unit: 22.05, net: 441.0, batch: '25S3GTA980' },
  { desc: 'WELLNESS PLUS (Batch: TMY-390)', qty: 14, unit: 49.9, net: 698.6, batch: 'TMY-390' },
  { desc: 'NEOSPORIN EYE OINT 10G (Batch: R330)', qty: 1, unit: 135.7, net: 135.7, batch: 'R330' },
  { desc: 'MYRAM 50 MAT (Batch: LPG10/495J01)', qty: 7, unit: 37.2, net: 260.4, batch: 'LPG10/495J01' },
  { desc: 'SOLITEN 5 MG TAB (Batch: SIH0332A)', qty: 7, unit: 29.0, net: 203.0, batch: 'SIH0332A' },
  { desc: 'TEMSUNOL CAP (Batch: TMS25007)', qty: 7, unit: 8.63, net: 60.41, batch: 'TMS25007' },
  { desc: 'FLAVOMAKS 200MG  (Batch: AYT011184)', qty: 20, unit: 21.6, net: 432.0, batch: 'AYT011184' },
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(' HOSPITALOS — RESTORE PATIENT & ADMISSION: "SUNNY MEHTA"');
  console.log('='.repeat(70));
  console.log(` Mode   : ${APPLY ? '🔴 APPLY (Writing restored records to DB)' : '🟢 DRY RUN (No writes)'}`);
  console.log('-'.repeat(70) + '\n');

  console.log('Records to restore:');
  console.log('  1. Patient: Sunny Mehta (AVS-2026-00899)');
  console.log('  2. Admission: AVS-ADM-26-27-251 (Bed 201, Status: Admitted)');
  console.log('  3. Bed 201: Status -> "Occupied"');
  console.log('  4. IPD Bill: AVS-IPD-26-27-234 (49 items, Net: ₹1,01,000.13, Paid: ₹79,699.24, Bal: ₹21,300.89)');
  console.log('  5. Deposits applied to IPD Bill:');
  console.log('     - RCP-DEP-1787379313556 : ₹20,000.00');
  console.log('     - RCP-DEP-1787385091641 : ₹59,699.00');
  console.log('     - RCP-DEP-1787386494263-246 : ₹0.24');
  console.log('  6. Earlier Walk-in Pharmacy Bill: AVS-PHM-26-27-109 (10 items, ₹2,848.82)');
  console.log('\nEXCLUDED:');
  console.log('  ❌ Accidental Counter Sale: AVS-PHM-26-27-112 (₹21,300.89) is NOT restored.\n');

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to execute the restore.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Resolve or Create Walk-in Patient record if needed
    const walkinPt = await tx.oPD_REG.findFirst({ where: { patient_id: 'WALKIN' } });
    if (!walkinPt) {
      await tx.oPD_REG.create({
        data: {
          patient_id: 'WALKIN',
          full_name: 'Walk-in / Cash Customer',
          organizationId: ORG_ID,
          phone: '0000000000',
        },
      });
    }

    // 2. Restore Patient Master (OPD_REG)
    const patient = await tx.oPD_REG.upsert({
      where: { patient_id: 'AVS-2026-00899' },
      update: {
        full_name: 'Sunny Mehta',
        phone: '7388888899',
        organizationId: ORG_ID,
      },
      create: {
        patient_id: 'AVS-2026-00899',
        full_name: 'Sunny Mehta',
        phone: '7388888899',
        gender: 'Male',
        age: '32',
        patient_type: 'cash',
        organizationId: ORG_ID,
        created_at: new Date('2026-08-21T17:00:00.000Z'),
      },
    });
    console.log(`  ✓ Restored patient: ${patient.full_name} (${patient.patient_id})`);

    // 3. Restore Admission
    const admission = await tx.admissions.upsert({
      where: { admission_id: 'AVS-ADM-26-27-251' },
      update: {
        patient_id: 'AVS-2026-00899',
        status: 'Admitted',
        bed_id: '201',
        organizationId: ORG_ID,
      },
      create: {
        admission_id: 'AVS-ADM-26-27-251',
        patient_id: 'AVS-2026-00899',
        status: 'Admitted',
        bed_id: '201',
        admission_date: new Date('2026-08-21T17:16:00.000Z'),
        organizationId: ORG_ID,
      },
    });
    console.log(`  ✓ Restored admission: ${admission.admission_id}`);

    // 4. Update Bed 201 to Occupied
    const bed = await tx.beds.findFirst({ where: { bed_id: '201', organizationId: ORG_ID } });
    if (bed) {
      await tx.beds.update({
        where: { bed_id: '201' },
        data: { status: 'Occupied' },
      });
      console.log('  ✓ Updated Bed 201 -> Occupied');
    }

    // 5. Restore IPD Bill
    const ipdInvoice = await tx.invoices.create({
      data: {
        invoice_number: 'AVS-IPD-26-27-234',
        invoice_type: 'IPD',
        patient_id: 'AVS-2026-00899',
        admission_id: 'AVS-ADM-26-27-251',
        status: 'Draft',
        total_amount: new Prisma.Decimal(101000.13),
        net_amount: new Prisma.Decimal(101000.13),
        paid_amount: new Prisma.Decimal(79699.24),
        balance_due: new Prisma.Decimal(21300.89),
        organizationId: ORG_ID,
        created_at: new Date('2026-08-22T12:59:00.000Z'),
      },
    });
    console.log(`  ✓ Restored IPD Invoice: ${ipdInvoice.invoice_number} (#${ipdInvoice.id})`);

    // 6. Restore IPD Line Items
    for (const item of IPD_LINE_ITEMS) {
      await tx.invoice_items.create({
        data: {
          invoice_id: ipdInvoice.id,
          department: item.dept,
          description: item.desc,
          quantity: item.qty,
          unit_price: new Prisma.Decimal(item.unit),
          total_price: new Prisma.Decimal(item.net),
          net_price: new Prisma.Decimal(item.net),
          batch_no: item.batch || null,
          organizationId: ORG_ID,
        },
      });
    }
    console.log(`  ✓ Restored ${IPD_LINE_ITEMS.length} IPD invoice line items`);

    // 7. Restore Payments and Deposits
    const depositReceipts = [
      { receipt: 'RCP-DEP-1787379313556', amount: 20000.0 },
      { receipt: 'RCP-DEP-1787385091641', amount: 59699.0 },
      { receipt: 'RCP-DEP-1787386494263-246', amount: 0.24 },
    ];

    for (const dep of depositReceipts) {
      await tx.payments.create({
        data: {
          receipt_number: dep.receipt,
          invoice_id: ipdInvoice.id,
          amount: new Prisma.Decimal(dep.amount),
          payment_method: 'Deposit',
          payment_type: 'IPD',
          status: 'Completed',
          organizationId: ORG_ID,
        },
      });

      await tx.patientDeposit.create({
        data: {
          deposit_number: dep.receipt,
          patient_id: 'AVS-2026-00899',
          admission_id: 'AVS-ADM-26-27-251',
          amount: new Prisma.Decimal(dep.amount),
          applied_amount: new Prisma.Decimal(dep.amount),
          applied_to_invoice: ipdInvoice.id,
          payment_method: 'Cash',
          status: 'Applied',
          organizationId: ORG_ID,
        },
      });
    }
    console.log(`  ✓ Restored ${depositReceipts.length} deposit payments & records`);

    // 8. Restore Earlier Walk-in Pharmacy Invoice AVS-PHM-26-27-109
    const phm109 = await tx.invoices.create({
      data: {
        invoice_number: 'AVS-PHM-26-27-109',
        invoice_type: 'PHM',
        patient_id: 'WALKIN',
        notes: JSON.stringify({ n: 'SUNNY MEHTA', c: '7388888899', a: '' }),
        status: 'Final',
        total_amount: new Prisma.Decimal(2848.82),
        net_amount: new Prisma.Decimal(2848.82),
        paid_amount: new Prisma.Decimal(2848.82),
        balance_due: new Prisma.Decimal(0.0),
        organizationId: ORG_ID,
        created_at: new Date('2026-08-22T10:00:00.000Z'),
        finalized_at: new Date('2026-08-22T10:05:00.000Z'),
      },
    });

    for (const item of PHM_109_ITEMS) {
      await tx.invoice_items.create({
        data: {
          invoice_id: phm109.id,
          department: 'Pharmacy',
          description: item.desc,
          quantity: item.qty,
          unit_price: new Prisma.Decimal(item.unit),
          total_price: new Prisma.Decimal(item.net),
          net_price: new Prisma.Decimal(item.net),
          batch_no: item.batch,
          organizationId: ORG_ID,
        },
      });
    }

    await tx.payments.create({
      data: {
        receipt_number: 'AVS-RCP-26-27-1351',
        invoice_id: phm109.id,
        amount: new Prisma.Decimal(2848.82),
        payment_method: 'UPI',
        payment_type: 'Pharmacy',
        status: 'Completed',
        organizationId: ORG_ID,
      },
    });
    console.log(`  ✓ Restored Pharmacy Invoice: ${phm109.invoice_number} (₹2,848.82)`);

    // 9. Audit Log
    await tx.system_audit_logs.create({
      data: {
        user_id: 'script-cli',
        username: 'admin-script',
        role: 'admin',
        action: 'RESTORE_PATIENT_RECORDS',
        module: 'Admin',
        entity_type: 'patient',
        entity_id: 'AVS-2026-00899',
        details: 'Restored Sunny Mehta patient, admission AVS-ADM-26-27-251, IPD bill AVS-IPD-26-27-234, and earlier pharmacy bill AVS-PHM-26-27-109.',
        organizationId: ORG_ID,
      },
    });
    console.log('  ✓ Created restore audit log entry');
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ RESTORE COMPLETED SUCCESSFULLY');
  console.log('='.repeat(70) + '\n');
}

main()
  .catch((err) => {
    console.error('\n❌ RESTORE TRANSACTION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
