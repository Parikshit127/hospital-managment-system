import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const org = await prisma.organization.findFirst();
  console.log('org', org?.id);
  const vendor = await prisma.vendor.findFirst({ where: { organizationId: org.id, is_active: true } });
  const store = await prisma.stores.findFirst({ where: { organizationId: org.id } });
  const item = await prisma.item_master.findFirst({ where: { organizationId: org.id, status: 'Active' } });
  console.log({ vendor: vendor?.id, store: store?.id, item: item?.id });

  if (!vendor || !store || !item) {
    console.log('Missing seed data');
    process.exit(1);
  }

  let pharmSupplier = await prisma.pharmacySupplier.findFirst({
    where: { organizationId: org.id, name: vendor.vendor_name },
  });
  if (!pharmSupplier) {
    pharmSupplier = await prisma.pharmacySupplier.create({
      data: { name: vendor.vendor_name, organizationId: org.id },
    });
  }

  const poNum = `PO-TEST-${Date.now()}`;
  const po = await prisma.purchaseOrder.create({
    data: {
      po_number: poNum,
      supplier_id: pharmSupplier.id,
      vendor_id: vendor.id,
      storeId: store.id,
      status: 'Draft',
      total_amount: 100,
      gst_amount: 0,
      organizationId: org.id,
      items: {
        create: [{
          itemMasterId: item.id,
          quantity_ordered: 10,
          unit_price: 10,
          gst_rate: item.gst_rate || 0,
          cgst_rate: (item.gst_rate || 0) / 2,
          sgst_rate: (item.gst_rate || 0) / 2,
          hsn_code: item.hsn_sac_code,
          amount: 100,
          uom: item.purchase_uom,
          conversion_to_base: item.uom_conversion ?? 1,
        }],
      },
    },
  });
  console.log('SUCCESS', po.id, po.po_number);
  await prisma.purchaseOrder.delete({ where: { id: po.id } });
} catch (e) {
  console.error('FAILED:', e.message);
  if (e.meta) console.error('meta:', e.meta);
} finally {
  await prisma.$disconnect();
}
