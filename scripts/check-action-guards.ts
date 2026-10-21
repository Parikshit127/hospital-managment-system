/**
 * Server-action guard coverage check (COMPANY_OS_PLAN.md §11, Prompt A).
 *
 * Server actions are addressable by action id and can be POSTed from any page,
 * so the proxy.ts route gate does not protect them. This script classifies every
 * exported async function in a 'use server' file under app/actions/:
 *
 *   STRONG  calls a real authorization guard (role allow-list, permission check,
 *           super-admin / dev-admin, pharmacy-access, requireAccess/requireSelf, or
 *           a local wrapper that does one of those, or inlines a session.role check)
 *   WEAK    only proves "somebody is logged in": requireTenantContext() (which also
 *           accepts a PATIENT session), requireAnyTenantContext(), or getSession()
 *           with no role comparison
 *   NONE    no session helper at all
 *
 * The WEAK + NONE set is frozen in scripts/guard-violations.json. The check fails when
 *   (a) a violation appears that is not in that file (new unguarded action), or
 *   (b) a listed function is now STRONG / no longer exists (stale baseline — remove it),
 * so the list can only shrink.
 *
 * Usage:
 *   npm run check:guards              verify (CI)
 *   npm run check:guards -- --report  print the full table, NONE first
 *   npm run check:guards -- --update  rewrite scripts/guard-violations.json (use after fixing)
 *
 * Read-only with respect to application code.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

type Level = 'STRONG' | 'WEAK' | 'NONE';

const ROOT = path.resolve(__dirname, '..');
const ACTIONS_DIR = path.join(ROOT, 'app', 'actions');
const BASELINE = path.join(__dirname, 'guard-violations.json');
const ALLOWLIST = path.join(__dirname, 'guard-allowlist.json');

/** Calls that constitute a real authorization decision. */
const STRONG_NAMES = new Set<string>([
    'requireRoleAndTenant',
    'requireSuperAdmin',
    'requireDevAdmin',
    'requireDeveloper',
    'requireDevPortalContext',
    'hasPermission',
    'hasAnyPermission',
    'hasAllPermissions',
    'denyUnlessPharmacyRole',
    'requireAccess',
    'requireSelf',
    'requireLegacyRouteAccess', // app/lib/access/legacy-guard.ts: same decision proxy.ts makes for the route
]);

/** Calls that only establish "someone is logged in". */
const WEAK_NAMES = new Set<string>([
    'requireTenantContext',
    'requireAnyTenantContext',
    'requireStaffContext', // staff-only (no patient fallback) but still no role/permission decision
    'getTenantDb',
    'getSession',
    'getPatientSession',
    'getDevPortalSession',
    'getSuperAdminSession',
]);

function loadAllowlist(): Set<string> {
    try {
        const raw = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')) as { guardNames?: string[] };
        return new Set(raw.guardNames ?? []);
    } catch {
        return new Set();
    }
}

function listActionFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listActionFiles(p));
        else if (/\.tsx?$/.test(entry.name)) out.push(p);
    }
    return out.sort();
}

function hasUseServer(sf: ts.SourceFile): boolean {
    for (const stmt of sf.statements) {
        if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
            if (stmt.expression.text === 'use server') return true;
        } else break; // directives only appear at the top
    }
    return false;
}

function isExported(node: ts.Node): boolean {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function isAsync(node: ts.Node): boolean {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!mods?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

interface FnInfo {
    name: string;
    exported: boolean;
    body: ts.Node;
}

/** Collect top-level function declarations and `const x = async () => {}` bindings. */
function collectFunctions(sf: ts.SourceFile): FnInfo[] {
    const fns: FnInfo[] = [];
    for (const stmt of sf.statements) {
        if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
            if (!isAsync(stmt) && !isExported(stmt)) {
                // sync local helpers can still be guards
            }
            fns.push({ name: stmt.name.text, exported: isExported(stmt) && isAsync(stmt), body: stmt.body });
        } else if (ts.isVariableStatement(stmt)) {
            const exported = isExported(stmt);
            for (const d of stmt.declarationList.declarations) {
                if (
                    ts.isIdentifier(d.name) &&
                    d.initializer &&
                    (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
                ) {
                    fns.push({
                        name: d.name.text,
                        exported: exported && isAsync(d.initializer),
                        body: d.initializer.body,
                    });
                }
            }
        }
    }
    return fns;
}

interface Facts {
    calls: Set<string>;
    roleCheck: boolean; // inline comparison against a `.role` property
}

function gatherFacts(node: ts.Node): Facts {
    const calls = new Set<string>();
    let roleCheck = false;
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
            const e = n.expression;
            if (ts.isIdentifier(e)) calls.add(e.text);
            else if (ts.isPropertyAccessExpression(e)) calls.add(e.name.text);
        }
        if (ts.isPropertyAccessExpression(n) && n.name.text === 'role') {
            // `.role` read used in a comparison / includes() / switch counts as an inline role check
            const p = n.parent;
            if (
                (ts.isBinaryExpression(p) &&
                    [
                        ts.SyntaxKind.EqualsEqualsEqualsToken,
                        ts.SyntaxKind.ExclamationEqualsEqualsToken,
                        ts.SyntaxKind.EqualsEqualsToken,
                        ts.SyntaxKind.ExclamationEqualsToken,
                    ].includes(p.operatorToken.kind)) ||
                ts.isCallExpression(p) ||
                ts.isSwitchStatement(p) ||
                ts.isElementAccessExpression(p)
            ) {
                roleCheck = true;
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(node);
    return { calls, roleCheck };
}

function main() {
    const mode = process.argv.includes('--update')
        ? 'update'
        : process.argv.includes('--report')
          ? 'report'
          : 'check';
    const allow = loadAllowlist();
    const strongNames = new Set<string>([...STRONG_NAMES, ...allow]);

    const results: { file: string; fn: string; level: Level }[] = [];

    for (const file of listActionFiles(ACTIONS_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        if (!hasUseServer(sf)) continue; // not addressable as a server action

        const fns = collectFunctions(sf);
        const facts = new Map<string, Facts>();
        for (const f of fns) facts.set(f.name, gatherFacts(f.body));

        // Resolve local wrappers (requireStaff, requireHr, assertAdmin…) to a fixed point.
        const localStrong = new Set<string>();
        const localWeak = new Set<string>();
        let changed = true;
        while (changed) {
            changed = false;
            for (const f of fns) {
                const ft = facts.get(f.name)!;
                const callsStrong = [...ft.calls].some((c) => strongNames.has(c) || localStrong.has(c));
                const usesSession = [...ft.calls].some((c) => c === 'getSession');
                if (!localStrong.has(f.name) && (callsStrong || (usesSession && ft.roleCheck))) {
                    localStrong.add(f.name);
                    changed = true;
                }
                const callsWeak = [...ft.calls].some((c) => WEAK_NAMES.has(c) || localWeak.has(c));
                if (!localWeak.has(f.name) && callsWeak) {
                    localWeak.add(f.name);
                    changed = true;
                }
            }
        }

        for (const f of fns) {
            if (!f.exported) continue;
            const ft = facts.get(f.name)!;
            const calls = [...ft.calls];
            let level: Level;
            if (calls.some((c) => (strongNames.has(c) || localStrong.has(c)) && c !== f.name)) level = 'STRONG';
            else if (ft.roleCheck && calls.includes('getSession')) level = 'STRONG';
            else if (calls.some((c) => (WEAK_NAMES.has(c) || localWeak.has(c)) && c !== f.name)) level = 'WEAK';
            else level = 'NONE';
            results.push({ file: path.relative(ROOT, file), fn: f.name, level });
        }
    }

    const violations: Record<string, string[]> = {};
    for (const r of results) {
        if (r.level === 'STRONG') continue;
        (violations[r.file] ??= []).push(r.fn);
    }
    for (const k of Object.keys(violations)) violations[k].sort();
    const sorted = Object.fromEntries(Object.entries(violations).sort(([a], [b]) => a.localeCompare(b)));

    const counts = { STRONG: 0, WEAK: 0, NONE: 0 } as Record<Level, number>;
    for (const r of results) counts[r.level]++;

    if (mode === 'report') {
        const order: Record<Level, number> = { NONE: 0, WEAK: 1, STRONG: 2 };
        const rows = [...results].sort(
            (a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.fn.localeCompare(b.fn),
        );
        console.log('LEVEL\tFILE\tFUNCTION');
        for (const r of rows) console.log(`${r.level}\t${r.file}\t${r.fn}`);
        console.log(`\nTotals: STRONG=${counts.STRONG} WEAK=${counts.WEAK} NONE=${counts.NONE}`);
        return;
    }

    if (mode === 'update') {
        fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
        console.log(`Wrote ${path.relative(ROOT, BASELINE)}  (STRONG=${counts.STRONG} WEAK=${counts.WEAK} NONE=${counts.NONE})`);
        return;
    }

    let baseline: Record<string, string[]> = {};
    try {
        baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    } catch {
        console.error(`Missing ${path.relative(ROOT, BASELINE)} — run: npm run check:guards -- --update`);
        process.exit(1);
    }

    const problems: string[] = [];
    for (const [file, fns] of Object.entries(sorted)) {
        const known = new Set(baseline[file] ?? []);
        for (const fn of fns) {
            if (!known.has(fn)) problems.push(`NEW UNGUARDED  ${file} :: ${fn}  — add requireRoleAndTenant/requireAccess (or a pharmacy-access/hasPermission check)`);
        }
    }
    for (const [file, fns] of Object.entries(baseline)) {
        const current = new Set(sorted[file] ?? []);
        for (const fn of fns) {
            if (!current.has(fn)) problems.push(`STALE BASELINE ${file} :: ${fn}  — now guarded or removed; run: npm run check:guards -- --update`);
        }
    }

    console.log(`Server-action guards: STRONG=${counts.STRONG} WEAK=${counts.WEAK} NONE=${counts.NONE} (baseline allows ${Object.values(baseline).flat().length})`);
    if (problems.length) {
        console.error(problems.join('\n'));
        process.exit(1);
    }
}

main();
