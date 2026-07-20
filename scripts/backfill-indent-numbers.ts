import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get financial year string (e.g., "26-27" for April 2026 - March 2027)
function getFinancialYear(date: Date): string {
    const month = date.getMonth(); // 0-indexed (0=Jan, 3=Apr)
    const year = date.getFullYear();
    // FY starts in April
    const fyStart = month >= 3 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

async function main() {
  console.log('Fetching pharmacy orders with missing indent numbers...');
  
  const orders = await prisma.pharmacy_orders.findMany({
    where: {
      indent_number: null,
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  console.log(`Found ${orders.length} order(s) to backfill.`);

  if (orders.length === 0) {
    console.log('No backfill needed.');
    return;
  }

  // Get all organizations involved
  const orgIds = Array.from(new Set(orders.map(o => o.organizationId)));
  const orgMap = new Map<string, string>();
  for (const orgId of orgIds) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { code: true },
    });
    orgMap.set(orgId, org?.code || 'HOS');
  }

  let successCount = 0;

  // Process by organization and financial year to ensure correct sequential counting
  for (const orgId of orgIds) {
    const orgCode = orgMap.get(orgId) || 'HOS';
    const orgOrders = orders.filter(o => o.organizationId === orgId);

    // Group by FY
    const fyGroups = new Map<string, typeof orders>();
    for (const order of orgOrders) {
      const fy = getFinancialYear(order.created_at);
      if (!fyGroups.has(fy)) {
        fyGroups.set(fy, []);
      }
      fyGroups.get(fy)!.push(order);
    }

    for (const [fy, fyOrders] of fyGroups.entries()) {
      // Find the last sequence number already existing in the database for this prefix to avoid collisions
      const prefix = `${orgCode}-IND-${fy}-`;
      const count = await prisma.pharmacy_orders.count({
        where: {
          organizationId: orgId,
          indent_number: { startsWith: prefix },
        },
      });

      let nextIndex = count + 1;

      console.log(`Org: ${orgCode}, FY: ${fy}. Existing count: ${count}. Backfilling ${fyOrders.length} orders...`);

      for (const order of fyOrders) {
        let finalNumber = '';
        let attempt = nextIndex;
        
        // Loop to ensure uniqueness if there are any overlaps
        while (true) {
          finalNumber = `${prefix}${String(attempt).padStart(3, '0')}`;
          const existing = await prisma.pharmacy_orders.findFirst({
            where: { indent_number: finalNumber },
            select: { id: true },
          });
          if (!existing) break;
          attempt++;
        }
        
        nextIndex = attempt + 1;

        await prisma.pharmacy_orders.update({
          where: { id: order.id },
          data: { indent_number: finalNumber },
        });

        successCount++;
      }
    }
  }

  console.log(`Successfully backfilled ${successCount} order(s) with formatted indent numbers.`);
}

main()
  .catch((e) => {
    console.error('Error running backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
