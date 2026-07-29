/**
 * Copy Avise's BILLING CATALOG into Axten HO (AHO) — the tables skipped in the
 * first master-data copy: ipd_service_master, charge_catalog, ipd_packages.
 *
 * These carry codes (service_code, item_code) that are unique across the WHOLE
 * database, so AHO's copies get an AHO- prefix — same item, distinct code.
 * package_code is prefixed too for consistency.
 *
 * All three are integer-PK, organization-scoped tables, so the copy is a single
 * INSERT ... SELECT per table (DB-to-DB — jsonb columns like inclusions/exclusions
 * pass through untouched, no serialization round-trip). id is omitted so the
 * sequence assigns fresh ones. ipd_packages.exclusive_provider_id points at Avise's
 * insurance providers and is set NULL to avoid a cross-tenant reference (no Avise
 * package actually uses it, so nothing is lost).
 *
 * Safe-by-design: aborts if AHO already has any of these rows; runs in one
 * transaction; Avise rows are only read.
 *
 * Usage:
 *   DATABASE_URL="<url>" npx tsx scripts/copy-billing-catalog-avise-to-aho.ts          # dry run
 *   DATABASE_URL="<url>" npx tsx scripts/copy-billing-catalog-avise-to-aho.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const AVS = '0425857b-6293-4d91-86b2-bd049de66252';
const AHO = '9bd49bae-cecc-49f8-b18d-88f146124a98';

// Per-table SELECT overrides: column -> SQL expression used in place of the raw value.
const OVERRIDES: Record<string, Record<string, string>> = {
    ipd_service_master: { organizationId: `'${AHO}'`, service_code: `'AHO-' || "service_code"` },
    charge_catalog: { organizationId: `'${AHO}'`, item_code: `'AHO-' || "item_code"` },
    ipd_packages: {
        organizationId: `'${AHO}'`,
        package_code: `'AHO-' || "package_code"`,
        exclusive_provider_id: `NULL`,
    },
};

async function cols(tx: any, table: string): Promise<string[]> {
    const rows: Array<{ column_name: string }> = await tx.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
        table,
    );
    return rows.map((r) => r.column_name).filter((c) => c !== 'id'); // sequence reassigns id
}

async function countBy(tx: any, table: string, org: string): Promise<number> {
    const r: any[] = await tx.$queryRawUnsafe(`SELECT count(*)::int c FROM "${table}" WHERE "organizationId"=$1`, org);
    return r[0].c;
}

async function main() {
    console.log('Copy Avise billing catalog -> Axten HO');
    console.log(`Mode: ${APPLY ? 'APPLY (writing, in a transaction)' : 'DRY RUN (no writes)'}\n`);

    const tables = Object.keys(OVERRIDES);
    const report: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
        // Guard — refuse to run if AHO already has any of these.
        for (const t of tables) {
            const existing = await countBy(tx, t, AHO);
            if (existing > 0) throw new Error(`ABORT: ${t} already has ${existing} rows for AHO — refusing to double-copy.`);
        }

        for (const t of tables) {
            report[t] = await countBy(tx, t, AVS);
            if (!APPLY || report[t] === 0) continue;
            const c = await cols(tx, t);
            const insertList = c.map((x) => `"${x}"`).join(', ');
            const selectList = c.map((x) => OVERRIDES[t][x] ?? `"${x}"`).join(', ');
            await tx.$executeRawUnsafe(
                `INSERT INTO "${t}" (${insertList}) SELECT ${selectList} FROM "${t}" WHERE "organizationId"=$1`,
                AVS,
            );
        }

        if (!APPLY) throw new Error('__DRY_RUN__'); // roll back the guard reads
    }).catch((e) => { if (e.message !== '__DRY_RUN__') throw e; });

    let total = 0;
    for (const [t, n] of Object.entries(report)) { console.log(`   ${t.padEnd(22)} ${String(n).padStart(6)}`); total += n; }
    console.log(`   ${'TOTAL'.padEnd(22)} ${String(total).padStart(6)}`);
    console.log(APPLY ? '\nDone — billing catalog copied into Axten HO.' : '\nDry run — nothing written. Re-run with --apply.');
}

main().catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
