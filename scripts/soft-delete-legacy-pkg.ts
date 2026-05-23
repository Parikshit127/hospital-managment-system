import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

prisma.ipdPackage.update({
  where: { id: 1 },
  data: { is_active: false },
}).then((r) => {
  console.log(`✓ Soft-deleted package id=${r.id} (${r.package_code} / "${r.package_name}") — is_active=${r.is_active}`);
}).catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
