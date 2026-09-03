/**
 * Diagnose "Patient not found" on the billing profile page.
 * Looks up a patient_id with NO org filter, so it finds the row regardless
 * of which organization it actually belongs to, and shows every org on
 * the server for comparison.
 *
 * Usage:
 *   PATIENT_ID="GMCH-2026-00002" npx tsx scripts/find-patient.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PATIENT_ID = process.env.PATIENT_ID;

async function main() {
    if (!PATIENT_ID) {
        console.error('❌ Set PATIENT_ID env var, e.g. PATIENT_ID="GMCH-2026-00002" npx tsx scripts/find-patient.ts');
        process.exit(1);
    }

    console.log(`Looking up patient_id = "${PATIENT_ID}" across ALL organizations...\n`);

    const exact = await prisma.oPD_REG.findFirst({
        where: { patient_id: PATIENT_ID },
        select: { patient_id: true, full_name: true, organizationId: true, created_at: true },
    });

    if (exact) {
        const org = await prisma.organization.findUnique({
            where: { id: exact.organizationId },
            select: { id: true, name: true, code: true },
        });
        console.log('✓ FOUND (exact match):');
        console.log(`   name:            ${exact.full_name}`);
        console.log(`   created_at:      ${exact.created_at.toISOString()}`);
        console.log(`   organizationId:  ${exact.organizationId}`);
        console.log(`   organization:    ${org?.name} (code=${org?.code})`);
        console.log('\nIf the browser session used to view /billing/patient/... is logged into a');
        console.log('DIFFERENT organization than the one above, that is why the page says');
        console.log('"Patient not found" — the lookup is scoped to the logged-in user\'s org.');
    } else {
        console.log('❌ NOT FOUND with that exact patient_id anywhere on the server.\n');
        console.log('Checking for near-matches (case-insensitive / partial)...\n');
        const near = await prisma.oPD_REG.findMany({
            where: { patient_id: { contains: PATIENT_ID.replace(/[^A-Za-z0-9-]/g, ''), mode: 'insensitive' } },
            select: { patient_id: true, full_name: true, organizationId: true, created_at: true },
            take: 10,
            orderBy: { created_at: 'desc' },
        });
        if (near.length) {
            console.log(`Found ${near.length} near-match(es):`);
            for (const p of near) {
                console.log(`   ${p.patient_id}  —  ${p.full_name}  —  org=${p.organizationId}  —  ${p.created_at.toISOString()}`);
            }
        } else {
            console.log('No near-matches either. The registration likely did not save — check for an error toast when it was created.');
        }
    }

    console.log('\n────────────────────────────────────────');
    console.log('All organizations on this server:');
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true, code: true } });
    for (const o of orgs) {
        console.log(`   ${o.code.padEnd(8)} ${o.name.padEnd(30)} id=${o.id}`);
    }
}

main()
    .catch((e) => {
        console.error('❌', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
