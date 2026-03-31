const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoices.findMany({ take: 5, orderBy: { created_at: 'desc' }, include: { items: true } });
    const opd = await prisma.oPD_REG.findMany({ take: 5, orderBy: { created_at: 'desc' } });
    fs.writeFileSync("out3.json", JSON.stringify({ invoices, opd }, null, 2), "utf-8");
}

main().finally(() => prisma.$disconnect());
