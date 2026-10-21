/**
 * Database-backed tests for the access engine. Skipped unless TEST_DATABASE_URL is set
 * (use `npm run test:integration`, which wipes and rebuilds a throwaway database first).
 *
 * Covers what the mocked unit tests cannot: the loader's real queries (time/unit filtering), overrides, module
 * toggles, version-based cache invalidation, the Phase 2 backfill + permission seeding end to end, and the real
 * shadow-log write.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';

const URL_ = process.env.TEST_DATABASE_URL;
const HO = '9bd49bae-cecc-49f8-b18d-88f146124a98';

const getSession = vi.fn();
vi.mock('@/app/lib/session', () => ({ getSession: () => getSession(), getPatientSession: vi.fn(), getDevPortalSession: vi.fn() }));

describe.skipIf(!URL_)('access engine against a real database', () => {
    let prisma: any;
    let getEntitlements: typeof import('@/app/lib/access/entitlements').getEntitlements;
    let clearEntitlementCache: typeof import('@/app/lib/access/entitlements').clearEntitlementCache;
    let can: typeof import('@/app/lib/access/resolve').can;
    let requireAccess: typeof import('@/app/lib/access/require-access').requireAccess;
    let buildAccessClaims: typeof import('@/app/lib/access/claims-server').buildAccessClaims;
    let clearFlagCache: () => void;

    const env = { ...process.env, DATABASE_URL: URL_, DIRECT_URL: URL_, JWT_SECRET: 'x' };
    const run = (cmd: string) => execSync(cmd, { env, stdio: 'pipe', cwd: process.cwd() }).toString();

    beforeAll(async () => {
        process.env.DATABASE_URL = URL_; process.env.DIRECT_URL = URL_; process.env.JWT_SECRET = 'x';
        const { PrismaClient } = await import('@prisma/client');
        prisma = new PrismaClient();

        await prisma.organization.createMany({ data: [
            { id: HO, name: 'HO', slug: 'ho', code: 'HO' }, { id: 'org-a', name: 'A', slug: 'a', code: 'A' }, { id: 'org-b', name: 'B', slug: 'b', code: 'B' },
        ] });
        const u = (id: string, role: string, organizationId: string, extra: object = {}) => ({ id, username: id, password: 'x', role, organizationId, name: id, ...extra });
        await prisma.user.createMany({ data: [
            u('admin1', 'admin', HO, { can_access_all_units: true }), u('doc1', 'doctor', 'org-a'), u('hr1', 'hr', 'org-a'),
            u('nurse1', 'nurse', 'org-a'), u('pharm1', 'pharmacist', 'org-b'), u('rec1', 'receptionist', 'org-a'), u('mystery', 'mystery_role', 'org-b'),
        ] });
        await prisma.userUnitAccess.create({ data: { userId: 'rec1', organizationId: 'org-b' } });

        // the real scripts, end to end
        run('npx tsx scripts/backfill-company-os.ts --company-name Test --apply --yes --out /tmp/it-backfill.json');
        run('npx tsx scripts/seed-access-permissions.ts --apply --yes');

        ({ getEntitlements, clearEntitlementCache } = await import('@/app/lib/access/entitlements'));
        ({ can } = await import('@/app/lib/access/resolve'));
        ({ requireAccess } = await import('@/app/lib/access/require-access'));
        ({ buildAccessClaims } = await import('@/app/lib/access/claims-server'));
        ({ clearFlagCache } = await import('@/app/lib/feature-flags'));
    }, 120_000);

    afterAll(async () => { await prisma?.$disconnect(); });

    const ent = (user: string, unit: string) => getEntitlements(user, unit);

    it('the backfill + seeding leave the access diff empty', () => {
        const out = run('npx tsx scripts/backfill-company-os.ts --verify --out /tmp/it-verify.json');
        expect(out).toContain('Access diff is empty');
        expect(run('npx tsx scripts/seed-access-permissions.ts --verify')).toContain('missing rows: 0');
    });

    it('roles resolve to the same decisions the legacy rules gave', async () => {
        const hr = await ent('hr1', 'org-a');
        expect(hr.provisioned).toBe(true);
        expect(can(hr, 'hr.employee.view')).toBe('UNIT');
        expect(can(hr, 'hr.leave.approve')).toBe('UNIT');
        expect(can(hr, 'pharmacy.dispense.execute')).toBeNull();

        const doc = await ent('doc1', 'org-a');
        expect(can(doc, 'hr.employee.view')).toBeNull();
        expect(can(doc, 'pharmacy.catalog.view')).toBe('UNIT');
        expect(can(doc, 'pharmacy.dispense.execute')).toBeNull();
    });

    it('seeded (no-legacy-key) permissions follow the old hand-written lists', async () => {
        expect(can(await ent('nurse1', 'org-a'), 'pharmacy.return.create')).toBe('UNIT'); // nurses file returns
        expect(can(await ent('pharm1', 'org-b'), 'pharmacy.return.create')).toBe('UNIT');
        expect(can(await ent('doc1', 'org-a'), 'pharmacy.return.create')).toBeNull();
        expect(can(await ent('nurse1', 'org-a'), 'pharmacy.indent.cancel')).toBe('UNIT');
    });

    it('admin holds every catalogue permission in its unit', async () => {
        const a = await ent('admin1', HO);
        for (const k of ['hr.leave.approve', 'pharmacy.return.create', 'finance.ledger.edit']) expect(can(a, k)).toBe('UNIT');
    });

    it('unit access: a role granted in another unit applies there and only there', async () => {
        expect(can(await ent('rec1', 'org-b'), 'finance.ledger.view')).toBe('UNIT');
        const away = await ent('rec1', 'org-zzz');
        expect(can(away, 'finance.ledger.view')).toBeNull();
    });

    it('a user with an unknown role is not provisioned (enforce would fall back to legacy)', async () => {
        const m = await ent('mystery', 'org-b');
        expect(m.provisioned).toBe(false);
        expect(m.permissions.has('hr.view')).toBe(false);
    });

    it('an expired role assignment is ignored; a future one too', async () => {
        const doc = await prisma.userRole.findFirst({ where: { user_id: 'doc1' } });
        await prisma.userRole.update({ where: { id: doc.id }, data: { valid_to: new Date(Date.now() - 1000) } });
        await prisma.user.update({ where: { id: 'doc1' }, data: { access_version: { increment: 1 } } }); // what the admin UI will do
        expect(can(await ent('doc1', 'org-a'), 'pharmacy.catalog.view')).toBeNull();
        await prisma.userRole.update({ where: { id: doc.id }, data: { valid_to: null, valid_from: new Date(Date.now() + 3_600_000) } });
        await prisma.user.update({ where: { id: 'doc1' }, data: { access_version: { increment: 1 } } });
        expect(can(await ent('doc1', 'org-a'), 'pharmacy.catalog.view')).toBeNull();
        await prisma.userRole.update({ where: { id: doc.id }, data: { valid_from: new Date(Date.now() - 1000) } });
        await prisma.user.update({ where: { id: 'doc1' }, data: { access_version: { increment: 1 } } });
        expect(can(await ent('doc1', 'org-a'), 'pharmacy.catalog.view')).toBe('UNIT');
    });

    it('overrides: GRANT adds, DENY removes, expired ones are ignored; the version bump refreshes the cache', async () => {
        const before = await ent('doc1', 'org-a');
        expect(can(before, 'hr.employee.view')).toBeNull();

        await prisma.userPermissionOverride.createMany({ data: [
            { user_id: 'doc1', permission_key: 'hr.employee.view', effect: 'GRANT', scope: 'TEAM', reason: 'covering HR', granted_by: 'admin1' },
            { user_id: 'doc1', permission_key: 'pharmacy.catalog.view', effect: 'DENY', reason: 'no pharmacy for now', granted_by: 'admin1' },
            { user_id: 'doc1', permission_key: 'hr.leave.view', effect: 'GRANT', reason: 'expired', granted_by: 'admin1', expires_at: new Date(Date.now() - 1000) },
        ] });
        // WITHOUT a version bump the cached entitlements are served — the documented TTL behaviour
        expect(can(await ent('doc1', 'org-a'), 'hr.employee.view')).toBeNull();
        await prisma.user.update({ where: { id: 'doc1' }, data: { access_version: { increment: 1 } } });
        const after = await ent('doc1', 'org-a');
        expect(can(after, 'hr.employee.view')).toBe('TEAM'); // the override's own scope, not widened to UNIT
        expect(can(after, 'pharmacy.catalog.view')).toBeNull();
        expect(can(after, 'hr.leave.view')).toBeNull();
    });

    it('a module switched off for ONE unit disappears there only', async () => {
        await prisma.moduleConfig.create({ data: { organizationId: 'org-a', module_key: 'hr', enabled: false } });
        await prisma.company.updateMany({ data: { module_version: { increment: 1 } } });
        clearEntitlementCache();
        expect(can(await ent('hr1', 'org-a'), 'hr.employee.view')).toBeNull();
        await prisma.moduleConfig.delete({ where: { organizationId_module_key: { organizationId: 'org-a', module_key: 'hr' } } });
        await prisma.company.updateMany({ data: { module_version: { increment: 1 } } });
        expect(can(await ent('hr1', 'org-a'), 'hr.employee.view')).toBe('UNIT');
    });

    it('a deactivated user holds nothing', async () => {
        await prisma.user.update({ where: { id: 'hr1' }, data: { is_active: false, access_version: { increment: 1 } } });
        const e = await ent('hr1', 'org-a');
        expect(e.modules.size).toBe(0);
        expect(can(e, 'ess.self.view')).toBeNull();
        await prisma.user.update({ where: { id: 'hr1' }, data: { is_active: true, access_version: { increment: 1 } } });
    });

    describe('requireAccess end to end', () => {
        const sess = (id: string, role: string, org: string) => ({ id, username: id, role, name: id, specialty: null, organization_id: org, organization_slug: org, organization_name: org });
        const setMode = async (org: string, mode: string) => {
            await prisma.featureFlag.upsert({
                where: { scope_type_scope_id_key: { scope_type: 'organization', scope_id: org, key: 'access_engine' } },
                create: { scope_type: 'organization', scope_id: org, key: 'access_engine', value: mode }, update: { value: mode },
            });
            clearFlagCache();
        };
        const deny = async () => { throw new Error('legacy says no'); };

        it('legacy: no table reads beyond the flag, the old check decides', async () => {
            await setMode('org-a', 'legacy');
            getSession.mockResolvedValue(sess('hr1', 'hr', 'org-a'));
            await expect(requireAccess('hr.employee.view', { legacy: deny })).rejects.toThrow('legacy says no');
            expect(await prisma.accessShadowLog.count()).toBe(0);
        });

        it('shadow: writes a REAL disagreement row, still obeys the old check', async () => {
            await setMode('org-a', 'shadow');
            getSession.mockResolvedValue(sess('hr1', 'hr', 'org-a'));
            await expect(requireAccess('hr.employee.view', { legacy: deny, target: 'getEmployeeList' })).rejects.toThrow('legacy says no');
            const rows = await prisma.accessShadowLog.findMany();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ user_id: 'hr1', permission: 'hr.employee.view', target: 'getEmployeeList', legacy: false, next: true });
            expect(rows[0].company_id).toBeTruthy();
        });

        it('enforce: the engine decides, scope narrows the query', async () => {
            await setMode('org-a', 'enforce');
            getSession.mockResolvedValue(sess('hr1', 'hr', 'org-a'));
            const ctx = await requireAccess('hr.leave.approve', { legacy: deny });
            expect(ctx.scope).toBe('UNIT');
            getSession.mockResolvedValue(sess('doc1', 'doctor', 'org-a'));
            await expect(requireAccess('hr.leave.approve', { legacy: async () => undefined })).rejects.toThrow(/required/);
        });

        it('enforce: an unprovisioned user is not locked out — the old check still decides', async () => {
            await setMode('org-b', 'enforce');
            getSession.mockResolvedValue(sess('mystery', 'mystery_role', 'org-b'));
            await expect(requireAccess('hr.leave.view', { legacy: async () => undefined })).resolves.toBeTruthy();
            await expect(requireAccess('hr.leave.view', { legacy: deny })).rejects.toThrow('legacy says no');
        });

        it('claims are minted only in enforce mode and only for provisioned users', async () => {
            await setMode('org-a', 'shadow');
            expect(await buildAccessClaims({ id: 'hr1', role: 'hr', organization_id: 'org-a' })).toBeNull();
            await setMode('org-a', 'enforce');
            const c = await buildAccessClaims({ id: 'hr1', role: 'hr', organization_id: 'org-a' });
            expect(c).toMatchObject({ ae: 'enforce' });
            expect(c!.mods).toContain('hr');
            expect(c!.mods).toContain('ess');
            expect(c!.mods).not.toContain('pharmacy'); // hr role holds no pharmacy permission
            expect(c!.mods).toContain('crm'); // unmigrated + never gated → stays open exactly as today
            await setMode('org-b', 'enforce');
            expect(await buildAccessClaims({ id: 'mystery', role: 'mystery_role', organization_id: 'org-b' })).toBeNull();
        });
    });
});
