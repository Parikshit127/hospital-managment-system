/**
 * Import medicine master list into Axten and Avise hospitals.
 *
 * Steps:
 *   1. Find org IDs for Axten and Avise
 *   2. Delete existing medicines + batches for both
 *   3. Read xlsx and deduplicate by name
 *   4. Insert unique medicines into both orgs
 *
 * Run on EC2:
 *   cd ~/hospitalos
 *   node scripts/import-medicine-master.js "Medicine Name List.xlsx"
 */

const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const p = new PrismaClient();

// Map unit abbreviations to standard form names
const UNIT_MAP = {
  'TAB': 'Tablet',
  'CAP': 'Capsule',
  'INJ': 'Injection',
  'SYRUP': 'Syrup',
  'PIECE': 'Piece',
  'PCS': 'Piece',
  'NOS': 'Piece',
  'VIAL': 'Vial',
  'TUBE': 'Tube',
  'BTL': 'Bottle',
  'ML': 'Liquid',
  'AMP': 'Ampoule',
  'GEL': 'Gel',
  'PACK': 'Pack',
  'STRIP': 'Strip',
  'INHAL': 'Inhaler',
  'LOTI': 'Lotion',
  'SPRAY': 'Spray',
  'JAR': 'Jar',
  'SOLU': 'Solution',
  'OINT': 'Ointment',
  'SACH': 'Sachet',
  'LIQ': 'Liquid',
  'KIT': 'Kit',
  'BAG': 'Bag',
  'PAIR': 'Pair',
  'ROLL': 'Roll',
  'NEED': 'Needle',
  'BOX': 'Box',
};

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-medicine-master.js <xlsx-file>');
    process.exit(1);
  }

  // 1. Find orgs
  console.log('\n1. Finding organizations...');
  const orgs = await p.organization.findMany({
    select: { id: true, name: true, code: true },
  });
  console.log('   All orgs:', orgs.map(o => `${o.name} (${o.code})`).join(', '));

  const axten = orgs.find(o => o.code === 'AXT' || o.name.toLowerCase().includes('axten'));
  const avise = orgs.find(o => o.code === 'AVS' || o.name.toLowerCase().includes('avise'));

  if (!axten) { console.error('Axten org not found!'); process.exit(1); }
  if (!avise) { console.error('Avise org not found!'); process.exit(1); }

  const targetOrgs = [
    { id: axten.id, name: axten.name },
    { id: avise.id, name: avise.name },
  ];
  console.log(`   Axten: ${axten.id}`);
  console.log(`   Avise: ${avise.id}`);

  // 2. Delete existing medicines for both orgs
  console.log('\n2. Clearing existing medicines...');
  for (const org of targetOrgs) {
    // Delete related records first (FK constraints)
    // Dispense allocations -> order items -> orders
    const orderIds = (await p.pharmacy_orders.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    })).map(o => o.id);

    if (orderIds.length > 0) {
      await p.dispenseAllocation.deleteMany({ where: { order_item: { order_id: { in: orderIds } } } }).catch(() => {});
      await p.pharmacy_order_items.deleteMany({ where: { order_id: { in: orderIds } } }).catch(() => {});
      await p.pharmacy_orders.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    }

    // Sales audit
    await p.pharmacy_sales_audit.deleteMany({
      where: { medicine: { organizationId: org.id } }
    }).catch(() => {});

    // Narcotic register
    await p.narcoticRegister.deleteMany({
      where: { organizationId: org.id }
    }).catch(() => {});

    // Inventory movements
    await p.pharmacyInventoryMovement.deleteMany({
      where: { medicine: { organizationId: org.id } }
    }).catch(() => {});

    // Batches (FK to medicine)
    const batchDel = await p.pharmacy_batch_inventory.deleteMany({
      where: { medicine: { organizationId: org.id } }
    });

    // Medicine master
    const medDel = await p.pharmacy_medicine_master.deleteMany({
      where: { organizationId: org.id }
    });

    console.log(`   ${org.name}: deleted ${medDel.count} medicines, ${batchDel.count} batches`);
  }

  // 3. Read and deduplicate xlsx
  console.log(`\n3. Reading ${filePath}...`);
  const wb = XLSX.readFile(path.resolve(filePath));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const uniqueMeds = new Map(); // name -> { name, unit, form }
  for (const row of rows) {
    const rawName = String(row['Item Name          '] || row['Item Name'] || '').trim();
    if (!rawName) continue;

    const name = rawName.replace(/\s+/g, ' '); // normalize whitespace
    const unit = String(row[' Unit          '] || row['Unit'] || '').trim().toUpperCase();

    if (!uniqueMeds.has(name.toUpperCase())) {
      uniqueMeds.set(name.toUpperCase(), {
        name,
        unit,
        form: UNIT_MAP[unit] || unit || 'Piece',
      });
    }
  }

  console.log(`   Total rows: ${rows.length}`);
  console.log(`   Unique medicines: ${uniqueMeds.size}`);

  // 4. Import into both orgs
  const medicines = Array.from(uniqueMeds.values());

  for (const org of targetOrgs) {
    console.log(`\n4. Importing ${medicines.length} medicines into ${org.name}...`);

    let imported = 0;
    let errors = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < medicines.length; i += BATCH_SIZE) {
      const batch = medicines.slice(i, i + BATCH_SIZE);

      const createData = batch.map(med => ({
        brand_name: med.name,
        generic_name: '',
        mrp: 0,
        purchase_price: 0,
        selling_price: 0,
        price_per_unit: 0,
        form: med.form,
        organizationId: org.id,
      }));

      try {
        const result = await p.pharmacy_medicine_master.createMany({
          data: createData,
          skipDuplicates: true,
        });
        imported += result.count;
      } catch (e) {
        // If createMany fails, fall back to individual inserts
        for (const d of createData) {
          try {
            await p.pharmacy_medicine_master.create({ data: d });
            imported++;
          } catch (ee) {
            errors++;
          }
        }
      }

      if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= medicines.length) {
        process.stdout.write(`   Progress: ${Math.min(i + BATCH_SIZE, medicines.length)}/${medicines.length} (${imported} ok, ${errors} err)\r`);
      }
    }

    console.log(`\n   ${org.name}: ${imported} medicines imported, ${errors} errors`);
  }

  // 5. Verify
  console.log('\n5. Verification:');
  const counts = await p.pharmacy_medicine_master.groupBy({
    by: ['organizationId'],
    _count: { id: true },
  });
  for (const c of counts) {
    const orgName = targetOrgs.find(o => o.id === c.organizationId)?.name || c.organizationId;
    console.log(`   ${orgName}: ${c._count.id} medicines`);
  }

  console.log('\nDone!');
  await p.$disconnect();
}

run().catch(e => {
  console.error('Error:', e.message);
  p.$disconnect();
  process.exit(1);
});
