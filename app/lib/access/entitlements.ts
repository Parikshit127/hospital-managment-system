import { prisma } from '@/backend/db';
import type { DataScope } from '../modules/types';
import { isDataScope } from './permissions';
import { resolveEntitlements, type Entitlements } from './resolve';
import { loadProfile } from './profile-store';

/**
 * Entitlement loader — reads the Phase 2 tables and hands them to the pure resolver (resolve.ts).
 * Server-only. NOTHING calls this while a company's `access_engine` flag is `legacy`.
 *
 * Cost: two small indexed reads per call to learn the version (user.access_version, company.module_version);
 * the full load (6 queries) only happens when the version or the 60 s TTL changes. Bump
 * `users.access_version` on any role/override change and `companies.module_version` on any
 * plan/module/ModuleConfig change and every cache in the fleet refreshes within one request.
 */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; ent: Entitlements }>();

export function clearEntitlementCache(): void {
    cache.clear();
}

export async function getEntitlements(userId: string, unitId: string): Promise<Entitlements> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, is_active: true, company_id: true, access_version: true },
    });
    if (!user) return resolveEntitlements(emptyInput(userId, unitId, '0.0', false));

    const company = user.company_id
        ? await prisma.company.findUnique({ where: { id: user.company_id }, select: { id: true, module_version: true, is_active: true } })
        : null;
    const version = `${company?.module_version ?? 0}.${user.access_version}`;

    const key = `${userId}:${unitId}:${version}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.ent;

    const now = new Date();
    const [companyModules, disabledConfigs, userRoles, overrides, employee, profile] = await Promise.all([
        company && company.is_active
            ? prisma.companyModule.findMany({
                where: { company_id: company.id, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
                select: { module_key: true },
            })
            : Promise.resolve([] as { module_key: string }[]),
        prisma.moduleConfig.findMany({ where: { organizationId: unitId, enabled: false }, select: { module_key: true } }),
        prisma.userRole.findMany({
            where: {
                user_id: userId,
                valid_from: { lte: now },
                AND: [{ OR: [{ valid_to: null }, { valid_to: { gt: now } }] }, { OR: [{ unit_id: null }, { unit_id: unitId }] }],
            },
            select: {
                unit_id: true,
                role: { select: { template_key: true, is_active: true, role_permissions: { select: { permission_key: true, scope: true } } } },
            },
        }),
        prisma.userPermissionOverride.findMany({
            where: {
                user_id: userId,
                AND: [{ OR: [{ expires_at: null }, { expires_at: { gt: now } }] }, { OR: [{ unit_id: null }, { unit_id: unitId }] }],
            },
            select: { permission_key: true, effect: true, scope: true },
        }),
        prisma.employee.findFirst({ where: { user_id: userId }, select: { id: true, org_department_id: true } }),
        loadProfile(userId), // null when the user has none (or the table does not exist yet)
    ]);

    const ent = resolveEntitlements({
        userId, unitId, version,
        userActive: user.is_active,
        companyId: company?.id ?? null,
        entitledModules: new Set(companyModules.map((m) => m.module_key)),
        disabledModules: new Set(disabledConfigs.map((m) => m.module_key)),
        roles: userRoles.map((ur) => ({
            templateKey: ur.role.template_key,
            unitId: ur.unit_id,
            isActive: ur.role.is_active,
            permissions: ur.role.role_permissions.map((p) => ({ key: p.permission_key, scope: (isDataScope(p.scope) ? p.scope : 'UNIT') as DataScope })),
        })),
        overrides: overrides.map((o) => ({ key: o.permission_key, effect: o.effect, scope: o.scope && isDataScope(o.scope) ? o.scope : null })),
        employeeId: employee?.id ?? null,
        departmentId: employee?.org_department_id ?? null,
        profile: profile ? { preset: profile.preset, modules: profile.modules, permissions: profile.permissions } : null,
    });

    cache.set(key, { at: Date.now(), ent });
    if (cache.size > 5000) cache.clear(); // crude bound; entries are tiny and TTL'd
    return ent;
}

function emptyInput(userId: string, unitId: string, version: string, active: boolean) {
    return {
        userId, unitId, version, userActive: active, companyId: null,
        entitledModules: null, disabledModules: new Set<string>(), roles: [], overrides: [], employeeId: null, departmentId: null,
    };
}
