import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Invoices:", await prisma.invoices.findMany({ take: 5 }));
    console.log("OPD_REG:", await prisma.oPD_REG.findMany({ take: 5 }));
}

main().finally(() => prisma.$disconnect());
