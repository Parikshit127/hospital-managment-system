const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const invoiceNos = ['AVS-OPD-26-27-304', 'AVS-OPD-26-27-318'];
  
  for (const no of invoiceNos) {
    console.log('\n====', no, '====');
    const inv = await db.invoices.findFirst({
      where: { invoice_number: no, org_id: '0425857b-6293-4d91-86b2-bd049de66252' },
      select: {
        id: true, invoice_number: true, patient_id: true,
        doctor_name: true, doctor_id: true,
        billing_patient_type: true, status: true,
        items: { select: { id: true, description: true, service_category: true, department: true } },
        patient: { select: { patient_id: true, name: true, doctor_name: true, department: true } }
      }
    });
    if (!inv) { console.log('NOT FOUND'); continue; }
    console.log('Patient:', inv.patient?.name, '(', inv.patient?.patient_id, ')');
    console.log('Invoice doctor_name:', JSON.stringify(inv.doctor_name));
    console.log('Invoice doctor_id:', JSON.stringify(inv.doctor_id));
    console.log('Patient doctor_name:', JSON.stringify(inv.patient?.doctor_name));
    console.log('Patient department:', JSON.stringify(inv.patient?.department));
    console.log('Items:');
    for (const it of inv.items) {
      console.log('  -', it.service_category, '|', it.description, '| dept:', it.department);
    }
  }

  const patientIds = ['AVS-2026-00257', 'AVS-2026-00264'];
  for (const pid of patientIds) {
    const appts = await db.appointment.findMany({
      where: { patient_id: pid, org_id: '0425857b-6293-4d91-86b2-bd049de66252' },
      select: { id: true, patient_id: true, doctor_name: true, department: true, date: true },
      orderBy: { date: 'desc' },
      take: 3
    });
    console.log('\nAppointments for', pid, ':', appts.length);
    appts.forEach(a => console.log('  -', a.doctor_name, '|', a.department, '|', a.date));
  }
}

main().catch(console.error).finally(() => db.$disconnect());
