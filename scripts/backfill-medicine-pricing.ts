import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const medicines = await prisma.pharmacy_medicine_master.findMany();
  for (const m of medicines) {
    await prisma.pharmacy_medicine_master.update({
      where: { id: m.id },
      data: {
        selling_price: m.selling_price || m.price_per_unit,
        mrp: m.mrp || m.price_per_unit,
        purchase_price: m.purchase_price || (m.price_per_unit * 0.8),
        gst_percent: m.gst_percent || (m.tax_rate ?? 0),
      },
    });
  }
  console.log(`Backfilled ${medicines.length} medicines.`);
}
main().finally(() => prisma.$disconnect());
