
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Wiping ALL pharmacy orders...');

    await prisma.pharmacy_order_items.deleteMany({});
    await prisma.pharmacy_orders.deleteMany({});

    console.log('Wipe complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
