/**
 * Registry coverage check (docs/COMPANY_OS_PLAN.md §11 "Registry coverage"). Read-only.
 *
 *  1. every top-level route tree under app/ that has a page.tsx belongs to a module
 *     (or is a known non-staff realm/public tree)
 *  2. route prefixes are unique across modules
 *  3. every actionsFiles entry exists in app/actions, and no file is claimed by two modules
 *  4. every legacy permission string used in code (`'ipd.view'` …) is declared by a module
 *  5. roles named in gates / defaultRoles exist in SYSTEM_ROLES
 *  6. dependsOn points at real modules and has no cycles
 *  7. every `module.resource.action` key passed to requireAccess / guarded / requireHr / denyUnlessPharmacyRole /
 *     the pharmacy tier map exists in the registry catalogue (a typo would silently deny)
 *
 * Informational (never fails): action files owned by no module, and modules with no gate.
 *
 *   npm run check:registry
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MODULES, NON_STAFF_ROUTE_PREFIXES, LEGACY_PERMISSION_KEYS } from '../app/lib/modules/registry';
import { ALL_PERMISSION_KEYS } from '../app/lib/access/permissions';
import { SYSTEM_ROLE_SLUGS } from '../app/lib/access/system-roles';

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const errors: string[] = [];
const err = (m: string) => errors.push(m);

// 1 ── route trees
const moduleByPrefix = new Map<string, string>();
for (const m of MODULES) {
    for (const p of m.routePrefixes) {
        if (moduleByPrefix.has(p)) err(`DUPLICATE PREFIX ${p} claimed by ${moduleByPrefix.get(p)} and ${m.key}`); // 2
        moduleByPrefix.set(p, m.key);
    }
}
function hasPage(dir: string): boolean {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name === 'page.tsx') return true;
        if (e.isDirectory() && hasPage(p)) return true;
    }
    return false;
}
const SKIP_DIRS = new Set(['actions', 'api', 'components', 'lib', 'types']);
for (const e of fs.readdirSync(APP, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('(') || e.name.startsWith('_')) continue;
    if (!hasPage(path.join(APP, e.name))) continue;
    const prefix = '/' + e.name;
    if (!moduleByPrefix.has(prefix) && !NON_STAFF_ROUTE_PREFIXES.includes(prefix)) {
        err(`UNMAPPED ROUTE TREE ${prefix} (has page.tsx) — add it to a module's routePrefixes or NON_STAFF_ROUTE_PREFIXES`);
    }
}

// 3 ── action files
const actionFiles = new Set(
    fs.readdirSync(path.join(APP, 'actions')).filter((n) => /\.tsx?$/.test(n)).map((n) => n.replace(/\.tsx?$/, '')),
);
const owner = new Map<string, string>();
for (const m of MODULES) {
    for (const a of m.actionsFiles) {
        if (!actionFiles.has(a)) err(`MISSING ACTION FILE ${m.key} lists "${a}" but app/actions/${a}.ts does not exist`);
        if (owner.has(a)) err(`ACTION FILE CLAIMED TWICE "${a}" by ${owner.get(a)} and ${m.key}`);
        owner.set(a, m.key);
    }
}

// 4 ── permission strings in code
const known = new Set(LEGACY_PERMISSION_KEYS);
const PERM_RE = /['"`]((?:opd|ipd|lab|pharmacy|finance|insurance|hr|admin|reports|ot|er|billing)\.(?:view|create|edit|delete|approve|export))['"`]/g;
function walk(dir: string, out: string[]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
}
const files: string[] = [path.join(ROOT, 'proxy.ts')];
walk(APP, files);
const SELF = new Set(['app/lib/access/system-roles.ts', 'app/lib/modules/registry.ts', 'app/lib/session.ts', 'app/actions/role-actions.ts', 'proxy.ts']);
for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (SELF.has(rel)) continue; // the maps themselves are covered by check:parity
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(PERM_RE)) {
        if (!known.has(m[1])) err(`UNKNOWN PERMISSION "${m[1]}" used in ${rel} — not declared by any module`);
    }
}
for (const m of MODULES) for (const g of m.legacyGates ?? []) {
    if (!known.has(g.permission)) err(`GATE PERMISSION ${g.permission} (${g.prefix}) not declared by any module`);
}

// 5 ── roles
const roleOk = new Set([...SYSTEM_ROLE_SLUGS]);
for (const m of MODULES) {
    for (const r of m.defaultRoles) if (!roleOk.has(r)) err(`UNKNOWN ROLE "${r}" in ${m.key}.defaultRoles`);
    for (const g of m.legacyGates ?? []) for (const r of g.roles) if (!roleOk.has(r)) err(`UNKNOWN ROLE "${r}" in gate ${g.prefix}`);
}

// 6 ── dependencies
const keys = new Set(MODULES.map((m) => m.key));
if (keys.size !== MODULES.length) err('DUPLICATE MODULE KEY');
for (const m of MODULES) for (const d of m.dependsOn) if (!keys.has(d)) err(`UNKNOWN DEPENDENCY ${m.key} → ${d}`);
const state = new Map<string, 1 | 2>();
function dfs(k: string, trail: string[]) {
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) { err(`DEPENDENCY CYCLE ${[...trail, k].join(' → ')}`); return; }
    state.set(k, 1);
    for (const d of MODULES.find((m) => m.key === k)?.dependsOn ?? []) dfs(d, [...trail, k]);
    state.set(k, 2);
}
for (const k of keys) dfs(k, []);

// 7 ── catalogue keys used in code
const CATALOGUE = new Set(ALL_PERMISSION_KEYS);
const usedCatalogue = new Set<string>();
const CALL_PATTERNS: { re: RegExp; keys: (m: RegExpMatchArray) => string[] }[] = [
    { re: /requireAccess\(\s*['"`]([^'"`$]+)['"`]/g, keys: (m) => [m[1]] },
    { re: /\brun\(\s*['"`]([^'"`$]+)['"`]/g, keys: (m) => [m[1]] },
    { re: /\bguarded\(\s*['"`]([^'"`$]+)['"`]/g, keys: (m) => [m[1]] },
    { re: /denyUnlessPharmacyRole\([^)]*,\s*['"`]([^'"`$]+)['"`]\s*\)/g, keys: (m) => [m[1]] },
    { re: /\[PHARMACY_[A-Z_]+,\s*['"`]([^'"`$]+)['"`]\]/g, keys: (m) => [m[1]] },
    { re: /requireHr\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)/g, keys: (m) => [`hr.${m[2]}.${m[1]}`] },
];
for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel === 'app/lib/modules/registry.ts') continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const { re, keys } of CALL_PATTERNS) {
        for (const m of src.matchAll(re)) for (const k of keys(m)) {
            if (/^[a-z_]+\.[a-z_]+\.[a-z_]+$/.test(k)) {
                usedCatalogue.add(k);
                if (!CATALOGUE.has(k)) err(`UNKNOWN CATALOGUE PERMISSION "${k}" used in ${rel} — not declared in the registry`);
            }
        }
    }
}
const unusedCatalogue = ALL_PERMISSION_KEYS.filter((k) => !usedCatalogue.has(k) && !k.startsWith('ess.'));

// info
const unowned = [...actionFiles].filter((a) => !owner.has(a)).sort();
console.log(`Registry: ${MODULES.length} modules · ${moduleByPrefix.size} route prefixes · ${LEGACY_PERMISSION_KEYS.length} legacy permission keys`);
console.log(`Info: ${unowned.length}/${actionFiles.size} action files are not yet assigned to a module: ${unowned.join(', ') || '—'}`);
console.log(`Info: ${usedCatalogue.size}/${ALL_PERMISSION_KEYS.length} catalogue permissions are enforced by code today; not yet used: ${unusedCatalogue.join(', ') || '—'}`);
console.log(`Info: modules with no proxy gate: ${MODULES.filter((m) => !m.legacyGates?.length).map((m) => m.key).join(', ')}`);

if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('Registry coverage OK.');
