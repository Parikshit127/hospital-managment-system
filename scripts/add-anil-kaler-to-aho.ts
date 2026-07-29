/**
 * Add Dr. Anil Kaler as a DOCTOR record in Axten HO (AHO), specialty
 * "Reconstructive Surgeon", so he is selectable for billing / attending /
 * rendered-by. Login is NOT enabled — password is a locked, non-matching
 * placeholder (his Axten credentials are not copied). Username is distinct from
 * the Axten account.
 *
 * Idempotent: aborts if a "Kaler" doctor already exists in AHO.
 *
 * Usage:
 *   DATABASE_URL="<url>" npx tsx scripts/add-anil-kaler-to-aho.ts          # dry run
 *   DATABASE_URL="<url>" npx tsx scripts/add-anil-kaler-to-aho.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const AHO = '9bd49bae-cecc-49f8-b18d-88f146124a98';

async function main() {
    const existing: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name FROM users WHERE "organizationId"=$1 AND name ILIKE '%kaler%'`, AHO,
    );
    if (existing.length) {
        throw new Error(`ABORT: a Kaler doctor already exists in AHO (${existing.map((e) => e.name).join(', ')}).`);
    }

    const rec = {
        id: randomUUID(),
        name: 'DR. ANIL KALER',
        username: 'dr.anilkaler.aho',
        // Locked placeholder — not a valid bcrypt hash, so authentication can never
        // succeed. This doctor exists for selection/attribution, not for login.
        password: 'LOGIN_DISABLED_' + randomUUID(),
        role: 'doctor',
        specialty: 'Reconstructive Surgeon',
        organizationId: AHO,
        is_active: true,
    };

    console.log('Add Dr. Anil Kaler -> Axten HO');
    console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
    console.log('   name       :', rec.name);
    console.log('   username   :', rec.username, '(distinct from the Axten account)');
    console.log('   specialty  :', rec.specialty);
    console.log('   role       :', rec.role);
    console.log('   login      : DISABLED (no password copied)');

    if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return; }

    await prisma.$executeRawUnsafe(
        `INSERT INTO users (id, name, username, password, role, specialty, "organizationId", is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        rec.id, rec.name, rec.username, rec.password, rec.role, rec.specialty, rec.organizationId, rec.is_active,
    );
    const check: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name, specialty, role, is_active FROM users WHERE id=$1`, rec.id,
    );
    console.log('\nCreated:', JSON.stringify(check[0]));
}

main().catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
