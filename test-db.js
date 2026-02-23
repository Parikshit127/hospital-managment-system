const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    console.log('Checking Prisma Client Keys...');
    const keys = Object.keys(prisma);
    console.log('Keys on prisma instance:', keys);

    // Check specific model
    if (prisma.pharmacy_orders) {
        console.log('SUCCESS: prisma.pharmacy_orders exists.');
    } else {
        console.log('FAILURE: prisma.pharmacy_orders is UNDEFINED.');
        // List all properties starting with p
        console.log('Properties starting with p:', Object.getOwnPropertyNames(prisma).filter(k => k.startsWith('p')));
    }
}

main();
