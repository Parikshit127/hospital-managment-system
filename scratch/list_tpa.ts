import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const providers = await prisma.insurance_providers.findMany({
    select: { id: true, provider_name: true, provider_code: true }
  });
  console.log(JSON.stringify(providers, null, 2));
}

main().finally(() => prisma.$disconnect());
