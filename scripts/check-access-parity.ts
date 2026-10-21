/**
 * Parity check: the registry-generated access maps must equal the hardcoded ones
 * (docs/COMPANY_OS_PLAN.md §0 rule 6, Phases 1–3). Read-only.
 *
 * The hardcoded maps are read straight out of proxy.ts / session.ts / role-actions.ts /
 * Sidebar.tsx / login/actions.ts by AST (those files can't be imported from a script), then
 * compared with app/lib/access/legacy-maps.ts. ROLE_ROUTES is compared as an ORDERED list,
 * because proxy.ts takes the first matching prefix.
 *
 *   npm run check:parity
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractConst } from './lib/extract-literal';
import {
    generateRoleRoutes, generatePermissionRoutes, generateProxyRolePermissions, generateSessionRolePermissions,
    generateRoleActionsRolePermissions, generateProxyHomeMap, generateLoginHomeMap, generateNavByRole, generateMyWorkspace,
} from '../app/lib/access/legacy-maps';

const ROOT = path.resolve(__dirname, '..');
const f = (...p: string[]) => path.join(ROOT, ...p);

let failures = 0;
function compare(name: string, legacy: unknown, generated: unknown, ordered = false) {
    const norm = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(norm);
        if (v && typeof v === 'object') {
            const entries = Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, norm(x)] as const);
            return ordered ? entries : entries.sort(([a], [b]) => a.localeCompare(b));
        }
        return v;
    };
    const a = JSON.stringify(norm(legacy));
    const b = JSON.stringify(norm(generated));
    if (a === b) { console.log(`  ok    ${name}`); return; }
    failures++;
    console.error(`  FAIL  ${name}`);
    const la = legacy as Record<string, unknown>, ga = generated as Record<string, unknown>;
    if (la && ga && typeof la === 'object' && typeof ga === 'object' && !Array.isArray(la)) {
        for (const k of new Set([...Object.keys(la), ...Object.keys(ga)])) {
            if (JSON.stringify(la[k]) !== JSON.stringify(ga[k])) {
                console.error(`        key "${k}"\n          legacy   : ${JSON.stringify(la[k])?.slice(0, 220)}\n          generated: ${JSON.stringify(ga[k])?.slice(0, 220)}`);
            }
        }
        if (ordered && JSON.stringify(Object.keys(la)) !== JSON.stringify(Object.keys(ga))) {
            console.error(`        order legacy   : ${Object.keys(la).join(' ')}\n        order generated: ${Object.keys(ga).join(' ')}`);
        }
    }
}

console.log('Access parity (registry-generated vs hardcoded):');
compare('proxy.ts ROLE_ROUTES (ordered)', extractConst(f('proxy.ts'), 'ROLE_ROUTES'), generateRoleRoutes(), true);
compare('proxy.ts PERMISSION_ROUTES', extractConst(f('proxy.ts'), 'PERMISSION_ROUTES'), generatePermissionRoutes());
compare('proxy.ts ROLE_PERMISSIONS', extractConst(f('proxy.ts'), 'ROLE_PERMISSIONS'), generateProxyRolePermissions());
compare('session.ts SYSTEM_ROLE_PERMISSIONS', extractConst(f('app/lib/session.ts'), 'SYSTEM_ROLE_PERMISSIONS'), generateSessionRolePermissions());
compare('role-actions.ts SYSTEM_ROLE_PERMISSIONS', extractConst(f('app/actions/role-actions.ts'), 'SYSTEM_ROLE_PERMISSIONS'), generateRoleActionsRolePermissions());
compare('proxy.ts redirectMap', extractConst(f('proxy.ts'), 'redirectMap'), generateProxyHomeMap());

const loginSrc = fs.readFileSync(f('app/login/actions.ts'), 'utf8');
const loginMap: Record<string, string> = {};
for (const m of loginSrc.matchAll(/case '(\w+)': redirect\('([^']+)'\);/g)) loginMap[m[1]] = m[2];
compare('login/actions.ts role redirects', loginMap, generateLoginHomeMap());

compare('Sidebar.tsx NAV_BY_ROLE', extractConst(f('app/components/layout/Sidebar.tsx'), 'NAV_BY_ROLE'), generateNavByRole());
compare('Sidebar.tsx MY_WORKSPACE', extractConst(f('app/components/layout/Sidebar.tsx'), 'MY_WORKSPACE'), generateMyWorkspace());

if (failures) { console.error(`\n${failures} parity check(s) failed. Update the registry/system-roles to match, or regenerate legacy-nav (npx tsx scripts/gen-legacy-nav.ts).`); process.exit(1); }
console.log('\nAll access maps match.');
