const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        await prisma.$connect();
        console.log('Database connected successfully.');
        const userCount = await prisma.user.count();
        console.log(`Users in the database: ${userCount}`);
    } catch (e) {
        console.error('Database connection failed.', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
