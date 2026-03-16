import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- MODELS ---');
  // List all models in prisma client
  const models = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
  console.log(models);

  console.log('\n--- LATEST INVOICES ---');
  // Try lowercase
  try {
    const inv = await (prisma as any).invoices.findMany({ take: 3 });
    console.log('Invoices (lowercase):', JSON.stringify(inv, null, 2));
  } catch (e) {
    console.log('Invoices (lowercase) failed');
  }

  // Try uppercase
  try {
    const inv = await (prisma as any).Invoices.findMany({ take: 3 });
    console.log('Invoices (Uppercase):', JSON.stringify(inv, null, 2));
  } catch (e) {
    console.log('Invoices (Uppercase) failed');
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
