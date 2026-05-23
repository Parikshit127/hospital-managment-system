import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const PATIENT = 'UHID-TEST-1779527008758';
const ORG = 'org-avani-default';

async function main() {
  const patient = await prisma.oPD_REG.findFirst({
    where: { patient_id: PATIENT, organizationId: ORG },
    select: { patient_id: true, full_name: true, organizationId: true, is_archived: true },
  });
  console.log('PATIENT:', patient);

  const invoices = await prisma.invoices.findMany({
    where: { patient_id: PATIENT, organizationId: ORG },
    include: { items: true },
  });
  console.log(`\nINVOICES for ${PATIENT} (${invoices.length}):`);
  for (const inv of invoices) {
    console.log({
      id: inv.id,
      number: inv.invoice_number,
      type: inv.invoice_type,
      status: inv.status,
      total: String(inv.total_amount),
      net: String(inv.net_amount),
      is_archived: inv.is_archived,
      items_count: inv.items.length,
      admission_id: inv.admission_id,
    });
    for (const it of inv.items) {
      console.log('  ITEM:', { id: it.id, desc: it.description, qty: it.quantity, unit: String(it.unit_price), net: String(it.net_price) });
    }
  }

  const admissions = await prisma.admissions.findMany({
    where: { patient_id: PATIENT, organizationId: ORG },
    include: {
      ipd_admission_packages: { include: { package: true } },
    },
  });
  console.log(`\nADMISSIONS (${admissions.length}):`);
  for (const a of admissions) {
    console.log({ id: a.admission_id, status: a.status, packages: a.ipd_admission_packages.length });
    for (const ap of a.ipd_admission_packages) {
      console.log('  PKG:', { code: ap.package.package_code, name: ap.package.package_name, applied: String(ap.applied_amount) });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
