/**
 * Per-employee access profiles against a real database (skipped without TEST_DATABASE_URL — see
 * scripts/test-integration.sh). Exercises HR/Admin onboarding end to end: create a login with a module profile, the
 * "HR can't hand out Admin / Finance" rule, base-role syncing, claims, and shipping before the migration is applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('per-employee access profiles', () => {
    let prisma: any;
    let svc: typeof import('@/app/lib/access/profile-service');
    let store: typeof import('@/app/lib/access/profile-store');
    let ents: typeof import('@/app/lib/access/entitlements');
    let claimsServer: typeof import('@/app/lib/access/claims-server');
    let resolve: typeof import('@/app/lib/access/resolve');
    const env = { ...process.env, DATABASE_URL: URL_, DIRECT_URL: URL_, JWT_SECRET: 'x' };
    const run = (cmd: string) => execSync(cmd, { env, stdio: 'pipe', cwd: process.cwd() }).toString();

    const actorOf = async (id: string) => {
        const u = await prisma.user.findUnique({ where: { id }, select: { organizationId: true, role: true } });
        return svc.loadProfileActor({ id, role: u.role, organization_id: u.organizationId });
    };
    const rejects = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };
    const newEmployee = async (name: string, org = 'org-a') => {
        const n = await prisma.employee.count();
        return prisma.employee.create({ data: { name, designation: 'Staff', employee_code: `T-${n + 1}-${name}`.replace(/\s/g, ''), date_of_joining: new Date(), organizationId: org } });
    };

    beforeAll(async () => {
        process.env.DATABASE_URL = URL_; process.env.DIRECT_URL = URL_; process.env.JWT_SECRET = 'x';
        const { PrismaClient } = await import('@prisma/client');
        prisma = new PrismaClient();

        await prisma.organization.createMany({ data: [
            { id: 'org-a', name: 'Hospital A', slug: 'a', code: 'A' }, { id: 'org-b', name: 'Hospital B', slug: 'b', code: 'B' },
        ] });
        const u = (id: string, role: string, organizationId = 'org-a') => ({ id, username: id, password: 'x', role, organizationId, name: id });
        await prisma.user.createMany({ data: [
            u('admin1', 'admin'), u('hr1', 'hr'), u('hr2', 'hr'), u('rec1', 'receptionist'), u('fin1', 'finance'), u('nurse1', 'nurse'),
        ] });
        run('npx tsx scripts/backfill-company-os.ts --company-name Test --apply --yes --out /tmp/ap-backfill.json');
        run('npx tsx scripts/seed-access-permissions.ts --apply --yes');

        // an unrelated company must stay invisible
        const c2 = await prisma.company.create({ data: { name: 'Other', slug: 'other' } });
        await prisma.organization.create({ data: { id: 'org-x', name: 'X', slug: 'x', code: 'X', company_id: c2.id } });
        await prisma.user.create({ data: { id: 'ux', username: 'ux', password: 'x', role: 'hr', organizationId: 'org-x', company_id: c2.id, name: 'ux' } });
        await prisma.employee.create({ data: { id: 9001, user_id: 'ux', name: 'ux', designation: 'x', employee_code: 'X-1', date_of_joining: new Date(), organizationId: 'org-x' } });

        svc = await import('@/app/lib/access/profile-service');
        store = await import('@/app/lib/access/profile-store');
        ents = await import('@/app/lib/access/entitlements');
        claimsServer = await import('@/app/lib/access/claims-server');
        resolve = await import('@/app/lib/access/resolve');
    }, 180_000);

    afterAll(async () => { await prisma?.$disconnect(); });

    it('admin is an administrator; HR holds the assign right but is not an administrator', async () => {
        expect((await actorOf('admin1')).isAdmin).toBe(true);
        const hr = await actorOf('hr1');
        expect(hr.isAdmin).toBe(false);
        expect(resolve.can(hr.ent, 'hr.access.assign')).not.toBeNull();
        expect(resolve.can((await actorOf('rec1')).ent, 'hr.access.assign')).toBeNull();
    });

    describe('HR gives an employee a login with a module profile', () => {
        let userId: string;
        let empId: number;

        it('creates login + role + profile + log atomically, with a hashed temporary password', async () => {
            const hr = await actorOf('hr1');
            const emp = await newEmployee('Asha');
            empId = emp.id;
            const out = await svc.createLoginForEmployee(hr, emp.id, {
                profile: { preset: 'receptionist', modules: ['reception', 'billing'], permissions: {} },
            });
            userId = out.userId;
            expect(out.username).toBe(emp.employee_code);
            expect(out.temporaryPassword).toHaveLength(12);

            const user = await prisma.user.findUnique({ where: { id: userId }, include: { user_roles: { include: { role: true } }, access_profile: true } });
            expect(user).toMatchObject({ role: 'receptionist', organizationId: 'org-a', is_active: true });
            expect(user.company_id).toBeTruthy();
            expect(await bcrypt.compare(out.temporaryPassword!, user.password)).toBe(true);
            expect(user.user_roles.map((r: any) => r.role.template_key)).toEqual(['receptionist']);
            expect(user.access_profile).toMatchObject({ preset: 'receptionist', modules: ['billing', 'reception'], company_id: user.company_id });
            expect((await prisma.employee.findUnique({ where: { id: emp.id } })).user_id).toBe(userId);
            const log = await prisma.accessChangeLog.findFirst({ where: { target_user_id: userId } });
            expect(log.change).toMatchObject({ event: 'login.create', modulesAdded: ['billing', 'reception'] });
        });

        it('the engine now treats them as managed, with exactly those apps', async () => {
            const ent = await ents.getEntitlements(userId, 'org-a');
            expect(ent.managed).toBe(true);
            expect(ent.provisioned).toBe(true);
            expect([...ent.appModules].sort()).toEqual(['billing', 'ess', 'help_center', 'notifications', 'reception']);
            expect(resolve.can(ent, 'hr.employee.view')).toBeNull();
            expect(await store.isProfileManaged(userId)).toBe(true);
        });

        it('claims are minted for them even though the unit is on the default legacy flag', async () => {
            const claims = await claimsServer.buildAccessClaims({ id: userId, role: 'receptionist', organization_id: 'org-a' });
            expect(claims).not.toBeNull();
            expect(claims!.mods).toEqual(['billing', 'ess', 'help_center', 'notifications', 'reception']);
            // ... and NOT for someone with no profile
            expect(await claimsServer.buildAccessClaims({ id: 'rec1', role: 'receptionist', organization_id: 'org-a' })).toBeNull();
        });

        it('rejects a taken username, a short password, a login for someone who has one, and an unknown module', async () => {
            const hr = await actorOf('hr1');
            const e2 = await newEmployee('Bela');
            const profile = { preset: 'nurse', modules: ['nurse'], permissions: {} };
            await rejects(svc.createLoginForEmployee(hr, e2.id, { username: 'rec1', profile }), /already taken/);
            await rejects(svc.createLoginForEmployee(hr, e2.id, { password: 'short', profile }), /at least 8/);
            await rejects(svc.createLoginForEmployee(hr, empId, { profile }), /already has a login/);
            await rejects(svc.createLoginForEmployee(hr, e2.id, { profile: { ...profile, modules: ['nope'] } }), /cannot be given/);
        });

        it('HR cannot give Finance / Insurance / the Finance base role / the assign right', async () => {
            const hr = await actorOf('hr1');
            const e = await newEmployee('Chitra');
            await rejects(svc.createLoginForEmployee(hr, e.id, { profile: { preset: 'receptionist', modules: ['reception', 'finance'], permissions: {} } }), /administrator can change Finance/);
            await rejects(svc.createLoginForEmployee(hr, e.id, { profile: { preset: 'receptionist', modules: ['insurance'], permissions: {} } }), /administrator can change Finance/);
            await rejects(svc.createLoginForEmployee(hr, e.id, { profile: { preset: 'finance', modules: ['finance'], permissions: {} } }), /Admin or Finance base role/);
            await rejects(svc.createLoginForEmployee(hr, e.id, { profile: { preset: 'hr', modules: ['hr'], permissions: { 'hr.access.assign': 'UNIT' } } }), /administrator can change Finance/);
            expect((await prisma.employee.findUnique({ where: { id: e.id } })).user_id).toBeNull(); // nothing half-created
            // but an administrator can
            const out = await svc.createLoginForEmployee(await actorOf('admin1'), e.id, { profile: { preset: 'receptionist', modules: ['reception', 'finance'], permissions: { 'finance.ledger.view': 'UNIT' } } });
            expect((await ents.getEntitlements(out.userId, 'org-a')).modules.has('finance')).toBe(true);
        });

        it('changing the base role swaps the primary access template and users.role', async () => {
            const hr = await actorOf('hr1');
            await svc.saveProfile(hr, userId, { preset: 'lab_technician', modules: ['lab'], permissions: {} });
            const user = await prisma.user.findUnique({ where: { id: userId }, include: { user_roles: { include: { role: true } } } });
            expect(user.role).toBe('lab_technician');
            expect(user.user_roles.filter((r: any) => r.is_primary).map((r: any) => r.role.template_key)).toEqual(['lab_technician']);
            expect(user.user_roles).toHaveLength(1);
            const log = await prisma.accessChangeLog.findFirst({ where: { target_user_id: userId }, orderBy: { created_at: 'desc' } });
            expect(log.change).toMatchObject({ event: 'profile.update', presetFrom: 'receptionist', presetTo: 'lab_technician', modulesAdded: ['lab'] });
        });

        it('bumps access_version so caches refresh at once', async () => {
            const before = (await prisma.user.findUnique({ where: { id: userId } })).access_version;
            await svc.saveProfile(await actorOf('hr1'), userId, { preset: 'lab_technician', modules: ['lab', 'pharmacy'], permissions: { 'pharmacy.catalog.view': 'UNIT' } });
            expect((await prisma.user.findUnique({ where: { id: userId } })).access_version).toBeGreaterThan(before);
            const ent = await ents.getEntitlements(userId, 'org-a');
            expect(resolve.can(ent, 'pharmacy.catalog.view')).toBe('UNIT');
            expect(resolve.can(ent, 'pharmacy.dispense.execute')).toBeNull();
        });
    });

    describe('who may be edited by whom', () => {
        it('nobody edits their own access; HR cannot touch an administrator', async () => {
            const hr = await actorOf('hr1');
            await rejects(svc.saveProfile(hr, 'hr1', { preset: 'hr', modules: ['hr'], permissions: {} }), /own access/);
            await rejects(svc.saveProfile(hr, 'admin1', { preset: 'receptionist', modules: ['reception'], permissions: {} }), /Administrators are managed/);
        });

        it('HR cannot convert or strip an existing Finance user; an administrator can', async () => {
            const hr = await actorOf('hr1');
            await rejects(svc.saveProfile(hr, 'fin1', { preset: 'receptionist', modules: ['reception'], permissions: {} }), /Admin or Finance/);
            await rejects(svc.saveProfile(hr, 'fin1', { preset: 'finance', modules: ['billing'], permissions: {} }), /administrator can change/);
            await svc.saveProfile(await actorOf('admin1'), 'fin1', { preset: 'finance', modules: ['finance', 'billing', 'insurance'], permissions: {} });
            // HR may then edit the NON-restricted part while leaving finance exactly as it is
            await svc.saveProfile(hr, 'fin1', { preset: 'finance', modules: ['finance', 'billing', 'insurance', 'print_center'], permissions: {} });
            expect((await prisma.userAccessProfile.findUnique({ where: { user_id: 'fin1' } })).modules).toContain('print_center');
            // ... but not remove finance
            await rejects(svc.saveProfile(hr, 'fin1', { preset: 'finance', modules: ['billing'], permissions: {} }), /administrator can change/);
        });

        it('another company is invisible', async () => {
            const hr = await actorOf('hr1');
            await rejects(svc.saveProfile(hr, 'ux', { preset: 'hr', modules: ['hr'], permissions: {} }), /not found in your company/);
            await rejects(svc.getEmployeeAccess(hr, 9001), /Employee not found/);
            await rejects(svc.createLoginForEmployee(hr, 9001, { profile: { preset: 'nurse', modules: ['nurse'], permissions: {} } }), /Employee not found/);
        });

        it('modules the company does not have are refused', async () => {
            const hr = await actorOf('hr1');
            await prisma.companyModule.deleteMany({ where: { module_key: 'crm' } });
            ents.clearEntitlementCache();
            await rejects(svc.saveProfile(await actorOf('hr1'), 'nurse1', { preset: 'nurse', modules: ['nurse', 'crm'], permissions: {} }), /Not available to this company/);
            void hr;
        });
    });

    describe('reset, status and the login switch', () => {
        it('status reports managed + module count; reset returns to the base role', async () => {
            const admin = await actorOf('admin1');
            await svc.saveProfile(admin, 'rec1', { preset: 'receptionist', modules: ['reception', 'billing', 'lab'], permissions: {} });
            const emp = await prisma.employee.findFirst({ where: { user_id: 'rec1' } });
            const st = await svc.getAccessStatus(await actorOf('hr1'), [emp.id]);
            expect(st[emp.id]).toMatchObject({ hasLogin: true, managed: true, moduleCount: 3, role: 'receptionist' });

            const detail = await svc.getEmployeeAccess(await actorOf('hr1'), emp.id);
            expect(detail.profile?.modules).toEqual(['billing', 'lab', 'reception']);
            expect(detail.canEdit).toBe(true);

            await svc.removeProfile(await actorOf('hr1'), 'rec1');
            expect(await store.hasProfileRow('rec1')).toBe(false);
            expect(await store.isProfileManaged('rec1')).toBe(false); // cache cleared by the write
            expect((await ents.getEntitlements('rec1', 'org-a')).managed).toBe(false);
            await rejects(svc.removeProfile(await actorOf('hr1'), 'rec1'), /no custom access profile/);
        });

        it('HR can switch a login off and on, never their own, never an administrator’s', async () => {
            const hr = await actorOf('hr1');
            const emp = await prisma.employee.findFirst({ where: { user_id: 'nurse1' } });
            expect(await svc.setLoginActive(hr, emp.id, false)).toEqual({ changed: true });
            expect((await prisma.user.findUnique({ where: { id: 'nurse1' } })).is_active).toBe(false);
            expect(await svc.setLoginActive(hr, emp.id, false)).toEqual({ changed: false });
            expect(await svc.setLoginActive(hr, emp.id, true)).toEqual({ changed: true });
            const own = await prisma.employee.findFirst({ where: { user_id: 'hr1' } });
            await rejects(svc.setLoginActive(hr, own.id, false), /your own login/);
            const adm = await prisma.employee.findFirst({ where: { user_id: 'admin1' } });
            await rejects(svc.setLoginActive(hr, adm.id, false), /administrator/);
        });

        it('HR can reset a normal employee’s password (hashed, shown once) but never an administrator’s, a Finance user’s, another HR’s or their own', async () => {
            const hr = await actorOf('hr1');
            const empOf = async (uid: string) => (await prisma.employee.findFirst({ where: { user_id: uid } })).id;
            const out = await svc.resetLoginPassword(hr, await empOf('nurse1'));
            expect(out.temporaryPassword).toHaveLength(12);
            expect(await bcrypt.compare(out.temporaryPassword!, (await prisma.user.findUnique({ where: { id: 'nurse1' } })).password)).toBe(true);
            expect((await svc.resetLoginPassword(hr, await empOf('nurse1'), 'ChosenPass123')).temporaryPassword).toBeNull();
            await rejects(svc.resetLoginPassword(hr, await empOf('nurse1'), 'short'), /at least 8/);
            await rejects(svc.resetLoginPassword(hr, await empOf('admin1')), /administrator/);
            await rejects(svc.resetLoginPassword(hr, await empOf('fin1')), /Finance, Insurance/);
            await rejects(svc.resetLoginPassword(hr, await empOf('hr2')), /Finance, Insurance|assign access/);
            await rejects(svc.resetLoginPassword(hr, await empOf('hr1')), /your own/);
            // the same HR user cannot disable a Finance user either
            await rejects(svc.setLoginActive(hr, await empOf('fin1'), false), /Finance, Insurance/);
            // an administrator can
            expect((await svc.resetLoginPassword(await actorOf('admin1'), await empOf('fin1'))).temporaryPassword).toHaveLength(12);
            const log = await prisma.accessChangeLog.findFirst({ where: { target_user_id: 'fin1' }, orderBy: { created_at: 'desc' } });
            expect(log.change).toMatchObject({ event: 'login.password_reset' });
        });

        it('a switched-off login cannot be given a profile', async () => {
            const hr = await actorOf('hr1');
            const emp = await prisma.employee.findFirst({ where: { user_id: 'nurse1' } });
            await svc.setLoginActive(hr, emp.id, false);
            await rejects(svc.saveProfile(hr, 'nurse1', { preset: 'nurse', modules: ['nurse'], permissions: {} }), /switched off/);
            await svc.setLoginActive(hr, emp.id, true);
        });
    });

    describe('shipping the code before the migration is applied', () => {
        it('with the table missing, nobody is managed and nothing throws; re-applying the migration restores it', async () => {
            await store.saveProfileRow({ userId: 'hr2', companyId: null, actorId: 'admin1', profile: { preset: 'hr', modules: ['hr'], permissions: {} } });
            expect(await store.hasProfileRow('hr2')).toBe(true);

            await prisma.$executeRawUnsafe('DROP TABLE "user_access_profiles"');
            store.clearManagedCache();
            ents.clearEntitlementCache();
            expect(await store.hasProfileRow('hr2')).toBe(false);
            expect(await store.isProfileManaged('hr2')).toBe(false);
            expect(await store.loadProfile('hr2')).toBeNull();
            const ent = await ents.getEntitlements('hr2', 'org-a');
            expect(ent.managed).toBe(false);
            expect(await claimsServer.buildAccessClaims({ id: 'hr2', role: 'hr', organization_id: 'org-a' })).toBeNull();
            expect(await svc.getAccessStatus(await actorOf('hr1'), [1])).toBeTruthy();

            // the real migration file re-creates it (and is idempotent)
            const file = 'prisma/migrations/20261023120000_user_access_profiles/migration.sql';
            run(`psql "${URL_}" -q -v ON_ERROR_STOP=1 -f ${file}`);
            run(`psql "${URL_}" -q -v ON_ERROR_STOP=1 -f ${file}`);
            expect(await store.hasProfileRow('hr2')).toBe(false);
            await store.saveProfileRow({ userId: 'hr2', companyId: null, actorId: 'admin1', profile: { preset: 'hr', modules: ['hr'], permissions: {} } });
            expect(await store.hasProfileRow('hr2')).toBe(true);
        });
    });
});
