
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting cleanup of invalid pharmacy orders...');

    // 1. Get all valid Patient IDs
    const validPatients = await prisma.oPD_REG.findMany({
        select: { patient_id: true }
    });
    const validPatientIds = new Set(validPatients.map(p => p.patient_id));

    // 2. Find invalid orders
    const allOrders = await prisma.pharmacy_orders.findMany({
        select: { id: true, patient_id: true }
    });

    const invalidOrderIds: number[] = [];
    for (const order of allOrders) {
        if (!validPatientIds.has(order.patient_id)) {
            console.log(`Found invalid order #${order.id} with patient_id: ${order.patient_id}`);
            invalidOrderIds.push(order.id);
        }
    }

    if (invalidOrderIds.length === 0) {
        console.log('No invalid orders found.');
        return;
    }

    console.log(`Deleting ${invalidOrderIds.length} invalid orders...`);

    // 3. Delete items first (FK constraint)
    await prisma.pharmacy_order_items.deleteMany({
        where: { order_id: { in: invalidOrderIds } }
    });

    // 4. Delete orders
    await prisma.pharmacy_orders.deleteMany({
        where: { id: { in: invalidOrderIds } }
    });

    console.log('Cleanup complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
