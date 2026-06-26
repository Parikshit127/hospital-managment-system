/**
 * Upsert inventory demo users without running the full org seed.
 * Usage: npx tsx scripts/seed-inventory-users.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { username: 'store1', role: 'store_manager', name: 'Raj Store Manager', email: 'raj.store@avanihospital.com', phone: '9800070001' },
  { username: 'proc1', role: 'procurement_officer', name: 'Kiran Procurement', email: 'kiran.proc@avanihospital.com', phone: '9800070002' },
  { username: 'proc', role: 'procurement_officer', name: 'Kiran Procurement (alias)', email: 'proc.alias@avanihospital.com', phone: '9800070003' },
  { username: 'nurse1', role: 'nurse', name: 'Sneha Ward Nurse', email: 'sneha.nurse@avanihospital.com', phone: '9800070004' },
];

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD || 'password123';
  const hash = await bcrypt.hash(password, 10);

  const org = await prisma.organization.findFirst({ where: { is_active: true }, orderBy: { created_at: 'asc' } });
  if (!org) {
    console.error('No active organization found. Run full seed or create an org first.');
    process.exit(1);
  }

  console.log(`Using organization: ${org.name} (${org.id})`);
  console.log(`Password for all demo users: ${password}`);

  for (const u of DEMO_USERS) {
    const row = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        password: hash,
        role: u.role,
        name: u.name,
        email: u.email,
        phone: u.phone,
        is_active: true,
        organizationId: org.id,
      },
      create: {
        username: u.username,
        password: hash,
        role: u.role,
        name: u.name,
        email: u.email,
        phone: u.phone,
        is_active: true,
        organizationId: org.id,
      },
    });
    console.log(`✓ ${row.username} (${row.role})`);
  }

  console.log('\nLogin credentials:');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.username} / ${password}  →  ${u.role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
