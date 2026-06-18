const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function undischarge() {
  const orgId = '0425857b-6293-4d91-86b2-bd049de66252';
  const patients = [
    'AVS-2026-00156',  // Yogesh Sharma
    'AVS-2026-00152',  // Rohit Kumar Sharma
    'AVS-2026-00146',  // MOHIT
    'AVS-2026-00144',  // NATVER JHA
  ];

  for (const pid of patients) {
    const adm = await prisma.admissions.findFirst({
      where: { patient_id: pid, organizationId: orgId, status: 'Discharged' }
    });

    if (!adm) {
      console.log(pid, '- no discharged admission found, skipping');
      continue;
    }

    console.log(pid, '-', adm.admission_id, '| bed:', adm.bed_id, '| discharged:', adm.discharge_date);

    // 1. Reset admission to Admitted
    await prisma.admissions.update({
      where: { admission_id: adm.admission_id },
      data: {
        status: 'Admitted',
        discharge_date: null,
        discharge_type: null,
        discharge_disposition: null,
        discharge_instructions: null,
        fit_for_discharge_at: null,
        fit_for_discharge_by: null,
      }
    });

    // 2. Set bed back to Occupied
    if (adm.bed_id) {
      await prisma.beds.update({
        where: { bed_id: adm.bed_id },
        data: { status: 'Occupied' }
      }).catch(e => console.log('  bed update skipped:', e.message));
    }

    // 3. Delete discharge summary (new one will be created on re-discharge)
    await prisma.discharge_summaries.deleteMany({
      where: { admission_id: adm.admission_id, organizationId: orgId }
    }).catch(e => console.log('  summary delete skipped:', e.message));

    // 4. Revert invoice from Final back to Draft
    await prisma.invoices.updateMany({
      where: { admission_id: adm.admission_id, organizationId: orgId, status: 'Final' },
      data: { status: 'Draft', finalized_at: null }
    }).catch(e => console.log('  invoice revert skipped:', e.message));

    console.log(pid, '- UNDISCHARGED OK');
  }

  await prisma.$disconnect();
  console.log('Done - all 4 patients are back to Admitted');
}

undischarge().catch(e => { console.error(e); process.exit(1); });
