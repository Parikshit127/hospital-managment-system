/**
 * Copy selected MASTER DATA from Avise into Axten HO (AHO).
 *
 * Scope (confirmed): pharmacy medicine master, lab test master, and structure/config
 * (departments, wards, beds, expense & asset categories, document templates,
 * corporate masters). NOT the billing catalog, NOT the doctor master.
 *
 * Safe-by-design:
 *   - Every target table is verified EMPTY for AHO first; the script aborts if any
 *     already has rows, so it can never double-insert.
 *   - Runs inside one transaction — all or nothing.
 *   - GL-account links on expense/asset categories are set NULL (they point at
 *     Avise's ledger; carrying them over would be a cross-tenant leak).
 *   - Small config codes get an AHO- prefix so they stay distinguishable.
 *   - Autoincrement ids are reassigned by the sequence; text ids get fresh uuids,
 *     and the departments->wards->beds foreign keys are remapped to the new ids.
 *
 * Usage:
 *   DATABASE_URL="<url>" npx tsx scripts/copy-master-avise-to-aho.ts            # dry run
 *   DATABASE_URL="<url>" npx tsx scripts/copy-master-avise-to-aho.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const AVS = '0425857b-6293-4d91-86b2-bd049de66252';
const AHO = '9bd49bae-cecc-49f8-b18d-88f146124a98';

// Bulk tables with an integer PK and only organizationId as a foreign key —
// a plain INSERT ... SELECT with the org overridden. id omitted → sequence assigns.
const BULK = ['pharmacy_medicine_master', 'lab_test_inventory'];

async function colsExcept(tx: any, table: string, exclude: string[]): Promise<string[]> {
    const rows: Array<{ column_name: string }> = await tx.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
        table,
    );
    return rows.map((r) => r.column_name).filter((c) => !exclude.includes(c));
}

async function countAvs(tx: any, table: string): Promise<number> {
    const r: any[] = await tx.$queryRawUnsafe(`SELECT count(*)::int c FROM "${table}" WHERE "organizationId"=$1`, AVS);
    return r[0].c;
}
async function countAho(tx: any, table: string): Promise<number> {
    const r: any[] = await tx.$queryRawUnsafe(`SELECT count(*)::int c FROM "${table}" WHERE "organizationId"=$1`, AHO);
    return r[0].c;
}

async function run(tx: any) {
    const report: Record<string, number> = {};

    // ── Guard: AHO must be empty on every table we touch ──────────────────────
    const ALL = [...BULK, 'departments', 'wards', 'beds', 'expense_categories', 'asset_categories', 'document_templates', 'corporate_masters'];
    for (const t of ALL) {
        const existing = await countAho(tx, t);
        if (existing > 0) throw new Error(`ABORT: ${t} already has ${existing} rows for AHO — refusing to double-copy.`);
    }

    // ── Bulk tables (int PK, org-only FK): INSERT ... SELECT ──────────────────
    for (const t of BULK) {
        const n = await countAvs(tx, t);
        report[t] = n;
        if (!APPLY || n === 0) continue;
        const cols = await colsExcept(tx, t, ['id']);
        const list = cols.map((c) => `"${c}"`).join(', ');
        const sel = cols.map((c) => (c === 'organizationId' ? `$1 AS "${c}"` : `"${c}"`)).join(', ');
        await tx.$executeRawUnsafe(
            `INSERT INTO "${t}" (${list}) SELECT ${sel} FROM "${t}" WHERE "organizationId"=$2`,
            AHO, AVS,
        );
    }

    // ── departments (text PK) → new uuid ids, keep an old→new map ─────────────
    const deptMap = new Map<string, string>();
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM departments WHERE "organizationId"=$1`, AVS);
        report['departments'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                const newId = randomUUID();
                deptMap.set(r.id, newId);
                await tx.department.create({
                    data: {
                        id: newId, organizationId: AHO,
                        name: r.name, slug: `${r.slug}-aho`,
                        base_consultation_fee: r.base_consultation_fee, is_active: r.is_active,
                    },
                });
            }
        }
    }

    // ── wards (int PK, FK department_id) → remap department_id ─────────────────
    const wardMap = new Map<number, number>();
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM wards WHERE "organizationId"=$1`, AVS);
        report['wards'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                const created: any = await tx.$queryRawUnsafe(
                    `INSERT INTO wards (ward_name, ward_type, is_active, "organizationId", department_id)
                     VALUES ($1,$2,$3,$4,$5) RETURNING ward_id`,
                    r.ward_name, r.ward_type, r.is_active, AHO,
                    r.department_id != null ? deptMap.get(r.department_id) ?? null : null,
                );
                wardMap.set(r.ward_id, created[0].ward_id);
            }
        }
    }

    // ── beds (text PK, FK ward_id) → new uuid, remap ward_id ───────────────────
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM beds WHERE "organizationId"=$1`, AVS);
        report['beds'] = rows.length;
        if (APPLY) {
            const cols = await colsExcept(tx, 'beds', []);
            for (const r of rows) {
                const data: Record<string, any> = {};
                for (const c of cols) data[c] = r[c];
                data.bed_id = randomUUID();
                data.organizationId = AHO;
                if (r.ward_id != null) data.ward_id = wardMap.get(r.ward_id) ?? null;
                const keys = Object.keys(data);
                const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
                await tx.$executeRawUnsafe(
                    `INSERT INTO beds (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${ph})`,
                    ...keys.map((k) => data[k]),
                );
            }
        }
    }

    // ── expense_categories (int PK): null GL + parent, prefix code ─────────────
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM expense_categories WHERE "organizationId"=$1`, AVS);
        report['expense_categories'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                await tx.$executeRawUnsafe(
                    `INSERT INTO expense_categories (name, code, is_active, "organizationId", gl_expense_account_id, parent_id)
                     VALUES ($1,$2,$3,$4,NULL,NULL)`,
                    r.name, `AHO-${r.code}`, r.is_active, AHO,
                );
            }
        }
    }

    // ── asset_categories (text PK): null 3 GL FKs, prefix code ─────────────────
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM asset_categories WHERE "organizationId"=$1`, AVS);
        report['asset_categories'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                await tx.$executeRawUnsafe(
                    `INSERT INTO asset_categories
                       (id, "organizationId", category_name, category_code, asset_type, depreciation_method,
                        depreciation_rate, is_active, created_at, updated_at,
                        gl_asset_account_id, gl_depreciation_account_id, gl_expense_account_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),NULL,NULL,NULL)`,
                    randomUUID(), AHO, r.category_name, `AHO-${r.category_code}`, r.asset_type,
                    r.depreciation_method, r.depreciation_rate, r.is_active,
                );
            }
        }
    }

    // ── document_templates (text PK): straight copy, new uuid ──────────────────
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM document_templates WHERE "organizationId"=$1`, AVS);
        report['document_templates'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                await tx.$executeRawUnsafe(
                    // $5::jsonb with a stringified value — Prisma otherwise coerces a JS
                    // array into a Postgres array and the jsonb insert fails.
                    `INSERT INTO document_templates (id, "organizationId", type, name, content_json, is_default, is_active, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,now(),now())`,
                    randomUUID(), AHO, r.type, r.name, JSON.stringify(r.content_json ?? {}), r.is_default, r.is_active,
                );
            }
        }
    }

    // ── corporate_masters (text PK): prefix company_code, new uuid ─────────────
    {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT * FROM corporate_masters WHERE "organizationId"=$1`, AVS);
        report['corporate_masters'] = rows.length;
        if (APPLY) {
            for (const r of rows) {
                await tx.$executeRawUnsafe(
                    // $10::jsonb with a stringified value — see document_templates above.
                    `INSERT INTO corporate_masters
                       (id, "organizationId", company_name, company_code, credit_limit, current_balance,
                        discount_percentage, payment_terms_days, is_active, covered_services, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now(),now())`,
                    randomUUID(), AHO, r.company_name, `AHO-${r.company_code}`, r.credit_limit, r.current_balance,
                    r.discount_percentage, r.payment_terms_days, r.is_active, JSON.stringify(r.covered_services ?? []),
                );
            }
        }
    }

    return report;
}

async function main() {
    console.log(`Copy Avise master data -> Axten HO`);
    console.log(`Mode: ${APPLY ? 'APPLY (writing, in a transaction)' : 'DRY RUN (no writes)'}\n`);

    const report = await prisma.$transaction(async (tx) => {
        const r = await run(tx);
        if (!APPLY) throw new Error('__DRY_RUN__'); // roll back the guard reads
        return r;
    }).catch((e) => {
        if (e.message === '__DRY_RUN__') return null;
        throw e;
    });

    // Dry run: re-read counts outside the aborted tx for the report.
    const final = report ?? await (async () => {
        const out: Record<string, number> = {};
        for (const t of [...BULK, 'departments', 'wards', 'beds', 'expense_categories', 'asset_categories', 'document_templates', 'corporate_masters']) {
            out[t] = await countAvs(prisma, t);
        }
        return out;
    })();

    let total = 0;
    for (const [t, n] of Object.entries(final)) { console.log(`   ${t.padEnd(28)} ${String(n).padStart(6)}`); total += n; }
    console.log(`   ${'TOTAL'.padEnd(28)} ${String(total).padStart(6)}`);
    console.log(APPLY ? '\nDone — copied into Axten HO.' : '\nDry run — nothing written. Re-run with --apply.');
}

main().catch((e) => { console.error('ERR', e instanceof Error ? e.message : e); process.exit(1); })
    .finally(() => prisma.$disconnect());
