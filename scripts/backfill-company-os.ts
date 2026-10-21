/**
 * Company-OS Phase 2 backfill (docs/COMPANY_OS_PLAN.md §6, Prompt D).
 *
 * Gives every existing unit/user/employee its place in the new company model WITHOUT changing
 * what anyone can do today:
 *   1. one Company (default) owns every Organization (unit)        → organizations.company_id
 *   2. users / employees / legacy roles get company_id
 *   3. one hidden access-template Role per system role, per company (anchored on the head-office
 *      unit), with RolePermission rows = union of today's legacy permission maps
 *   4. every user gets UserRole rows from users.role (+ user_unit_access / can_access_all_units)
 *   5. users without an Employee get one (same shape as hr-core ensureEmployeeForUser)
 *   6. Designation / OrgDepartment masters seeded from existing text values and linked
 *   7. CompanyModule rows: the company is entitled to every registry module
 *
 * SAFETY
 *   - DRY RUN IS THE DEFAULT. Nothing is written without `--apply --yes`.
 *   - Idempotent: re-running only fills gaps; existing rows are never overwritten or deleted.
 *   - Never touches legacy role rows' permissions, user.role, or any login/session data.
 *   - Prints the target database host first. Point it at a copy before pointing it at production.
 *
 * ACCESS DIFF (the Phase 2 gate): for every user it computes what they could open/do BEFORE
 * (users.role through the Phase 1 legacy maps) and AFTER (their UserRole rows through the
 * template permissions) and fails (exit 1) if any user's reachable pages differ.
 *
 * Usage
 *   npx tsx scripts/backfill-company-os.ts                          # dry run, single company
 *   npx tsx scripts/backfill-company-os.ts --company-name "Axten"   # dry run with a real name
 *   npx tsx scripts/backfill-company-os.ts --map scripts/company-map.json
 *   npx tsx scripts/backfill-company-os.ts --company-name "Axten" --apply --yes
 *   npx tsx scripts/backfill-company-os.ts --verify                 # read-only check of what is actually in the DB
 *
 * Output: tmp/backfill-diff.json (per-user before/after + everything the run could not map).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES } from '../app/lib/access/system-roles';
import { MODULES, LEGACY_PERMISSION_KEYS } from '../app/lib/modules/registry';
import { roleMayOpenWith } from '../app/lib/access/legacy-pages';
import { HEAD_OFFICE_ORGANIZATION_ID } from '../app/lib/head-office-org';

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PREFIX = 'company-template.';
const ACTOR = 'system:backfill-company-os';

// ───────────────────────── args ─────────────────────────
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const APPLY = flag('--apply');
const VERIFY = flag('--verify'); // read-only: diff the REAL database state (run after --apply, e.g. on production)
if (APPLY && VERIFY) { console.error('--apply and --verify are mutually exclusive.'); process.exit(2); }
if (APPLY && !flag('--yes')) { console.error('Refusing to write: --apply also requires --yes.'); process.exit(2); }
const MAP_PATH = opt('--map');
const NAME_ARG = opt('--company-name');
const SLUG_ARG = opt('--company-slug');
const OUT = path.resolve(ROOT, opt('--out') ?? 'tmp/backfill-diff.json');

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company';

// ───────────────────── template permissions ─────────────────────
/** Union of today's three legacy permission copies for a role (see system-roles.ts LEGACY-QUIRKs). */
function templatePermissions(slug: string): string[] {
    const r = SYSTEM_ROLES.find((x) => x.slug === slug);
    if (!r) return [];
    const set = new Set<string>([...(r.legacyPermissions.session ?? []), ...(r.legacyPermissions.roleActions ?? []), ...(r.legacyPermissions.proxy ?? [])]);
    return [...set].sort();
}

/** What `hasPermission()` grants today. admin short-circuits to everything. */
function beforePermissions(role: string): string[] {
    if (role === 'admin') return [...LEGACY_PERMISSION_KEYS].sort();
    return [...(SYSTEM_ROLES.find((x) => x.slug === role)?.legacyPermissions.session ?? [])].sort();
}

// ───────────────────── main ─────────────────────
async function main() {
    const prisma = new PrismaClient();
    const dbUrl = process.env.DATABASE_URL ?? '';
    const host = (() => { try { return new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:')).host; } catch { return '(unparseable DATABASE_URL)'; } })();
    console.log(`\nCompany-OS backfill — ${APPLY ? 'APPLY' : VERIFY ? 'VERIFY (read-only, real DB state)' : 'DRY RUN'}\nDatabase host: ${host}\n`);

    // Preflight: the Phase 2 migration must be applied before anything else can run.
    try { await prisma.company.count(); } catch {
        console.error('Migration 20261021140000_company_os_phase2 is not applied to this database. Apply it with `prisma migrate deploy` first.');
        process.exit(2);
    }

    const [orgs, users, employeesInitial, accessRows, clinicalDepts] = await Promise.all([
        prisma.organization.findMany({ select: { id: true, name: true, slug: true, is_active: true, created_at: true, company_id: true } }),
        prisma.user.findMany({
            select: {
                id: true, username: true, role: true, organizationId: true, is_active: true, name: true, designation: true,
                department: true, date_of_joining: true, createdAt: true, phone: true, email: true, branch_id: true, gender: true,
                can_access_all_units: true, company_id: true,
            },
        }),
        prisma.employee.findMany({
            select: { id: true, user_id: true, organizationId: true, designation: true, department_id: true, company_id: true, org_department_id: true, designation_id: true, employee_code: true },
        }),
        prisma.userUnitAccess.findMany({ select: { userId: true, organizationId: true, granted_by: true } }),
        prisma.department.findMany({ select: { id: true, name: true, organizationId: true } }),
    ]);

    let employees = employeesInitial;

    // ── 1. company grouping ──
    type Group = { name: string; slug: string; orgIds: Set<string> };
    const groups: Group[] = [];
    if (MAP_PATH) {
        const m = JSON.parse(fs.readFileSync(path.resolve(ROOT, MAP_PATH), 'utf8')) as { companies: { name: string; slug?: string; organizationIds: string[] | '*' }[] };
        const claimed = new Set<string>();
        for (const c of m.companies) {
            const ids = c.organizationIds === '*' ? orgs.map((o) => o.id).filter((id) => !claimed.has(id)) : c.organizationIds;
            ids.forEach((id) => claimed.add(id));
            groups.push({ name: c.name, slug: c.slug ?? slugify(c.name), orgIds: new Set(ids) });
        }
        const orphan = orgs.filter((o) => !claimed.has(o.id));
        if (orphan.length) { console.error(`company-map.json leaves ${orphan.length} unit(s) unassigned: ${orphan.map((o) => o.slug).join(', ')}`); process.exit(2); }
    } else {
        const ho = orgs.find((o) => o.id === HEAD_OFFICE_ORGANIZATION_ID);
        const name = NAME_ARG ?? (APPLY ? '' : (ho?.name ?? 'Company'));
        if (!name) { console.error('--company-name is required with --apply (or pass --map).'); process.exit(2); }
        groups.push({ name, slug: SLUG_ARG ?? slugify(name), orgIds: new Set(orgs.map((o) => o.id)) });
    }
    const companyOfOrg = new Map<string, Group>();
    for (const g of groups) for (const id of g.orgIds) companyOfOrg.set(id, g);

    const report: any = {
        mode: APPLY ? 'apply' : VERIFY ? 'verify' : 'dry-run', database_host: host, generated_at: new Date().toISOString(),
        companies: [] as any[], unmapped_users: [] as any[], cross_company_unit_access: [] as any[],
        employee_code_collisions_in_company: [] as any[], access_diff: [] as any[], pages_mismatch: [] as any[], permission_gains: {} as Record<string, number>,
    };

    const counters = {
        companies_created: 0, orgs_linked: 0, users_linked: 0, employees_linked: 0, legacy_roles_linked: 0,
        template_roles_created: 0, role_permissions_created: 0, user_roles_created: 0, employees_created: 0,
        designations_created: 0, org_departments_created: 0, employees_designation_linked: 0, employees_department_linked: 0,
        company_modules_created: 0,
    };

    const ids = new Map<string, string>(); // group.slug → company id (real or virtual)
    const anchorOf = new Map<string, string>(); // group.slug → anchor org id
    const templateRoleId = new Map<string, string>(); // `${slug}|${templateKey}` → role id (real in apply; virtual otherwise)

    for (const g of groups) {
        const gOrgs = orgs.filter((o) => g.orgIds.has(o.id));
        const anchor = gOrgs.find((o) => o.id === HEAD_OFFICE_ORGANIZATION_ID) ?? [...gOrgs].sort((a, b) => +a.created_at - +b.created_at)[0];
        anchorOf.set(g.slug, anchor.id);
        report.companies.push({ name: g.name, slug: g.slug, units: gOrgs.length, anchor_unit: anchor.slug });
    }

    // ── writes ──
    if (APPLY) {
        for (const g of groups) {
            let company = await prisma.company.findUnique({ where: { slug: g.slug } });
            if (!company) { company = await prisma.company.create({ data: { name: g.name, slug: g.slug } }); counters.companies_created++; }
            ids.set(g.slug, company.id);

            const gOrgIds = [...g.orgIds];
            counters.orgs_linked += (await prisma.organization.updateMany({ where: { id: { in: gOrgIds }, company_id: null }, data: { company_id: company.id } })).count;
            counters.users_linked += (await prisma.user.updateMany({ where: { organizationId: { in: gOrgIds }, company_id: null }, data: { company_id: company.id } })).count;
            counters.employees_linked += (await prisma.employee.updateMany({ where: { organizationId: { in: gOrgIds }, company_id: null }, data: { company_id: company.id } })).count;
            counters.legacy_roles_linked += (await prisma.role.updateMany({ where: { organizationId: { in: gOrgIds }, company_id: null, template_key: null }, data: { company_id: company.id } })).count;

            // template roles + permissions
            const anchorId = anchorOf.get(g.slug)!;
            for (const r of SYSTEM_ROLES) {
                const slug = TEMPLATE_PREFIX + r.slug;
                let role = await prisma.role.findUnique({ where: { organizationId_slug: { organizationId: anchorId, slug } } });
                if (!role) {
                    role = await prisma.role.create({
                        data: {
                            organizationId: anchorId, name: `${r.label} (access template)`, slug,
                            description: 'Company-OS access template (Phase 2). Hidden from the legacy roles screen.',
                            is_system: true, is_active: true, permissions: [], data_scope: 'organization',
                            company_id: company.id, unit_id: null, template_key: r.slug,
                        },
                    });
                    counters.template_roles_created++;
                }
                templateRoleId.set(`${g.slug}|${r.slug}`, role.id);
                const perms = templatePermissions(r.slug);
                if (perms.length) {
                    const res = await prisma.rolePermission.createMany({
                        data: perms.map((k) => ({ role_id: role!.id, permission_key: k, scope: 'UNIT' as const })), skipDuplicates: true,
                    });
                    counters.role_permissions_created += res.count;
                }
            }

            // entitlement: every registry module
            const cm = await prisma.companyModule.createMany({
                data: MODULES.map((m) => ({ company_id: company!.id, module_key: m.key, source: 'plan' })), skipDuplicates: true,
            });
            counters.company_modules_created += cm.count;
        }
    }

    // ── 2. users → planned/actual UserRole rows ──
    const usersByCompany = new Map<string, typeof users>();
    const roleOf = (slug: string) => SYSTEM_ROLES.find((x) => x.slug === slug);
    const plannedUserRoles: { userId: string; groupSlug: string; templateKey: string; unitId: string | null; primary: boolean; grantedBy: string | null }[] = [];

    for (const u of users) {
        const g = companyOfOrg.get(u.organizationId);
        if (!g) { report.unmapped_users.push({ username: u.username, reason: 'unit has no company' }); continue; }
        (usersByCompany.get(g.slug) ?? usersByCompany.set(g.slug, []).get(g.slug)!).push(u);
        if (!roleOf(u.role)) { report.unmapped_users.push({ username: u.username, role: u.role, reason: 'role is not a known system role — no UserRole created' }); continue; }
        plannedUserRoles.push({ userId: u.id, groupSlug: g.slug, templateKey: u.role, unitId: u.organizationId, primary: true, grantedBy: null });
        if (u.can_access_all_units) plannedUserRoles.push({ userId: u.id, groupSlug: g.slug, templateKey: u.role, unitId: null, primary: false, grantedBy: null });
    }
    for (const a of accessRows) {
        const u = users.find((x) => x.id === a.userId);
        if (!u || !roleOf(u.role)) continue;
        const gHome = companyOfOrg.get(u.organizationId), gTarget = companyOfOrg.get(a.organizationId);
        if (!gHome || gHome !== gTarget) { report.cross_company_unit_access.push({ username: u.username, unit: a.organizationId }); continue; }
        if (a.organizationId === u.organizationId) continue;
        plannedUserRoles.push({ userId: u.id, groupSlug: gHome.slug, templateKey: u.role, unitId: a.organizationId, primary: false, grantedBy: a.granted_by ?? null });
    }

    if (APPLY) {
        for (const p of plannedUserRoles) {
            const roleId = templateRoleId.get(`${p.groupSlug}|${p.templateKey}`)!;
            const existing = await prisma.userRole.findFirst({ where: { user_id: p.userId, role_id: roleId, unit_id: p.unitId } });
            if (existing) continue;
            await prisma.userRole.create({ data: { user_id: p.userId, role_id: roleId, unit_id: p.unitId, is_primary: p.primary, granted_by: p.grantedBy ?? ACTOR } });
            counters.user_roles_created++;
        }
    } else {
        counters.user_roles_created = plannedUserRoles.length;
    }

    // ── 3. employees: create missing, then masters + links ──
    const empByUser = new Map(employees.filter((e) => e.user_id).map((e) => [e.user_id as string, e]));
    const missing = users.filter((u) => !empByUser.has(u.id) && companyOfOrg.has(u.organizationId));
    if (!APPLY) counters.employees_created = missing.length;
    else {
        for (const u of missing) {
            const g = companyOfOrg.get(u.organizationId)!;
            let n = await prisma.employee.count({ where: { organizationId: u.organizationId } });
            for (let i = 1; i <= 25; i++) {
                try {
                    await prisma.employee.create({
                        data: {
                            user_id: u.id, employee_code: `EMP-${String(n + i).padStart(5, '0')}`, name: u.name || u.username,
                            designation: u.designation || u.role, date_of_joining: u.date_of_joining ?? u.createdAt ?? new Date(),
                            phone: u.phone ?? null, email: u.email ?? null, branch_id: u.branch_id ?? null, gender: u.gender ?? null,
                            is_active: u.is_active, organizationId: u.organizationId, company_id: ids.get(g.slug)!,
                        },
                    });
                    counters.employees_created++;
                    break;
                } catch (e: any) { if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('employee_code')) continue; throw e; }
            }
        }
    }

    // Re-read so masters/links below also cover the employees created just now (one pass, fully idempotent).
    if (APPLY && counters.employees_created) {
        employees = await prisma.employee.findMany({
            select: { id: true, user_id: true, organizationId: true, designation: true, department_id: true, company_id: true, org_department_id: true, designation_id: true, employee_code: true },
        });
    }

    // employee code collisions inside a company (matters when login-by-employee-code arrives)
    for (const g of groups) {
        const seen = new Map<string, number>();
        for (const e of employees) if (g.orgIds.has(e.organizationId)) seen.set(e.employee_code, (seen.get(e.employee_code) ?? 0) + 1);
        const dup = [...seen.entries()].filter(([, n]) => n > 1);
        if (dup.length) report.employee_code_collisions_in_company.push({ company: g.slug, duplicated_codes: dup.length, examples: dup.slice(0, 5).map(([c, n]) => `${c}×${n}`) });
    }

    // masters from existing text values
    for (const g of groups) {
        const cid = ids.get(g.slug);
        const gEmps = employees.filter((e) => g.orgIds.has(e.organizationId));
        const gUsers = usersByCompany.get(g.slug) ?? [];
        const desNames = [...new Set(gEmps.map((e) => (e.designation ?? '').trim()).filter(Boolean))];
        const deptNames = [...new Set([
            ...clinicalDepts.filter((d) => g.orgIds.has(d.organizationId)).map((d) => d.name.trim()),
            ...gUsers.map((u) => (u.department ?? '').trim()),
        ].filter(Boolean))];
        if (!APPLY) { counters.designations_created += desNames.length; counters.org_departments_created += deptNames.length; continue; }
        const d1 = await prisma.designation.createMany({ data: desNames.map((name) => ({ company_id: cid!, name })), skipDuplicates: true });
        const d2 = await prisma.orgDepartment.createMany({ data: deptNames.map((name) => ({ company_id: cid!, name })), skipDuplicates: true });
        counters.designations_created += d1.count; counters.org_departments_created += d2.count;

        const desByName = new Map((await prisma.designation.findMany({ where: { company_id: cid! } })).map((d) => [d.name, d.id]));
        const depByName = new Map((await prisma.orgDepartment.findMany({ where: { company_id: cid! } })).map((d) => [d.name, d.id]));
        const clinicalById = new Map(clinicalDepts.map((d) => [d.id, d.name.trim()]));
        const userById = new Map(gUsers.map((u) => [u.id, u]));
        for (const e of await prisma.employee.findMany({ where: { company_id: cid!, OR: [{ designation_id: null }, { org_department_id: null }] } })) {
            const data: { designation_id?: string; org_department_id?: string } = {};
            const dId = e.designation_id ? null : desByName.get((e.designation ?? '').trim());
            if (dId) { data.designation_id = dId; counters.employees_designation_linked++; }
            if (!e.org_department_id) {
                const nm = (e.department_id && clinicalById.get(e.department_id)) || (e.user_id && (userById.get(e.user_id)?.department ?? '').trim()) || '';
                const oid = nm ? depByName.get(nm) : undefined;
                if (oid) { data.org_department_id = oid; counters.employees_department_linked++; }
            }
            if (Object.keys(data).length) await prisma.employee.update({ where: { id: e.id }, data });
        }
        await prisma.accessChangeLog.create({ data: { company_id: cid!, actor_id: ACTOR, target_user_id: null, change: { event: 'backfill-company-os', counters } as any } });
    }

    // ── 4. access diff (the gate) ──
    // AFTER is read back from the database in apply mode, from the plan in a dry run.
    type RoleUse = { templateKey: string; unitId: string | null };
    const afterUses = new Map<string, RoleUse[]>();
    const READ_DB = APPLY || VERIFY;
    const dbTemplatePerms = new Map<string, string[]>();
    if (READ_DB) {
        const rp = await prisma.rolePermission.findMany({ where: { role: { template_key: { not: null } } }, select: { permission_key: true, role: { select: { template_key: true } } } });
        for (const r of rp) { const k = r.role.template_key as string; (dbTemplatePerms.get(k) ?? dbTemplatePerms.set(k, []).get(k)!).push(r.permission_key); }
        for (const v of dbTemplatePerms.values()) v.sort();
    }
    const afterTemplatePerms = (key: string) => (READ_DB ? [...new Set(dbTemplatePerms.get(key) ?? [])].sort() : templatePermissions(key));
    if (READ_DB) {
        const rows = await prisma.userRole.findMany({ select: { user_id: true, unit_id: true, role: { select: { template_key: true } } } });
        for (const r of rows) {
            if (!r.role.template_key) continue;
            (afterUses.get(r.user_id) ?? afterUses.set(r.user_id, []).get(r.user_id)!).push({ templateKey: r.role.template_key, unitId: r.unit_id });
        }
    } else {
        for (const p of plannedUserRoles) (afterUses.get(p.userId) ?? afterUses.set(p.userId, []).get(p.userId)!).push({ templateKey: p.templateKey, unitId: p.unitId });
    }
    for (const u of users) {
        if (!roleOf(u.role)) continue; // already reported as unmapped
        const beforePerms = beforePermissions(u.role);
        const beforePages = pagesFor(u.role, templatePermissionsProxyOnly(u.role));
        const uses = afterUses.get(u.id) ?? [];
        const home = uses.find((x) => x.unitId === u.organizationId) ?? uses[0];
        const afterPerms = home ? afterTemplatePerms(home.templateKey) : [];
        const afterPages = home ? pagesFor(home.templateKey, afterPerms) : [];
        const sameRole = !!home && home.templateKey === u.role;
        const pagesEqual = JSON.stringify(beforePages) === JSON.stringify(afterPages);
        const gains = afterPerms.filter((k) => !beforePerms.includes(k));
        const losses = beforePerms.filter((k) => !afterPerms.includes(k));
        for (const k of gains) report.permission_gains[k] = (report.permission_gains[k] ?? 0) + 1;
        if (!sameRole || !pagesEqual || losses.length) {
            report.pages_mismatch.push({ username: u.username, role: u.role, has_user_role: !!home, pagesEqual, lost_permissions: losses });
        }
        report.access_diff.push({ username: u.username, role: u.role, unit: u.organizationId, before: { pages: beforePages, permissions: beforePerms }, after: { pages: afterPages, permissions: afterPerms }, gains, losses });
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ ...report, counters }, null, 2));

    console.log(`Units: ${orgs.length} · Users: ${users.length} · Employees: ${employees.length} · Unit-access rows: ${accessRows.length}`);
    for (const c of report.companies) console.log(`Company "${c.name}" (${c.slug}) ← ${c.units} unit(s); template anchor: ${c.anchor_unit}`);
    console.log(`\n${APPLY ? 'Wrote' : 'Would write'}:`);
    for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(32)} ${v}`);
    console.log(`\nUsers with no mappable system role : ${report.unmapped_users.length}`);
    console.log(`Cross-company unit access rows      : ${report.cross_company_unit_access.length}`);
    console.log(`Employee-code collisions in company : ${report.employee_code_collisions_in_company.map((x: any) => `${x.company}=${x.duplicated_codes}`).join(', ') || 'none'}`);
    console.log(`Permission keys users would GAIN    : ${JSON.stringify(report.permission_gains)}  (inert until the access engine is enforced)`);
    console.log(`Access diff — users whose pages/permissions change: ${report.pages_mismatch.length}`);
    for (const m of report.pages_mismatch.slice(0, 10)) console.log(`   ✗ ${m.username} (${m.role}) userRole=${m.has_user_role} pagesEqual=${m.pagesEqual} lost=${m.lost_permissions.join(',')}`);
    console.log(`\nFull detail: ${path.relative(ROOT, OUT)}`);

    await prisma.$disconnect();
    if (report.pages_mismatch.length) { console.error('\nACCESS DIFF IS NOT EMPTY — do not proceed to Phase 3.'); process.exit(1); }
    console.log('\nAccess diff is empty ✔');
}

/** The role's page access today only ever uses proxy.ts ROLE_PERMISSIONS (not session.ts). */
function templatePermissionsProxyOnly(role: string): string[] {
    return [...(SYSTEM_ROLES.find((x) => x.slug === role)?.legacyPermissions.proxy ?? [])];
}

function pagesFor(roleSlug: string, permissions: readonly string[]): string[] {
    const out: string[] = [];
    for (const m of MODULES) for (const g of m.legacyGates ?? []) if (roleMayOpenWith(roleSlug, permissions, g.prefix)) out.push(g.prefix);
    return out.sort();
}

main().catch((e) => { console.error(e); process.exit(1); });
