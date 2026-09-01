/**
 * Bulk-create staff login accounts (nurse, pharmacist, finance, doctor).
 *
 * 1. Edit the USERS array below — set real usernames/passwords/names.
 * 2. Find your ORGANIZATION_ID:  npx tsx scripts/lookup-org.ts
 * 3. Run on the server:
 *      ORGANIZATION_ID="<id-from-step-2>" npx tsx scripts/add-staff-users.ts
 *
 * Safe to re-run — usernames that already exist are skipped, not overwritten.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ORG = process.env.ORGANIZATION_ID;

// ── Edit these four accounts before running ──────────────────────────
const USERS = [
    { username: 'nurse1',      password: 'ChangeMe123!', name: 'Nurse Name',      role: 'nurse' },
    { username: 'pharmacist1', password: 'ChangeMe123!', name: 'Pharmacist Name', role: 'pharmacist' },
    { username: 'finance1',    password: 'ChangeMe123!', name: 'Finance Name',    role: 'finance' },
    { username: 'doctor1',     password: 'ChangeMe123!', name: 'Doctor Name',     role: 'doctor' },
];
// ──────────────────────────────────────────────────────────────────────

async function main() {
    if (!ORG) {
        console.error('❌ Set ORGANIZATION_ID env var. Run `npx tsx scripts/lookup-org.ts` to list org ids.');
        process.exit(1);
    }

    const org = await prisma.organization.findUnique({ where: { id: ORG }, select: { id: true, name: true } });
    if (!org) {
        console.error(`❌ No organization found with id "${ORG}". Run scripts/lookup-org.ts to list valid ids.`);
        process.exit(1);
    }
    console.log(`Target org: ${org.name} (${org.id})\n`);

    for (const u of USERS) {
        const existing = await prisma.user.findUnique({ where: { username: u.username } });
        if (existing) {
            console.log(`⚠️  Skipped "${u.username}" — username already exists (id=${existing.id}).`);
            continue;
        }

        const hashedPassword = await bcrypt.hash(u.password, 10);
        const created = await prisma.user.create({
            data: {
                username: u.username,
                password: hashedPassword,
                name: u.name,
                role: u.role,
                organizationId: org.id,
                is_active: true,
            },
            select: { id: true, username: true, role: true },
        });
        console.log(`✓ Created ${created.role.padEnd(10)} username="${created.username}" id=${created.id}`);
    }

    console.log('\nDone. Share the usernames/passwords from the USERS array above with staff, then have them change the password on first login.');
}

main()
    .catch((e) => {
        console.error('❌', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
