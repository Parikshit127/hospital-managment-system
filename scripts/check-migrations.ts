/**
 * Migration lint (docs/COMPANY_OS_PLAN.md §0 rule 3 / §11). Read-only.
 *
 *  - every folder in prisma/migrations is `<14-digit timestamp>_<name>` and holds a non-empty,
 *    hand-reviewable migration.sql (no empty/placeholder migrations)
 *  - timestamps are unique
 *  - no deploy/CI/automation file runs `prisma migrate dev` (the shared dev DB has drift;
 *    `migrate dev` would try to reset it). Developer-only npm scripts are exempt.
 *  - destructive statements (DROP TABLE / DROP COLUMN / TRUNCATE) must carry an explicit
 *    `-- ALLOW-DESTRUCTIVE: <reason>` comment on the line above, so they can't slip into a
 *    live-system migration unnoticed.
 *
 *   npm run check:migrations
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const MIG = path.join(ROOT, 'prisma', 'migrations');
const problems: string[] = [];

// Pre-existing anomalies in migrations that are ALREADY APPLIED. They must not be renamed or
// edited (Prisma matches applied migrations by folder name), so they are grandfathered here.
// New migrations get no such pass.
const LEGACY_BAD_NAME = new Set(['20260308_production_hardening_invoice_items']);
const LEGACY_DUP_TS = new Set(['20260617000000', '20260619000000', '20260622120000', '20260703000000']);
const LEGACY_EMPTY = new Set(['20260709000000_sync_schema_changes']);

const dirs = fs.readdirSync(MIG, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const seen = new Set<string>();
for (const d of dirs) {
    const m = /^(\d{14})_([a-z0-9_]+)$/i.exec(d);
    if (!m) { if (!LEGACY_BAD_NAME.has(d)) problems.push(`BAD NAME prisma/migrations/${d} — expected <YYYYMMDDHHMMSS>_<name>`); continue; }
    if (seen.has(m[1]) && !LEGACY_DUP_TS.has(m[1])) problems.push(`DUPLICATE TIMESTAMP ${m[1]} (${d})`);
    seen.add(m[1]);
    const sqlPath = path.join(MIG, d, 'migration.sql');
    if (!fs.existsSync(sqlPath)) { problems.push(`MISSING migration.sql in ${d}`); continue; }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    if (!sql.replace(/--.*$/gm, '').trim() && !LEGACY_EMPTY.has(d)) problems.push(`EMPTY migration.sql in ${d}`);
    // Only enforce the destructive-statement rule on migrations written after this lint existed.
    if (m[1] >= '20261021000000') {
        const lines = sql.split('\n');
        lines.forEach((line, i) => {
            if (/^\s*(DROP\s+TABLE|DROP\s+COLUMN|ALTER\s+TABLE\s+.*\s+DROP\s+COLUMN|TRUNCATE)\b/i.test(line)) {
                const prev = (lines[i - 1] ?? '').trim();
                if (!/^--\s*ALLOW-DESTRUCTIVE:\s*\S+/.test(prev)) {
                    problems.push(`DESTRUCTIVE SQL without "-- ALLOW-DESTRUCTIVE: <reason>" in ${d}:${i + 1}  → ${line.trim().slice(0, 80)}`);
                }
            }
        });
    }
}

// `migrate dev` must never run in automation.
const targets: string[] = [];
const addDir = (dir: string, re: RegExp) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) addDir(p, re);
        else if (re.test(e.name)) targets.push(p);
    }
};
addDir(path.join(ROOT, '.github'), /\.ya?ml$/);
addDir(path.join(ROOT, 'scripts'), /\.(sh|bash)$/);
addDir(path.join(ROOT, 'aws'), /\.(sh|ya?ml|json)$/);
addDir(path.join(ROOT, 'azure'), /\.(sh|ya?ml|json)$/);
for (const f of ['Dockerfile', 'docker-compose.yml', 'ecosystem.config.js', 'vercel.json']) {
    if (fs.existsSync(path.join(ROOT, f))) targets.push(path.join(ROOT, f));
}
for (const t of targets) {
    const src = fs.readFileSync(t, 'utf8');
    if (/prisma\s+migrate\s+dev\b/.test(src)) problems.push(`MIGRATE DEV in ${path.relative(ROOT, t)} — use \`prisma migrate deploy\``);
}

console.log(`Migrations: ${dirs.length} folders checked, ${targets.length} automation files scanned`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('Migration lint OK.');
