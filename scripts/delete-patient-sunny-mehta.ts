/**
 * HospitalOS — Record Deletion Script for "Sunny Mehta"
 *
 * Scans and deletes all records associated with "Sunny Mehta":
 *  1. Registered Patient (OPD_REG) records matching "Sunny Mehta" / UHID (e.g. AVS-2026-00099),
 *     including all linked admissions, IPD/OPD invoices, payments, pharmacy orders,
 *     clinical notes, vitals, lab orders, and frees any assigned beds back to 'Available'.
 *  2. Walk-in / Counter Pharmacy Invoices (e.g. AVS-PHM-26-27-112) where notes contain "Sunny Mehta".
 *
 * SAFETY & TRANSACTION RULES:
 *  - DRY RUN by default: Inspects and prints everything found without modifying the DB.
 *  - Pass `--apply` to execute the deletion inside a single atomic Prisma transaction.
 *  - Cascade order satisfies all PostgreSQL foreign key constraints.
 *  - Writes an audit log entry in `system_audit_logs`.
 *
 * USAGE:
 *  Dry run (safe inspection):
 *    npx tsx scripts/delete-patient-sunny-mehta.ts
 *
 *  Execute on AWS RDS (using DATABASE_URL from .env or inline):
 *    DATABASE_URL="<AWS_RDS_POSTGRES_URL>" npx tsx scripts/delete-patient-sunny-mehta.ts --apply
 *
 *  Optional filters:
 *    npx tsx scripts/delete-patient-sunny-mehta.ts --name="Sunny Mehta"
 *    npx tsx scripts/delete-patient-sunny-mehta.ts --patient="AVS-2026-00099"
 *    npx tsx scripts/delete-patient-sunny-mehta.ts --invoice="AVS-IPD-26-27-234"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const NAME_ARG = (process.argv.find((a) => a.startsWith('--name=')) || '').split('=')[1]?.trim() || 'Sunny Mehta';
const PATIENT_ARG = (process.argv.find((a) => a.startsWith('--patient=')) || '').split('=')[1]?.trim() || null;
const INVOICE_ARG = (process.argv.find((a) => a.startsWith('--invoice=')) || '').split('=')[1]?.trim() || null;

const money = (n: any) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseWalkinNote(notes?: string | null): { name: string; contact: string; address: string } {
  const raw = (notes || '').trim();
  if (!raw) return { name: '', contact: '', address: '' };
  if (raw.startsWith('{')) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        return {
          name: String(o.n || o.name || '').trim(),
          contact: String(o.c || o.contact || '').trim(),
          address: String(o.a || o.address || '').trim(),
        };
      }
    } catch {
      /* treat as plain string */
    }
  }
  return { name: raw, contact: '', address: '' };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(' HOSPITALOS — RECORD DELETION FOR "SUNNY MEHTA"');
  console.log('='.repeat(70));
  console.log(` Mode   : ${APPLY ? '🔴 APPLY (Changes WILL be committed to DB)' : '🟢 DRY RUN (No changes made — safe inspection)'}`);
  console.log(` Target : Name contains "${NAME_ARG}"${PATIENT_ARG ? ` | Patient ID: ${PATIENT_ARG}` : ''}${INVOICE_ARG ? ` | Invoice: ${INVOICE_ARG}` : ''}`);
  console.log('-'.repeat(70) + '\n');

  // 1. Find Patients matching target
  const patientWhere: any = {
    OR: [
      { full_name: { contains: NAME_ARG, mode: 'insensitive' } },
      ...(PATIENT_ARG ? [{ patient_id: PATIENT_ARG }] : []),
    ],
  };

  const patients = await prisma.oPD_REG.findMany({
    where: patientWhere,
    include: {
      admissions: true,
      invoices: true,
    },
  });

  const patientIds = patients.map((p) => p.patient_id);

  // 2. Find Walk-in / Counter Invoices matching target in notes or invoice number
  const candidateInvoices = await prisma.invoices.findMany({
    where: {
      OR: [
        ...(INVOICE_ARG ? [{ invoice_number: INVOICE_ARG }, { final_bill_number: INVOICE_ARG }] : []),
        { notes: { contains: NAME_ARG, mode: 'insensitive' } },
        { patient_id: { in: patientIds } },
      ],
    },
    include: {
      items: true,
      payments: true,
      payment_splits: true,
      pharmacy_orders: {
        include: {
          items: {
            include: {
              dispense_allocations: true,
            },
          },
        },
      },
    },
  });

  // Filter invoices to ensure walk-in ones genuinely match the parsed customer name
  const targetInvoices = candidateInvoices.filter((inv) => {
    if (patientIds.includes(inv.patient_id)) return true;
    if (INVOICE_ARG && (inv.invoice_number === INVOICE_ARG || inv.final_bill_number === INVOICE_ARG)) return true;
    const parsed = parseWalkinNote(inv.notes);
    return parsed.name.toLowerCase().includes(NAME_ARG.toLowerCase());
  });

  const invoiceIds = targetInvoices.map((inv) => inv.id);

  // 3. Find all Admissions for these patients or linked to target invoices
  const targetAdmissionIdsFromInvoices = targetInvoices.map((i) => i.admission_id).filter((id): id is string => Boolean(id));
  const admissions = await prisma.admissions.findMany({
    where: {
      OR: [
        { patient_id: { in: patientIds } },
        { admission_id: { in: targetAdmissionIdsFromInvoices } },
      ],
    },
  });

  const admissionIds = admissions.map((a) => a.admission_id);
  const bedIdsToFree = admissions.map((a) => a.bed_id).filter((b): b is string => Boolean(b));

  // 4. Find all Pharmacy Orders
  const pharmacyOrders = await prisma.pharmacy_orders.findMany({
    where: {
      OR: [
        { patient_id: { in: patientIds } },
        { admission_id: { in: admissionIds } },
        { invoice_id: { in: invoiceIds } },
      ],
    },
    include: {
      items: {
        include: {
          dispense_allocations: true,
        },
      },
    },
  });

  const pharmacyOrderIds = pharmacyOrders.map((o) => o.id);
  const pharmacyOrderItemIds = pharmacyOrders.flatMap((o) => o.items.map((i) => i.id));
  const dispenseAllocationIds = pharmacyOrders.flatMap((o) => o.items.flatMap((i) => i.dispense_allocations.map((d) => d.id)));

  // 5. Payments and splits
  const payments = await prisma.payments.findMany({
    where: { invoice_id: { in: invoiceIds } },
  });
  const paymentIds = payments.map((p) => p.id);

  // 6. Report Findings
  console.log('📋 INVENTORY OF MATCHED RECORDS TO BE REMOVED:\n');

  console.log(`👤 Patients (${patients.length}):`);
  if (patients.length === 0) {
    console.log('   (No registered patient records found)');
  } else {
    for (const p of patients) {
      console.log(`   • UHID: ${p.patient_id} | Name: ${p.full_name} | Phone: ${p.phone || 'N/A'} | Org: ${p.organizationId}`);
    }
  }
  console.log('');

  console.log(`🏥 Admissions (${admissions.length}):`);
  if (admissions.length === 0) {
    console.log('   (No admission records found)');
  } else {
    for (const a of admissions) {
      console.log(`   • ID: ${a.admission_id} | Patient: ${a.patient_id} | Status: ${a.status} | Bed: ${a.bed_id || 'None'} | Date: ${a.admission_date.toISOString()}`);
    }
  }
  console.log('');

  console.log(`🧾 Invoices / Bills (${targetInvoices.length}):`);
  if (targetInvoices.length === 0) {
    console.log('   (No invoice records found)');
  } else {
    for (const inv of targetInvoices) {
      const parsedNote = parseWalkinNote(inv.notes);
      const label = inv.invoice_number || `Draft #${inv.id}`;
      const patientDesc = inv.patient_id === 'WALKIN' ? `Walk-in (${parsedNote.name || 'Unknown'})` : inv.patient_id;
      console.log(`   • Bill: ${label} [${inv.invoice_type}] | Patient: ${patientDesc} | Status: ${inv.status} | Net: ${money(inv.net_amount)} | Paid: ${money(inv.paid_amount)} | Balance: ${money(inv.balance_due)}`);
      if (inv.items.length > 0) {
        console.log(`     └─ Line items (${inv.items.length}):`);
        for (const item of inv.items) {
          console.log(`        - ${item.description} (Qty: ${item.quantity}, Net: ${money(item.net_price)})`);
        }
      }
      if (inv.payments.length > 0) {
        console.log(`     └─ Payments (${inv.payments.length}):`);
        for (const pay of inv.payments) {
          console.log(`        - Receipt: ${pay.receipt_number} | Amount: ${money(pay.amount)} | Mode: ${pay.payment_method}`);
        }
      }
    }
  }
  console.log('');

  console.log(`💊 Pharmacy Orders (${pharmacyOrders.length}):`);
  if (pharmacyOrders.length === 0) {
    console.log('   (No pharmacy orders found)');
  } else {
    for (const o of pharmacyOrders) {
      console.log(`   • Order #${o.id} | Indent: ${o.indent_number || 'N/A'} | Status: ${o.status} | Items: ${o.items.length}`);
    }
  }
  console.log('');

  if (bedIdsToFree.length > 0) {
    console.log(`🛏️ Beds to be released to 'Available' (${bedIdsToFree.length}):`);
    console.log(`   • Bed IDs: ${bedIdsToFree.join(', ')}\n`);
  }

  const totalRecords = patients.length + admissions.length + targetInvoices.length + pharmacyOrders.length;
  if (totalRecords === 0) {
    console.log('✨ No matching records found in database. Nothing to delete.\n');
    return;
  }

  console.log(`Total primary entities identified for deletion: ${totalRecords}`);
  console.log('-'.repeat(70));

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN COMPLETED. No data was deleted.');
    console.log('👉 To permanently delete the above records from your RDS database, re-run with --apply:');
    console.log('\n   DATABASE_URL="<your-rds-url>" npx tsx scripts/delete-patient-sunny-mehta.ts --apply\n');
    return;
  }

  console.log('\n🚀 EXECUTING DELETION IN ATOMIC TRANSACTION...\n');

  await prisma.$transaction(async (tx) => {
    // A. Pharmacy Order Dependencies
    if (dispenseAllocationIds.length > 0) {
      const res = await tx.dispenseAllocation.deleteMany({ where: { id: { in: dispenseAllocationIds } } });
      console.log(`  ✓ Deleted ${res.count} dispense allocations`);
    }
    if (pharmacyOrderItemIds.length > 0) {
      const res = await tx.pharmacy_order_items.deleteMany({ where: { id: { in: pharmacyOrderItemIds } } });
      console.log(`  ✓ Deleted ${res.count} pharmacy order items`);
    }
    if (pharmacyOrderIds.length > 0) {
      const res = await tx.pharmacy_orders.deleteMany({ where: { id: { in: pharmacyOrderIds } } });
      console.log(`  ✓ Deleted ${res.count} pharmacy orders`);
    }
    if (patientIds.length > 0) {
      const res = await tx.narcoticRegister.deleteMany({
        where: {
          OR: [
            { patient_id: { in: patientIds } },
            { patient_name: { contains: NAME_ARG, mode: 'insensitive' } },
          ],
        },
      });
      if (res.count > 0) console.log(`  ✓ Deleted ${res.count} narcotic register entries`);
    }

    // B. Invoice Dependencies
    if (invoiceIds.length > 0) {
      const pSplitRes = await tx.paymentSplit.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (pSplitRes.count > 0) console.log(`  ✓ Deleted ${pSplitRes.count} payment splits`);

      const payRes = await tx.payments.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (payRes.count > 0) console.log(`  ✓ Deleted ${payRes.count} payments`);

      const pIntentRes = await tx.paymentOrderIntent.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (pIntentRes.count > 0) console.log(`  ✓ Deleted ${pIntentRes.count} payment order intents`);

      const snapRes = await tx.invoice_snapshots.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (snapRes.count > 0) console.log(`  ✓ Deleted ${snapRes.count} invoice snapshots`);

      const itemRes = await tx.invoice_items.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (itemRes.count > 0) console.log(`  ✓ Deleted ${itemRes.count} invoice items`);

      const cnRes = await tx.creditNote.deleteMany({ where: { original_invoice_id: { in: invoiceIds } } });
      if (cnRes.count > 0) console.log(`  ✓ Deleted ${cnRes.count} credit notes`);

      const woRes = await tx.writeoff.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (woRes.count > 0) console.log(`  ✓ Deleted ${woRes.count} write-offs`);

      const recAllocRes = await tx.insuranceReceiptAllocation.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (recAllocRes.count > 0) console.log(`  ✓ Deleted ${recAllocRes.count} insurance receipt allocations`);

      const shortPayRes = await tx.claimShortPay.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (shortPayRes.count > 0) console.log(`  ✓ Deleted ${shortPayRes.count} claim short-pays`);

      const dunningRes = await tx.dunningLog.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (dunningRes.count > 0) console.log(`  ✓ Deleted ${dunningRes.count} dunning logs`);

      const docCommRes = await tx.doctorCommission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (docCommRes.count > 0) console.log(`  ✓ Deleted ${docCommRes.count} doctor commissions`);

      const refCommRes = await tx.referralCommission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
      if (refCommRes.count > 0) console.log(`  ✓ Deleted ${refCommRes.count} referral commissions`);

      const gstRes = await tx.gST_Invoice_Register.deleteMany({ where: { invoice_id: { in: invoiceIds.map(String) } } });
      if (gstRes.count > 0) console.log(`  ✓ Deleted ${gstRes.count} GST invoice register records`);

      // Delete GL journal entries linked to these invoices/payments
      const glEntries = await tx.gL_JournalEntry.findMany({
        where: {
          OR: [
            { reference_id: { in: invoiceIds.map(String) } },
            ...(paymentIds.length > 0 ? [{ reference_id: { in: paymentIds.map(String) } }] : []),
          ],
        },
        select: { id: true },
      });
      if (glEntries.length > 0) {
        const glIds = glEntries.map((g) => g.id);
        await tx.gL_JournalLine.deleteMany({ where: { journal_id: { in: glIds } } });
        await tx.gL_JournalEntry.deleteMany({ where: { id: { in: glIds } } });
        console.log(`  ✓ Deleted ${glIds.length} GL journal entries and their lines`);
      }

      // Delete insurance claims linked to target invoices
      await tx.insurance_claims.deleteMany({ where: { invoice_id: { in: invoiceIds } } });

      const invRes = await tx.invoices.deleteMany({ where: { id: { in: invoiceIds } } });
      console.log(`  ✓ Deleted ${invRes.count} invoices`);
    }

    // C. Surgery & OT Records for patients or admissions
    const surgeryRequests = await tx.surgeryRequest.findMany({
      where: {
        OR: [
          ...(patientIds.length > 0 ? [{ patient_id: { in: patientIds } }] : []),
          ...(admissionIds.length > 0 ? [{ admission_id: { in: admissionIds } }] : []),
        ],
      },
      select: { id: true },
    });
    if (surgeryRequests.length > 0) {
      const sIds = surgeryRequests.map((s) => s.id);
      await tx.surgeryConsumable.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.surgeryNote.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.surgeryTeamMember.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.oTSchedule.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.pACClearance.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.oTChecklist.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      await tx.surgeryBilling.deleteMany({ where: { surgery_request_id: { in: sIds } } });
      const sRes = await tx.surgeryRequest.deleteMany({ where: { id: { in: sIds } } });
      console.log(`  ✓ Deleted ${sRes.count} surgery requests and child records`);
    }

    // D. ER Registrations for patients or admissions
    const erRegs = await tx.eRRegistration.findMany({
      where: {
        OR: [
          ...(patientIds.length > 0 ? [{ patient_id: { in: patientIds } }] : []),
          ...(admissionIds.length > 0 ? [{ admission_id: { in: admissionIds } }] : []),
          { patient_name: { contains: NAME_ARG, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (erRegs.length > 0) {
      const erIds = erRegs.map((e) => e.id);
      await tx.eRNote.deleteMany({ where: { er_registration_id: { in: erIds } } });
      await tx.eROrder.deleteMany({ where: { er_registration_id: { in: erIds } } });
      await tx.eRVitals.deleteMany({ where: { er_registration_id: { in: erIds } } });
      await tx.mLCRecord.deleteMany({ where: { er_registration_id: { in: erIds } } });
      const erRes = await tx.eRRegistration.deleteMany({ where: { id: { in: erIds } } });
      console.log(`  ✓ Deleted ${erRes.count} ER registrations and child records`);
    }

    // E. Admission Dependencies
    if (admissionIds.length > 0) {
      await tx.medical_notes.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.discharge_summaries.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.admissionConsultant.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.bedTransfer.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.dietPlan.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.ipdAdmissionPackage.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.iPDVitals.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.nursingAssessment.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.nursingTask.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.wardRound.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.medicationAdministration.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.nursingAssessmentAlert.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.ipdChargePosting.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.insurancePreAuth.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.insurance_claims.deleteMany({ where: { admission_id: { in: admissionIds } } });
      await tx.tallyExport.deleteMany({ where: { admissionsAdmission_id: { in: admissionIds } } });

      // Indents linked to admissions
      const indents = await tx.indents.findMany({ where: { admission_id: { in: admissionIds } }, select: { id: true } });
      if (indents.length > 0) {
        const indentIds = indents.map((i) => i.id);
        await tx.indent_items.deleteMany({ where: { indent_id: { in: indentIds } } });
        await tx.stock_issues.deleteMany({ where: { indent_id: { in: indentIds } } });
        await tx.indents.deleteMany({ where: { id: { in: indentIds } } });
      }

      await tx.inventory_movements.deleteMany({ where: { admission_id: { in: admissionIds } } });

      // Free beds
      if (bedIdsToFree.length > 0) {
        await tx.beds.updateMany({
          where: { bed_id: { in: bedIdsToFree } },
          data: { status: 'Available' },
        });
        console.log(`  ✓ Released ${bedIdsToFree.length} bed(s) back to 'Available'`);
      }

      const admRes = await tx.admissions.deleteMany({ where: { admission_id: { in: admissionIds } } });
      console.log(`  ✓ Deleted ${admRes.count} admission records`);
    }

    // F. Direct Patient Dependencies & OPD_REG
    if (patientIds.length > 0) {
      await tx.patientNote.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.clinical_EHR.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.clinicalEncounter.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patientAllergy.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.vital_signs.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patientDeposit.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patientFeedback.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patientPasswordSetupToken.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.pillReminder.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.videoCallRequest.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.whatsapp_log.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.lab_orders.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.triage_results.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.insurance_policies.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patientConsent.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.patient_external_records.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.aiHealthAssessment.deleteMany({ where: { patient_id: { in: patientIds } } });
      await tx.appointments.deleteMany({ where: { patient_id: { in: patientIds } } });

      const ptRes = await tx.oPD_REG.deleteMany({ where: { patient_id: { in: patientIds } } });
      console.log(`  ✓ Deleted ${ptRes.count} OPD_REG patient record(s)`);
    }

    // G. Audit Log Entry
    const orgId = patients[0]?.organizationId || targetInvoices[0]?.organizationId || 'system';
    await tx.system_audit_logs.create({
      data: {
        user_id: 'script-cli',
        username: 'admin-script',
        role: 'admin',
        action: 'DELETE_PATIENT_RECORDS',
        module: 'Admin',
        entity_type: 'patient',
        entity_id: patientIds.join(', ') || invoiceIds.join(', '),
        details: `Deleted records for "${NAME_ARG}": ${patients.length} patient(s), ${admissions.length} admission(s), ${targetInvoices.length} invoice(s), ${pharmacyOrders.length} pharmacy order(s)`,
        organizationId: orgId,
      },
    });
    console.log('  ✓ Created system audit log entry');
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ DELETION COMPLETED SUCCESSFULLY');
  console.log('='.repeat(70) + '\n');
}

main()
  .catch((err) => {
    console.error('\n❌ TRANSACTION FAILED (All changes rolled back):', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
