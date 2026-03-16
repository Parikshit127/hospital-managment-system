import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const models = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
  const counts: Record<string, number> = {};
  
  for (const model of models) {
    try {
      const count = await (prisma as any)[model].count();
      counts[model] = count;
    } catch (e) {
      counts[model] = -1; // error
    }
  }
  
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(console.error).finally(()=>prisma.$disconnect());
