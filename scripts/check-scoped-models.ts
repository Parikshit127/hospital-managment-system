/**
 * Tenant-scoping coverage check (COMPANY_OS_PLAN.md §11 "Scoped-model check").
 *
 * getTenantPrisma() (backend/db.ts) injects organizationId only for models listed in
 * TENANT_SCOPED_MODELS / NULLABLE_ORG_MODELS. A model that has an organizationId column
 * but is missing from those sets is silently NOT scoped (this already leaked
 * PharmacyInventoryMovement once).
 *
 * This script diffs prisma/schema.prisma against those sets. It is read-only: it never
 * edits backend/db.ts, because registering a model there changes live query behaviour
 * (including `create`, which would start overwriting organizationId) and must be reviewed
 * per model.
 *
 * The currently-unscoped models are frozen in scripts/scoped-models-baseline.json; the
 * check fails only when a NEW model with organizationId appears unscoped, or when a
 * baseline model becomes scoped (stale entry → remove it).
 *
 *   npm run check:scoped-models              verify (CI)
 *   npm run check:scoped-models -- --report  print the full diff
 *   npm run check:scoped-models -- --update  rewrite the baseline
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const DB_TS = path.join(ROOT, 'backend', 'db.ts');
const BASELINE = path.join(__dirname, 'scoped-models-baseline.json');

function schemaModelsWithOrg(): Map<string, string> {
    // model name -> column used ('organizationId' | 'organization_id')
    const out = new Map<string, string>();
    let current: string | null = null;
    for (const line of fs.readFileSync(SCHEMA, 'utf8').split('\n')) {
        const m = /^model\s+(\w+)\s*\{/.exec(line);
        if (m) { current = m[1]; continue; }
        if (/^\}/.test(line)) { current = null; continue; }
        if (!current) continue;
        const f = /^\s+(organizationId|organization_id)\s+String\??/.exec(line);
        if (f) out.set(current, f[1]);
    }
    return out;
}

function setLiterals(src: string, name: string): Set<string> {
    const start = src.indexOf(`const ${name} = new Set([`);
    if (start < 0) throw new Error(`Cannot find ${name} in backend/db.ts`);
    const end = src.indexOf(']);', start);
    const body = src.slice(start, end);
    const names = new Set<string>();
    for (const m of body.matchAll(/'([A-Za-z0-9_]+)'/g)) names.add(m[1]);
    return names;
}

const mode = process.argv.includes('--update') ? 'update' : process.argv.includes('--report') ? 'report' : 'check';

const schema = schemaModelsWithOrg();
const dbSrc = fs.readFileSync(DB_TS, 'utf8');
const scoped = new Set([...setLiterals(dbSrc, 'TENANT_SCOPED_MODELS'), ...setLiterals(dbSrc, 'NULLABLE_ORG_MODELS')]);

const unscoped = [...schema.keys()].filter((m) => !scoped.has(m)).sort();
const stale = [...scoped].filter((m) => !schema.has(m)).sort(); // listed but no organizationId column in schema

if (mode === 'report') {
    console.log(`Models with an organization column: ${schema.size}`);
    console.log(`Registered as tenant-scoped:        ${[...schema.keys()].filter((m) => scoped.has(m)).length}`);
    console.log(`\nUNSCOPED (have organizationId, not registered): ${unscoped.length}`);
    for (const m of unscoped) console.log(`  ${m}  [${schema.get(m)}]`);
    console.log(`\nREGISTERED BUT NO organizationId COLUMN IN SCHEMA (harmless/stale): ${stale.length}`);
    for (const m of stale) console.log(`  ${m}`);
    process.exit(0);
}

if (mode === 'update') {
    fs.writeFileSync(BASELINE, JSON.stringify({ unscoped }, null, 2) + '\n');
    console.log(`Wrote scripts/scoped-models-baseline.json (${unscoped.length} unscoped models)`);
    process.exit(0);
}

let base: string[] = [];
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).unscoped ?? []; }
catch { console.error('Missing scripts/scoped-models-baseline.json — run: npm run check:scoped-models -- --update'); process.exit(1); }

const baseSet = new Set(base);
const problems: string[] = [];
for (const m of unscoped) if (!baseSet.has(m)) problems.push(`NEW UNSCOPED MODEL ${m} has ${schema.get(m)} but is not in TENANT_SCOPED_MODELS (backend/db.ts)`);
for (const m of base) if (!unscoped.includes(m)) problems.push(`STALE BASELINE ${m} is now scoped or gone — run: npm run check:scoped-models -- --update`);

console.log(`Scoped-model check: ${schema.size} models with org column, ${unscoped.length} unscoped (baseline ${base.length})`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
