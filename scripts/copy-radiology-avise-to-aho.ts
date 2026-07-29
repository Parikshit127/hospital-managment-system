/**
 * Copy Avise's radiology/imaging master into Axten HO — the one catalog table
 * missed by the earlier copies.
 *
 * Integer-PK, organization-scoped, no dependencies: a single INSERT ... SELECT.
 * procedure_code gets an AHO- prefix for consistency with the other catalogs;
 * hsn_sac_code is left untouched (a government HSN/SAC tax code, valid across orgs).
 * Aborts if AHO already has rows.
 *
 * Usage:
 *   DATABASE_URL="<url>" npx tsx scripts/copy-radiology-avise-to-aho.ts          # dry run
 *   DATABASE_URL="<url>" npx tsx scripts/copy-radiology-avise-to-aho.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const AVS = '0425857b-6293-4d91-86b2-bd049de66252';
const AHO = '9bd49bae-cecc-49f8-b18d-88f146124a98';
const TABLE = 'radiology_imaging';

async function main() {
    console.log(`Copy Avise ${TABLE} -> Axten HO`);
    console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

    const [avs]: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int c FROM "${TABLE}" WHERE "organizationId"=$1`, AVS);
    const [aho]: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int c FROM "${TABLE}" WHERE "organizationId"=$1`, AHO);
    console.log(`   Avise rows : ${avs.c}`);
    console.log(`   AHO rows   : ${aho.c}`);
    if (aho.c > 0) throw new Error(`ABORT: AHO already has ${aho.c} ${TABLE} rows — refusing to double-copy.`);

    if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return; }

    const colRows: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, TABLE,
    );
    const cols = colRows.map((r) => r.column_name).filter((c) => c !== 'id');
    const insertList = cols.map((c) => `"${c}"`).join(', ');
    const selectList = cols
        .map((c) =>
            c === 'organizationId' ? `'${AHO}'`
            : c === 'procedure_code' ? `'AHO-' || "procedure_code"`
            : `"${c}"`)
        .join(', ');

    const n = await prisma.$executeRawUnsafe(
        `INSERT INTO "${TABLE}" (${insertList}) SELECT ${selectList} FROM "${TABLE}" WHERE "organizationId"=$1`,
        AVS,
    );
    console.log(`\nCopied ${n} rows into Axten HO.`);
}

main().catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
