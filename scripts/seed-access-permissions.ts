/**
 * Seeds the role-template rows for registry permissions that have NO legacy key
 * (docs/COMPANY_OS_PLAN.md Phase 3). Example: `pharmacy.return.create` — today a hand-written role list
 * (admin, pharmacist, nurse); the registry's `defaultRoles` is that list, and this script writes it to
 * `role_permissions` on each company's access-template roles so the DATABASE stays the source of truth.
 *
 * Permissions tied to a legacy key need no rows (their holders already hold the legacy key).
 *
 *   npx tsx scripts/seed-access-permissions.ts            # dry run (default)
 *   npx tsx scripts/seed-access-permissions.ts --apply --yes
 *   npx tsx scripts/seed-access-permissions.ts --verify   # read-only; exit 1 if any row is missing
 *
 * Idempotent: only adds missing rows, never changes or deletes one (so an admin who later removes a default
 * in the Phase 4 role editor is not overridden... unless this is re-run; use --verify in CI instead).
 * Requires migration 20261021140000_company_os_phase2 and scripts/backfill-company-os.ts to have run.
 */
import { PrismaClient } from '@prisma/client';
import { seededPermissions } from '../app/lib/access/permissions';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERIFY = argv.includes('--verify');
if (APPLY && !argv.includes('--yes')) { console.error('Refusing to write: --apply also requires --yes.'); process.exit(2); }

async function main() {
    const prisma = new PrismaClient();
    try { await prisma.company.count(); } catch {
        console.error('Phase 2 migration is not applied to this database.'); process.exit(2);
    }
    const seeded = seededPermissions().filter((p) => (p.def.defaultRoles ?? []).length);
    const roles = await prisma.role.findMany({ where: { template_key: { not: null } }, select: { id: true, template_key: true, company_id: true } });
    if (!roles.length) { console.error('No access-template roles found — run scripts/backfill-company-os.ts first.'); process.exit(2); }

    let missing = 0, created = 0;
    for (const role of roles) {
        for (const { def } of seeded) {
            if (!def.defaultRoles!.includes(role.template_key as string)) continue;
            const exists = await prisma.rolePermission.findUnique({ where: { role_id_permission_key: { role_id: role.id, permission_key: def.key } } });
            if (exists) continue;
            missing++;
            if (APPLY) { await prisma.rolePermission.create({ data: { role_id: role.id, permission_key: def.key, scope: 'UNIT' } }); created++; }
        }
    }
    console.log(`${APPLY ? 'APPLY' : VERIFY ? 'VERIFY' : 'DRY RUN'}: ${seeded.length} seeded permission(s) × ${roles.length} template role(s); missing rows: ${missing}${APPLY ? `, created: ${created}` : ''}`);
    await prisma.$disconnect();
    if (VERIFY && missing) { console.error('Role templates are missing seeded permissions — run with --apply --yes.'); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
