/**
 * Break-glass: make someone a COMPANY OWNER (administrator across every unit of the company), or list the owners.
 * Works directly on the database, so it does not depend on the admin UI or on any existing owner being able to sign in.
 *
 *   npx tsx scripts/company-owner.ts --list
 *   npx tsx scripts/company-owner.ts --promote <username> --yes
 *   npx tsx scripts/company-owner.ts --create <username> --name "Full Name" --unit <unit-slug> --yes   # prints a one-time password
 *
 * Dry run unless --yes. Everything it changes is written to access_change_logs (actor "system:company-owner-script").
 * Needs the Phase 2 migration + scripts/backfill-company-os.ts to have run (it relies on the access templates).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const has = (n: string) => argv.includes(n);
const YES = has('--yes');
const ACTOR = 'system:company-owner-script';

async function main() {
    const prisma = new PrismaClient();
    const host = (() => { try { return new URL((process.env.DATABASE_URL ?? '').replace(/^postgres(ql)?:/, 'http:')).host; } catch { return '?'; } })();
    console.log(`Database host: ${host}${YES ? '' : '   (dry run)'}`);
    try { await prisma.company.count(); } catch { console.error('Phase 2 migration is not applied to this database.'); process.exit(2); }

    const now = new Date();
    const owners = await prisma.userRole.findMany({
        where: { unit_id: null, role: { template_key: 'admin' }, user: { is_active: true }, valid_from: { lte: now }, OR: [{ valid_to: null }, { valid_to: { gt: now } }] },
        select: { user: { select: { username: true, name: true, company_id: true } } },
    });
    if (has('--list') || (!opt('--promote') && !opt('--create'))) {
        console.log(`Active company owners: ${owners.length}`);
        for (const o of owners) console.log(`  ${o.user.username}  (${o.user.name ?? ''})`);
        await prisma.$disconnect(); return;
    }

    const template = async (companyId: string) => {
        const t = await prisma.role.findFirst({ where: { company_id: companyId, template_key: 'admin' }, select: { id: true } });
        if (!t) { console.error('No administrator access template for this company — run scripts/backfill-company-os.ts first.'); process.exit(2); }
        return t.id;
    };
    const grant = async (userId: string, companyId: string) => {
        const roleId = await template(companyId);
        const existing = await prisma.userRole.findFirst({ where: { user_id: userId, role_id: roleId, unit_id: null } });
        if (existing) await prisma.userRole.update({ where: { id: existing.id }, data: { valid_from: now, valid_to: null } });
        else await prisma.userRole.create({ data: { user_id: userId, role_id: roleId, unit_id: null, is_primary: false, granted_by: ACTOR } });
        await prisma.user.update({ where: { id: userId }, data: { can_access_all_units: true, is_active: true, access_version: { increment: 1 } } });
        await prisma.accessChangeLog.create({ data: { company_id: companyId, actor_id: ACTOR, target_user_id: userId, change: { event: 'role.assign', role: 'Administrator (company owner)', unitId: null, via: 'break-glass script' } } });
    };

    if (opt('--promote')) {
        const u = await prisma.user.findUnique({ where: { username: opt('--promote')! }, select: { id: true, username: true, role: true, company_id: true } });
        if (!u) { console.error('No such user.'); process.exit(2); }
        if (!u.company_id) { console.error('That user has no company yet — run the backfill first.'); process.exit(2); }
        if (u.role !== 'admin') { console.error(`User "${u.username}" has legacy role "${u.role}". Only an admin can be a company owner — change their role first.`); process.exit(2); }
        console.log(`${YES ? 'Promoting' : 'Would promote'} ${u.username} to company owner.`);
        if (YES) await grant(u.id, u.company_id);
    } else {
        const username = opt('--create')!, name = opt('--name'), unitSlug = opt('--unit');
        if (!name || !unitSlug) { console.error('--create needs --name and --unit.'); process.exit(2); }
        const unit = await prisma.organization.findFirst({ where: { slug: unitSlug }, select: { id: true, company_id: true, name: true } });
        if (!unit?.company_id) { console.error('Unknown unit, or the unit has no company yet.'); process.exit(2); }
        if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) { console.error('That username already exists — use --promote.'); process.exit(2); }
        const password = randomBytes(9).toString('base64url');
        console.log(`${YES ? 'Creating' : 'Would create'} company owner "${username}" in ${unit.name}.`);
        if (YES) {
            const user = await prisma.user.create({ data: { username, password: await bcrypt.hash(password, 10), name, role: 'admin', organizationId: unit.id, company_id: unit.company_id, is_active: true, can_access_all_units: true } });
            const n = await prisma.employee.count({ where: { organizationId: unit.id } });
            await prisma.employee.create({ data: { user_id: user.id, employee_code: `EMP-${String(n + 1).padStart(5, '0')}`, name, designation: 'Administrator', date_of_joining: now, organizationId: unit.id, company_id: unit.company_id } });
            const roleId = await template(unit.company_id);
            await prisma.userRole.create({ data: { user_id: user.id, role_id: roleId, unit_id: unit.id, is_primary: true, granted_by: ACTOR } });
            await grant(user.id, unit.company_id);
            console.log(`\nOne-time password: ${password}\nChange it after first sign-in.`);
        }
    }
    if (!YES) console.log('Re-run with --yes to apply.');
    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
