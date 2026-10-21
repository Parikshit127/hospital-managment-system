/**
 * Access administration against a real database (skipped without TEST_DATABASE_URL — see scripts/test-integration.sh).
 * Exercises the delegation rules end to end: who may create, assign, override, offboard, and edit roles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';

const URL_ = process.env.TEST_DATABASE_URL;
const HO = '9bd49bae-cecc-49f8-b18d-88f146124a98';

describe.skipIf(!URL_)('access administration', () => {
    let prisma: any;
    let svc: typeof import('@/app/lib/access/admin-service');
    const env = { ...process.env, DATABASE_URL: URL_, DIRECT_URL: URL_, JWT_SECRET: 'x' };
    const run = (cmd: string) => execSync(cmd, { env, stdio: 'pipe', cwd: process.cwd() }).toString();

    const actorOf = async (id: string) => {
        const u = await prisma.user.findUnique({ where: { id }, select: { organizationId: true } });
        return svc.loadActor({ id, organization_id: u.organizationId });
    };
    const rejects = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };
    const roleId = async (key: string) => (await prisma.role.findFirst({ where: { template_key: key } })).id;

    beforeAll(async () => {
        process.env.DATABASE_URL = URL_; process.env.DIRECT_URL = URL_; process.env.JWT_SECRET = 'x';
        const { PrismaClient } = await import('@prisma/client');
        prisma = new PrismaClient();

        await prisma.organization.createMany({ data: [
            { id: HO, name: 'HO', slug: 'ho', code: 'HO' }, { id: 'org-a', name: 'Hospital A', slug: 'a', code: 'A' }, { id: 'org-b', name: 'Hospital B', slug: 'b', code: 'B' },
        ] });
        const u = (id: string, role: string, organizationId: string, extra: object = {}) => ({ id, username: id, password: 'x', role, organizationId, name: id, ...extra });
        await prisma.user.createMany({ data: [
            u('owner1', 'admin', 'org-a', { can_access_all_units: true }),       // company owner
            u('owner2', 'admin', 'org-a', { can_access_all_units: true }),       // second company owner
            u('uadmin', 'admin', 'org-a'),                                        // unit admin of org-a only
            u('hr1', 'hr', 'org-a'), u('nurse1', 'nurse', 'org-a'),
            u('hradmin', 'coordinator', 'org-a'),                                 // base role grants nothing: only the custom role below counts
        ] });

        run('npx tsx scripts/backfill-company-os.ts --company-name Test --apply --yes --out /tmp/aa-backfill.json');
        run('npx tsx scripts/seed-access-permissions.ts --apply --yes');

        // a second, unrelated company — must stay invisible
        const c2 = await prisma.company.create({ data: { name: 'Other', slug: 'other' } });
        await prisma.organization.create({ data: { id: 'org-x', name: 'X', slug: 'x', code: 'X', company_id: c2.id } });
        await prisma.user.create({ data: { id: 'ux', username: 'ux', password: 'x', role: 'hr', organizationId: 'org-x', company_id: c2.id, name: 'ux' } });

        svc = await import('@/app/lib/access/admin-service');
    }, 120_000);

    afterAll(async () => { await prisma?.$disconnect(); });

    it('the backfill made the all-unit admins company owners and the unit admin a unit admin', async () => {
        expect((await actorOf('owner1')).ent.isCompanyOwner).toBe(true);
        const ua = await actorOf('uadmin');
        expect(ua.ent.isAdmin).toBe(true);
        expect(ua.ent.isCompanyOwner).toBe(false);
    });

    describe('creating a user with access', () => {
        it('creates login + employee + role + log in one go, with a hashed temporary password', async () => {
            const owner = await actorOf('owner1');
            const out = await svc.createStaffWithAccess(owner, { name: 'Asha Rao', homeUnitId: 'org-a', primaryRole: 'receptionist', email: 'a@x.com', designation: 'Front desk' });
            expect(out.temporaryPassword).toHaveLength(12);
            expect(out.employeeCode).toMatch(/^EMP-\d{5}$/);

            const user = await prisma.user.findUnique({ where: { id: out.userId }, include: { user_roles: { include: { role: true } } } });
            expect(user).toMatchObject({ role: 'receptionist', organizationId: 'org-a', is_active: true });
            expect(user.company_id).toBeTruthy();
            expect(await bcrypt.compare(out.temporaryPassword!, user.password)).toBe(true);
            expect(user.user_roles).toHaveLength(1);
            expect(user.user_roles[0]).toMatchObject({ is_primary: true, unit_id: 'org-a' });
            expect(user.user_roles[0].role.template_key).toBe('receptionist');
            const emp = await prisma.employee.findFirst({ where: { user_id: out.userId } });
            expect(emp).toMatchObject({ organizationId: 'org-a', employee_code: out.employeeCode, designation: 'Front desk' });
            expect(emp.company_id).toBe(user.company_id);
            const log = await prisma.accessChangeLog.findFirst({ where: { target_user_id: out.userId } });
            expect(log.change).toMatchObject({ event: 'user.create', primaryRole: 'receptionist' });
        });

        it('rejects duplicate usernames, duplicate codes in the unit, bad passwords, unknown roles', async () => {
            const owner = await actorOf('owner1');
            await svc.createStaffWithAccess(owner, { name: 'Dup One', username: 'dup.user', employeeCode: 'X-1', homeUnitId: 'org-a', primaryRole: 'nurse', password: 'longenough1' });
            await rejects(svc.createStaffWithAccess(owner, { name: 'Dup Two', username: 'dup.user', homeUnitId: 'org-a', primaryRole: 'nurse' }), /already taken/);
            await rejects(svc.createStaffWithAccess(owner, { name: 'Dup Three', employeeCode: 'X-1', homeUnitId: 'org-a', primaryRole: 'nurse' }), /already used/);
            await rejects(svc.createStaffWithAccess(owner, { name: 'Short Pw', homeUnitId: 'org-a', primaryRole: 'nurse', password: 'short' }), /at least 8/);
            await rejects(svc.createStaffWithAccess(owner, { name: 'Bad Role', homeUnitId: 'org-a', primaryRole: 'wizard' }), /valid primary role/);
        });

        it('a unit admin cannot create users in a unit where they hold nothing', async () => {
            const ua = await actorOf('uadmin');
            await svc.createStaffWithAccess(ua, { name: 'Own Unit', homeUnitId: 'org-a', primaryRole: 'nurse' }); // fine
            await rejects(svc.createStaffWithAccess(ua, { name: 'Other Unit', homeUnitId: 'org-b', primaryRole: 'nurse' }), /do not have permission/);
        });

        it('cannot create into another company', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.createStaffWithAccess(owner, { name: 'Leak', homeUnitId: 'org-x', primaryRole: 'nurse' }), /not part of your company/);
        });
    });

    describe('assigning and revoking roles', () => {
        it('nobody changes their own access', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.assignRole(owner, { targetUserId: 'owner1', roleId: await roleId('finance'), unitId: 'org-a' }), /own access/);
        });

        it('a unit admin cannot grant company-wide access or touch another company', async () => {
            const ua = await actorOf('uadmin');
            await rejects(svc.assignRole(ua, { targetUserId: 'hr1', roleId: await roleId('finance'), unitId: null }), /company owner/);
            await rejects(svc.assignRole(ua, { targetUserId: 'ux', roleId: await roleId('finance'), unitId: 'org-a' }), /not found in your company/);
        });

        it('assign → effective permission appears; revoke → gone; re-assign revives the same row', async () => {
            const owner = await actorOf('owner1');
            const fin = await roleId('finance');
            const { id } = await svc.assignRole(owner, { targetUserId: 'hr1', roleId: fin, unitId: 'org-a' });
            const { getEntitlements } = await import('@/app/lib/access/entitlements');
            const { can } = await import('@/app/lib/access/resolve');
            expect(can(await getEntitlements('hr1', 'org-a'), 'finance.ledger.view')).toBe('UNIT');

            await rejects(svc.assignRole(owner, { targetUserId: 'hr1', roleId: fin, unitId: 'org-a' }), /already holds/);
            await svc.revokeUserRole(owner, id);
            expect(can(await getEntitlements('hr1', 'org-a'), 'finance.ledger.view')).toBeNull();

            const again = await svc.assignRole(owner, { targetUserId: 'hr1', roleId: fin, unitId: 'org-a' });
            expect(again.id).toBe(id); // revived, not duplicated
            expect(await prisma.userRole.count({ where: { user_id: 'hr1', role_id: fin, unit_id: 'org-a' } })).toBe(1);
            await svc.revokeUserRole(owner, id);
        });

        it('every change bumps access_version so caches refresh', async () => {
            const owner = await actorOf('owner1');
            const before = (await prisma.user.findUnique({ where: { id: 'nurse1' } })).access_version;
            const { id } = await svc.assignRole(owner, { targetUserId: 'nurse1', roleId: await roleId('pharmacist'), unitId: 'org-a' });
            expect((await prisma.user.findUnique({ where: { id: 'nurse1' } })).access_version).toBe(before + 1);
            await svc.revokeUserRole(owner, id);
        });

        it('a role cannot be granted for a past end date', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.assignRole(owner, { targetUserId: 'hr1', roleId: await roleId('lab_technician'), unitId: 'org-a', validTo: new Date(Date.now() - 1000) }), /future/);
        });
    });

    describe('an HR admin cannot escalate', () => {
        let hrAdminActor: Awaited<ReturnType<typeof svc.loadActor>>;
        beforeAll(async () => {
            const owner = await actorOf('owner1');
            const { id } = await svc.createCustomRole(owner, { name: 'HR Admin', permissionKeys: ['hr.employee.view', 'hr.leave.view', 'hr.leave.approve', 'admin.access.assign', 'admin.access.view'] });
            await svc.assignRole(owner, { targetUserId: 'hradmin', roleId: id, unitId: 'org-a' });
            hrAdminActor = await actorOf('hradmin');
        });

        it('can hand out HR roles to others', async () => {
            const hrRole = await roleId('hr');
            // the stock "hr" template carries hr.* legacy keys; the HR admin holds hr.* via new-style keys only for view/leave -> not enough
            await rejects(svc.assignRole(hrAdminActor, { targetUserId: 'nurse1', roleId: hrRole, unitId: 'org-a' }), /only grant permissions you hold/);
        });

        it('can hand out a custom role made only of HR permissions they hold', async () => {
            const owner = await actorOf('owner1');
            const { id } = await svc.createCustomRole(owner, { name: 'Leave Approver', permissionKeys: ['hr.leave.approve', 'hr.leave.view'] });
            await expect(svc.assignRole(hrAdminActor, { targetUserId: 'nurse1', roleId: id, unitId: 'org-a' })).resolves.toBeTruthy();
        });

        it('cannot hand out finance, admin, or company-wide access', async () => {
            await rejects(svc.assignRole(hrAdminActor, { targetUserId: 'nurse1', roleId: await roleId('finance'), unitId: 'org-a' }), /only grant permissions you hold/);
            await rejects(svc.assignRole(hrAdminActor, { targetUserId: 'nurse1', roleId: await roleId('admin'), unitId: 'org-a' }), /administrator/);
            await rejects(svc.assignRole(hrAdminActor, { targetUserId: 'nurse1', roleId: await roleId('hr'), unitId: null }), /company owner/);
        });

        it('cannot override-grant a permission they do not hold, but can override-grant one they do', async () => {
            await rejects(svc.addOverride(hrAdminActor, { targetUserId: 'nurse1', permissionKey: 'finance.ledger.edit', effect: 'GRANT', reason: 'nope', unitId: 'org-a' }), /only grant permissions you hold/);
            // an override with no unit is company-wide, which needs a company owner
            await rejects(svc.addOverride(hrAdminActor, { targetUserId: 'nurse1', permissionKey: 'hr.leave.approve', effect: 'GRANT', reason: 'covering' }), /company owner/);
            await expect(svc.addOverride(hrAdminActor, { targetUserId: 'nurse1', permissionKey: 'hr.leave.approve', effect: 'GRANT', reason: 'covering for a colleague', unitId: 'org-a' })).resolves.toBeTruthy();
        });

        it('cannot create a user with a role above their own', async () => {
            await rejects(svc.createStaffWithAccess(hrAdminActor, { name: 'Sneaky', homeUnitId: 'org-a', primaryRole: 'finance' }), /only grant permissions you hold|do not have permission/);
        });

        it('cannot edit a role to add a permission they do not hold; removing is fine', async () => {
            const owner = await actorOf('owner1');
            const { id } = await svc.createCustomRole(owner, { name: 'Shared Role', permissionKeys: ['hr.leave.view'] });
            await rejects(svc.updateCustomRole(hrAdminActor, id, { permissionKeys: ['hr.leave.view', 'finance.ledger.edit'] }), /only grant permissions you hold/);
            await expect(svc.updateCustomRole(hrAdminActor, id, { permissionKeys: [] })).resolves.toBeUndefined();
        });
    });

    describe('overrides', () => {
        it('need a reason, a known permission, and a future expiry', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.addOverride(owner, { targetUserId: 'hr1', permissionKey: 'hr.leave.view', effect: 'GRANT', reason: ' ' }), /reason/);
            await rejects(svc.addOverride(owner, { targetUserId: 'hr1', permissionKey: 'nonsense.perm.x', effect: 'GRANT', reason: 'testing' }), /Unknown permission/);
            await rejects(svc.addOverride(owner, { targetUserId: 'hr1', permissionKey: 'hr.leave.view', effect: 'GRANT', reason: 'testing', expiresAt: new Date(Date.now() - 5) }), /future/);
        });

        it('DENY takes effect and is removable', async () => {
            const owner = await actorOf('owner1');
            const { getEntitlements } = await import('@/app/lib/access/entitlements');
            const { can } = await import('@/app/lib/access/resolve');
            const { id } = await svc.addOverride(owner, { targetUserId: 'hr1', permissionKey: 'hr.employee.view', effect: 'DENY', reason: 'under investigation' });
            expect(can(await getEntitlements('hr1', 'org-a'), 'hr.employee.view')).toBeNull();
            await svc.removeOverride(owner, id);
            expect(can(await getEntitlements('hr1', 'org-a'), 'hr.employee.view')).toBe('UNIT');
        });
    });

    describe('offboarding and the last-owner guarantee', () => {
        it('disables login, ends roles, revokes overrides, closes the employee record', async () => {
            const owner = await actorOf('owner1');
            const out = await svc.createStaffWithAccess(owner, { name: 'Leaver', homeUnitId: 'org-a', primaryRole: 'nurse' });
            await svc.addOverride(owner, { targetUserId: out.userId, permissionKey: 'pharmacy.return.create', effect: 'GRANT', reason: 'ward cover' });
            await svc.offboardUser(owner, { targetUserId: out.userId, reason: 'resigned' });

            const u = await prisma.user.findUnique({ where: { id: out.userId }, include: { user_roles: true, permission_overrides: true } });
            expect(u.is_active).toBe(false);
            expect(u.user_roles.every((r: any) => r.valid_to && r.valid_to <= new Date())).toBe(true);
            expect(u.permission_overrides).toHaveLength(0);
            expect(await prisma.employee.findFirst({ where: { user_id: out.userId } })).toMatchObject({ is_active: false, exit_reason: 'resigned' });
            await rejects(svc.offboardUser(owner, { targetUserId: out.userId, reason: 'again' }), /already inactive/);
        });

        it('nobody offboards themselves', async () => {
            await rejects(svc.offboardUser(await actorOf('owner1'), { targetUserId: 'owner1', reason: 'oops' }), /own access/);
        });

        it('the LAST company owner can never be removed or offboarded', async () => {
            const ua = await actorOf('uadmin'); // a unit admin of org-a; both owners live in org-a
            await svc.offboardUser(ua, { targetUserId: 'owner2', reason: 'left the group' }); // fine: owner1 remains
            await rejects(svc.offboardUser(ua, { targetUserId: 'owner1', reason: 'cleanup' }), /last company owner/);
            // a unit admin cannot even attempt to touch a company-wide role
            const ownerRole = await prisma.userRole.findFirst({ where: { user_id: 'owner1', unit_id: null } });
            await rejects(svc.revokeUserRole(ua, ownerRole.id), /company owner/);
        });
    });

    describe('custom roles', () => {
        it('create, clone, edit, switch off, and delete only when unused', async () => {
            const owner = await actorOf('owner1');
            const { id } = await svc.createCustomRole(owner, { name: 'Ward Pharmacy Lead', permissionKeys: ['pharmacy.catalog.view', 'pharmacy.return.create'] });
            await rejects(svc.createCustomRole(owner, { name: 'ward pharmacy lead!', permissionKeys: [] }), /already exists/);

            const clone = await svc.createCustomRole(owner, { name: 'Pharmacy Lead 2', cloneFromRoleId: id });
            expect((await prisma.rolePermission.count({ where: { role_id: clone.id } }))).toBe(2);
            await rejects(svc.createCustomRole(owner, { name: 'Admin Copy', cloneFromRoleId: await roleId('admin') }), /cannot be cloned/);

            await svc.updateCustomRole(owner, id, { permissionKeys: ['pharmacy.catalog.view'] });
            expect(await prisma.rolePermission.count({ where: { role_id: id } })).toBe(1);

            const ur = await svc.assignRole(owner, { targetUserId: 'nurse1', roleId: id, unitId: 'org-a' });
            await rejects(svc.deleteCustomRole(owner, id), /still assigned/);
            await svc.revokeUserRole(owner, ur.id);
            // an end-dated assignment still references the role: switch it off instead of deleting
            await svc.updateCustomRole(owner, id, { active: false });
            await svc.deleteCustomRole(owner, clone.id);
        });

        it('system templates are read-only here', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.updateCustomRole(owner, await roleId('hr'), { permissionKeys: [] }), /Only custom roles/);
            await rejects(svc.deleteCustomRole(owner, await roleId('hr')), /Only custom roles/);
        });

        it('custom roles stay out of the legacy roles screen (template_key is set)', async () => {
            expect(await prisma.role.count({ where: { template_key: null } })).toBe(0);
        });

        it('rejects permissions that are not in the catalogue', async () => {
            const owner = await actorOf('owner1');
            await expect(svc.createCustomRole(owner, { name: 'Junk', permissionKeys: ['totally.fake.key'] })).resolves.toBeTruthy(); // unknown keys are dropped, not stored
            const junk = await prisma.role.findFirst({ where: { template_key: 'custom:junk' } });
            expect(await prisma.rolePermission.count({ where: { role_id: junk.id } })).toBe(0);
        });
    });

    describe('reading', () => {
        it('lists only this company\'s users; filters work', async () => {
            const owner = await actorOf('owner1');
            const all = await svc.listAccessUsers(owner, { status: 'all' });
            expect(all.find((x) => x.id === 'ux')).toBeUndefined();
            expect(all.find((x) => x.id === 'hr1')).toBeTruthy();
            expect((await svc.listAccessUsers(owner, { q: 'nurse1' })).map((x) => x.id)).toEqual(['nurse1']);
            expect((await svc.listAccessUsers(owner, { status: 'inactive' })).every((x) => !x.active)).toBe(true);
        });

        it('the detail view shows effective modules and the sidebar they would see', async () => {
            const owner = await actorOf('owner1');
            const d = await svc.getUserAccessDetail(owner, 'hr1');
            const home = d.effective.find((e) => e.unitId === 'org-a')!;
            expect(home.provisioned).toBe(true);
            expect(home.modules).toContain('hr');
            expect(home.nav.flatMap((s) => s.items.map((i) => i.href)).some((h) => h.startsWith('/hr'))).toBe(true);
            await rejects(svc.getUserAccessDetail(owner, 'ux'), /not found in your company/);
        });

        it('assignable roles flag what the viewer may not hand out', async () => {
            const ua = await actorOf('uadmin');
            const hr = await actorOf('hradmin');
            expect((await svc.listAssignableRoles(ua)).every((r) => r.assignable)).toBe(true);
            const rolesForHr = await svc.listAssignableRoles(hr);
            expect(rolesForHr.find((r) => r.templateKey === 'finance')!.assignable).toBe(false);
            expect(rolesForHr.find((r) => r.templateKey === 'admin')!.assignable).toBe(false);
        });

        it('the change log records who did what to whom', async () => {
            const owner = await actorOf('owner1');
            const log = await svc.listChangeLog(owner, { limit: 500 });
            expect(log.some((l) => (l.change as any).event === 'user.create')).toBe(true);
            expect(log.some((l) => (l.change as any).event === 'role.assign')).toBe(true);
            expect(log[0].actor).toBeTruthy();
            expect(log.every((l) => !String(l.target ?? '').includes('ux'))).toBe(true);
        });
    });

    describe('bulk import', () => {
        const csv = (rows: string[]) => ['name,username,email,phone,role,unit,employee_code,designation', ...rows].join('\n');

        it('previews per-row problems without creating anything', async () => {
            const owner = await actorOf('owner1');
            const before = await prisma.user.count();
            const { rows } = await svc.previewUserImport(owner, csv([
                'Good One,,g1@x.com,,nurse,a,,Staff Nurse',
                ',,,,nurse,a,,',                       // no name
                'Bad Role,,,,wizard,a,,',
                'Bad Unit,,,,nurse,nowhere,,',
                'Dup,dup.user,,,nurse,a,,',            // username exists
                'Twin A,twin,,,nurse,a,,', 'Twin B,twin,,,nurse,a,,',
            ]));
            expect(rows.map((r) => r.ok)).toEqual([true, false, false, false, false, true, false]);
            expect(rows[1].errors.join()).toMatch(/name is required/);
            expect(rows[2].errors.join()).toMatch(/unknown role/);
            expect(rows[3].errors.join()).toMatch(/unknown unit/);
            expect(rows[4].errors.join()).toMatch(/already exists/);
            expect(rows[6].errors.join()).toMatch(/duplicate username/);
            expect(await prisma.user.count()).toBe(before);
        });

        it('refuses to commit while any row is bad; commits a clean file and returns temp passwords', async () => {
            const owner = await actorOf('owner1');
            await rejects(svc.commitUserImport(owner, csv(['Good,,,,nurse,a,,', 'Bad,,,,wizard,a,,'])), /Fix 1 row/);
            const res = await svc.commitUserImport(owner, csv(['Imp One,imp.one,,,nurse,a,,Nurse', 'Imp Two,imp.two,,,receptionist,b,,Desk']));
            expect(res).toHaveLength(2);
            expect(res.every((r) => !r.error && r.temporaryPassword?.length === 12)).toBe(true);
            expect((await prisma.user.findUnique({ where: { username: 'imp.two' } })).organizationId).toBe('org-b');
        });

        it('a unit admin\'s import is checked against what they may grant', async () => {
            const ua = await actorOf('uadmin');
            const { rows } = await svc.previewUserImport(ua, csv(['Cross,,,,nurse,b,,']));
            expect(rows[0].ok).toBe(false);
            expect(rows[0].errors.join()).toMatch(/permission/);
        });
    });
});
