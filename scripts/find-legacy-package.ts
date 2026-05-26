import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ORG = 'org-avani-default';
const PREFIXES = ['ENT-', 'GSURG-', 'OBG-', 'ORTHO-', 'URO-', 'VASC-', 'COSM-', 'ONCO-'];

prisma.ipdPackage.findMany({
  where: {
    organizationId: ORG,
    NOT: PREFIXES.map((p) => ({ package_code: { startsWith: p } })),
  },
}).then((rows) => {
  console.log(JSON.stringify(rows, null, 2));
}).finally(() => prisma.$disconnect());
