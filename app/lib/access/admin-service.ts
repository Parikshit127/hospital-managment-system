import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/backend/db';
import { SYSTEM_ROLES } from './system-roles';
import { MODULES, LEGACY_PERMISSION_KEYS } from '../modules/registry';
import { ALL_PERMISSION_KEYS, isCatalogueKey, moduleOfPermission } from './permissions';
import { buildNav, claimModules } from './claims';
import { checkGrant, checkNotLastOwner, checkRevoke } from './delegation';
import { clearEntitlementCache, getEntitlements } from './entitlements';
import { can, type Entitlements } from './resolve';
import type { DataScope } from '../modules/types';

/**
 * Access administration — the operations behind /admin/access/* (docs/COMPANY_OS_PLAN.md §8).
 * Server-only, NOT a 'use server' file: it is called by the guarded actions in
 * app/actions/access-admin-actions.ts, never from the browser.
 *
 * Every operation
 *   - is confined to the actor's company,
 *   - passes the delegation rules in delegation.ts (you can only hand out what you hold, never to yourself,
 *     company-wide grants need a company owner, the last owner cannot be removed),
 *   - bumps `users.access_version` of everyone it affects so the entitlement cache refreshes at once,
 *   - writes an `access_change_logs` row.
 */

export class AccessAdminError extends Error {
    constructor(message: string) { super(message); this.name = 'AccessAdminError'; }
}

export interface Actor {
    userId: string;
    companyId: string;
    /** the actor's active unit (session) */
    unitId: string;
    /** entitlements in that unit */
    ent: Entitlements;
}

// ───────────────────────── helpers ─────────────────────────

export async function loadActor(session: { id: string; organization_id: string }): Promise<Actor> {
    const org = await prisma.organization.findUnique({ where: { id: session.organization_id }, select: { company_id: true } });
    if (!org?.company_id) throw new AccessAdminError('This unit is not part of a company yet. Run the Company-OS backfill first.');
    const ent = await getEntitlements(session.id, session.organization_id);
    return { userId: session.id, companyId: org.company_id, unitId: session.organization_id, ent };
}

async function entIn(actor: Actor, unitId: string | null): Promise<Entitlements> {
    return unitId === null || unitId === actor.unitId ? actor.ent : getEntitlements(actor.userId, unitId);
}

async function assertUnit(actor: Actor, unitId: string) {
    const unit = await prisma.organization.findFirst({ where: { id: unitId, company_id: actor.companyId }, select: { id: true, name: true, slug: true } });
    if (!unit) throw new AccessAdminError('That unit is not part of your company.');
    return unit;
}

async function targetUser(actor: Actor, userId: string) {
    const u = await prisma.user.findFirst({
        where: { id: userId, company_id: actor.companyId },
        select: { id: true, username: true, name: true, role: true, is_active: true, organizationId: true, email: true, phone: true },
    });
    if (!u) throw new AccessAdminError('User not found in your company.');
    return u;
}

async function roleWithKeys(actor: Actor, roleId: string) {
    const role = await prisma.role.findFirst({
        where: { id: roleId, company_id: actor.companyId, template_key: { not: null } },
        select: { id: true, name: true, template_key: true, is_active: true, organizationId: true, role_permissions: { select: { permission_key: true } } },
    });
    if (!role) throw new AccessAdminError('Role not found.');
    if (!role.is_active) throw new AccessAdminError('That role is switched off.');
    return { ...role, keys: role.role_permissions.map((p) => p.permission_key), isAdminTemplate: role.template_key === 'admin' };
}

function must<T extends { ok: boolean }>(r: T): void {
    if (!r.ok) throw new AccessAdminError((r as unknown as { reason: string }).reason);
}

async function bump(userIds: string[]) {
    if (userIds.length) await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { access_version: { increment: 1 } } });
    clearEntitlementCache();
}

async function logChange(actor: Actor, targetUserId: string | null, change: Record<string, unknown>) {
    await prisma.accessChangeLog.create({ data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: targetUserId, change: change as object } });
}

async function activeOwnerIds(companyId: string): Promise<string[]> {
    const rows = await prisma.userRole.findMany({
        where: {
            unit_id: null, role: { template_key: 'admin', company_id: companyId, is_active: true }, user: { is_active: true },
            AND: [{ valid_from: { lte: new Date() } }, { OR: [{ valid_to: null }, { valid_to: { gt: new Date() } }] }],
        },
        select: { user_id: true },
    });
    return [...new Set(rows.map((r) => r.user_id))];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ───────────────────────── overview / users ─────────────────────────

export async function getAccessOverview(actor: Actor) {
    const [units, userCount, provisioned, roles, owners] = await Promise.all([
        prisma.organization.findMany({ where: { company_id: actor.companyId }, select: { id: true, name: true, slug: true, is_active: true }, orderBy: { name: 'asc' } }),
        prisma.user.count({ where: { company_id: actor.companyId, is_active: true } }),
        prisma.user.count({ where: { company_id: actor.companyId, is_active: true, user_roles: { some: {} } } }),
        prisma.role.findMany({ where: { company_id: actor.companyId, template_key: { not: null }, is_active: true }, select: { id: true, name: true, template_key: true }, orderBy: { name: 'asc' } }),
        activeOwnerIds(actor.companyId),
    ]);
    return {
        units, activeUsers: userCount, usersWithAccessRoles: provisioned, roles, companyOwners: owners.length,
        actor: { isAdmin: actor.ent.isAdmin, isCompanyOwner: actor.ent.isCompanyOwner },
    };
}

export interface ListFilters { q?: string; unitId?: string; templateKey?: string; status?: 'active' | 'inactive' | 'all' }

export async function listAccessUsers(actor: Actor, f: ListFilters = {}) {
    const users = await prisma.user.findMany({
        where: {
            company_id: actor.companyId,
            ...(f.unitId ? { organizationId: f.unitId } : {}),
            ...(f.status === 'inactive' ? { is_active: false } : f.status === 'all' ? {} : { is_active: true }),
            ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' as const } }, { username: { contains: f.q, mode: 'insensitive' as const } }] } : {}),
            ...(f.templateKey ? { user_roles: { some: { role: { template_key: f.templateKey } } } } : {}),
        },
        select: {
            id: true, username: true, name: true, role: true, is_active: true, organizationId: true,
            organization: { select: { name: true } },
            user_roles: { select: { id: true, unit_id: true, is_primary: true, valid_to: true, role: { select: { name: true, template_key: true } } } },
            permission_overrides: { select: { id: true } },
        },
        orderBy: { name: 'asc' },
        take: 500,
    });
    const codes = await prisma.employee.findMany({ where: { user_id: { in: users.map((u) => u.id) } }, select: { user_id: true, employee_code: true } });
    const codeOf = new Map(codes.map((c) => [c.user_id, c.employee_code]));
    const now = Date.now();
    return users.map((u) => ({
        id: u.id, username: u.username, name: u.name, legacyRole: u.role, active: u.is_active, homeUnit: u.organization.name, employeeCode: codeOf.get(u.id) ?? null,
        roles: u.user_roles.filter((r) => !r.valid_to || r.valid_to.getTime() > now).map((r) => ({ id: r.id, name: r.role.name, templateKey: r.role.template_key, unitId: r.unit_id, primary: r.is_primary })),
        overrides: u.permission_overrides.length,
        provisioned: u.user_roles.length > 0,
    }));
}

export async function getUserAccessDetail(actor: Actor, userId: string) {
    const u = await targetUser(actor, userId);
    const [employee, userRoles, overrides, units] = await Promise.all([
        prisma.employee.findFirst({ where: { user_id: userId }, select: { id: true, employee_code: true, designation: true, org_department: { select: { name: true } }, reporting_manager: { select: { name: true } } } }),
        prisma.userRole.findMany({ where: { user_id: userId }, include: { role: { select: { name: true, template_key: true } }, unit: { select: { name: true } } }, orderBy: { created_at: 'asc' } }),
        prisma.userPermissionOverride.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } }),
        prisma.organization.findMany({ where: { company_id: actor.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);

    // "View as this user": what they actually get in each unit they hold a role in.
    const unitIds = new Set<string>([u.organizationId]);
    for (const r of userRoles) if (r.unit_id) unitIds.add(r.unit_id);
    if (userRoles.some((r) => r.unit_id === null)) units.forEach((x) => unitIds.add(x.id));
    const effective = [];
    for (const unitId of unitIds) {
        const ent = await getEntitlements(userId, unitId);
        const mods = claimModules(ent, u.role);
        effective.push({
            unitId, unitName: units.find((x) => x.id === unitId)?.name ?? unitId, provisioned: ent.provisioned,
            modules: mods,
            permissions: [...ent.permissions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, scope]) => ({ key, scope })),
            nav: buildNav(u.role, { mods }).map((s) => ({ title: s.title, items: s.items.map((i) => ({ label: i.label, href: i.href })) })),
            isAdmin: ent.isAdmin,
        });
    }
    return {
        user: u, employee,
        roles: userRoles.map((r) => ({
            id: r.id, roleId: r.role_id, name: r.role.name, templateKey: r.role.template_key, unitId: r.unit_id, unitName: r.unit?.name ?? 'All units',
            primary: r.is_primary, validFrom: r.valid_from, validTo: r.valid_to, active: !r.valid_to || r.valid_to.getTime() > Date.now(),
        })),
        overrides: overrides.map((o) => ({ ...o, expired: !!o.expires_at && o.expires_at.getTime() <= Date.now() })),
        effective, units,
    };
}

// ───────────────────────── roles on a user ─────────────────────────

export async function listAssignableRoles(actor: Actor) {
    const roles = await prisma.role.findMany({
        where: { company_id: actor.companyId, template_key: { not: null }, is_active: true },
        select: { id: true, name: true, description: true, template_key: true, role_permissions: { select: { permission_key: true } }, _count: { select: { user_roles: true } } },
        orderBy: [{ name: 'asc' }],
    });
    return roles.map((r) => {
        const keys = r.role_permissions.map((p) => p.permission_key);
        const isAdminTemplate = r.template_key === 'admin';
        const verdict = checkGrant({ actorId: actor.userId, targetUserId: '__preview__', actorEnt: actor.ent, unit: actor.unitId, keys, grantsAdminTemplate: isAdminTemplate });
        return {
            id: r.id, name: r.name, description: r.description, templateKey: r.template_key, system: !r.template_key?.startsWith('custom:'),
            permissionCount: isAdminTemplate ? ALL_PERMISSION_KEYS.length : keys.length, users: r._count.user_roles,
            assignable: verdict.ok, reason: verdict.ok ? null : (verdict as { reason: string }).reason,
        };
    });
}

export async function assignRole(actor: Actor, input: { targetUserId: string; roleId: string; unitId: string | null; validTo?: Date | null }) {
    const target = await targetUser(actor, input.targetUserId);
    const role = await roleWithKeys(actor, input.roleId);
    if (input.unitId) await assertUnit(actor, input.unitId);
    must(checkGrant({
        actorId: actor.userId, targetUserId: target.id, actorEnt: await entIn(actor, input.unitId), unit: input.unitId,
        keys: role.keys, grantsAdminTemplate: role.isAdminTemplate,
    }));
    if (input.validTo && input.validTo.getTime() <= Date.now()) throw new AccessAdminError('The end date must be in the future.');

    const existing = await prisma.userRole.findFirst({ where: { user_id: target.id, role_id: role.id, unit_id: input.unitId } });
    if (existing && (!existing.valid_to || existing.valid_to.getTime() > Date.now())) throw new AccessAdminError('That user already holds this role there.');
    const row = existing
        ? await prisma.userRole.update({ where: { id: existing.id }, data: { valid_from: new Date(), valid_to: input.validTo ?? null, granted_by: actor.userId } })
        : await prisma.userRole.create({ data: { user_id: target.id, role_id: role.id, unit_id: input.unitId, is_primary: false, valid_to: input.validTo ?? null, granted_by: actor.userId } });
    await bump([target.id]);
    await logChange(actor, target.id, { event: 'role.assign', userRoleId: row.id, role: role.name, templateKey: role.template_key, unitId: input.unitId, validTo: input.validTo ?? null });
    return { id: row.id };
}

export async function revokeUserRole(actor: Actor, userRoleId: string) {
    const ur = await prisma.userRole.findFirst({
        where: { id: userRoleId, user: { company_id: actor.companyId } },
        include: { role: { select: { name: true, template_key: true } }, user: { select: { id: true } } },
    });
    if (!ur) throw new AccessAdminError('Assignment not found.');
    const isAdminTemplate = ur.role.template_key === 'admin';
    must(checkRevoke({ actorId: actor.userId, targetUserId: ur.user_id, actorEnt: await entIn(actor, ur.unit_id), unit: ur.unit_id, revokesAdminTemplate: isAdminTemplate }));
    if (isAdminTemplate && ur.unit_id === null) must(checkNotLastOwner(await activeOwnerIds(actor.companyId), ur.user_id));
    await prisma.userRole.update({ where: { id: ur.id }, data: { valid_to: new Date() } }); // end-dated, not deleted: the history stays
    await bump([ur.user_id]);
    await logChange(actor, ur.user_id, { event: 'role.revoke', userRoleId: ur.id, role: ur.role.name, unitId: ur.unit_id });
}

// ───────────────────────── per-user overrides ─────────────────────────

export async function addOverride(actor: Actor, input: {
    targetUserId: string; permissionKey: string; effect: 'GRANT' | 'DENY'; scope?: DataScope | null; unitId?: string | null; expiresAt?: Date | null; reason: string;
}) {
    const target = await targetUser(actor, input.targetUserId);
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3) throw new AccessAdminError('A reason is required.');
    const key = input.permissionKey;
    if (!isCatalogueKey(key) && !LEGACY_PERMISSION_KEYS.includes(key)) throw new AccessAdminError('Unknown permission.');
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new AccessAdminError('The expiry must be in the future.');
    const unitId = input.unitId ?? null;
    if (unitId) await assertUnit(actor, unitId);

    const actorEnt = await entIn(actor, unitId);
    if (input.effect === 'GRANT') must(checkGrant({ actorId: actor.userId, targetUserId: target.id, actorEnt, unit: unitId, keys: [key] }));
    else must(checkRevoke({ actorId: actor.userId, targetUserId: target.id, actorEnt, unit: unitId }));

    const row = await prisma.userPermissionOverride.create({
        data: { user_id: target.id, permission_key: key, effect: input.effect, scope: input.scope ?? null, unit_id: unitId, expires_at: input.expiresAt ?? null, reason, granted_by: actor.userId },
    });
    await bump([target.id]);
    await logChange(actor, target.id, { event: `override.${input.effect.toLowerCase()}`, overrideId: row.id, permission: key, scope: input.scope ?? null, unitId, expiresAt: input.expiresAt ?? null, reason });
    return { id: row.id };
}

export async function removeOverride(actor: Actor, overrideId: string) {
    const o = await prisma.userPermissionOverride.findFirst({ where: { id: overrideId, user: { company_id: actor.companyId } } });
    if (!o) throw new AccessAdminError('Override not found.');
    must(checkRevoke({ actorId: actor.userId, targetUserId: o.user_id, actorEnt: await entIn(actor, o.unit_id), unit: o.unit_id }));
    await prisma.userPermissionOverride.delete({ where: { id: o.id } });
    await bump([o.user_id]);
    await logChange(actor, o.user_id, { event: 'override.remove', permission: o.permission_key, effect: o.effect, unitId: o.unit_id });
}

// ───────────────────────── create / import / offboard ─────────────────────────

export interface NewStaffInput {
    name: string;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    employeeCode?: string;
    designation?: string;
    designationId?: string | null;
    orgDepartmentId?: string | null;
    reportingManagerId?: number | null;
    specialty?: string;
    dateOfJoining?: string;
    homeUnitId: string;
    /** a system access template key — becomes users.role (what every legacy screen still reads) AND a UserRole */
    primaryRole: string;
    extraRoles?: { roleId: string; unitId: string | null }[];
    overrides?: { permissionKey: string; effect: 'GRANT' | 'DENY'; scope?: DataScope | null; reason: string; expiresAt?: Date | null }[];
}

const tempPassword = () => randomBytes(9).toString('base64url'); // 12 chars

export async function createStaffWithAccess(actor: Actor, input: NewStaffInput) {
    const name = (input.name ?? '').trim();
    if (name.length < 2) throw new AccessAdminError('Name is required.');
    if (!SYSTEM_ROLES.some((r) => r.slug === input.primaryRole)) throw new AccessAdminError('Choose a valid primary role.');
    const unit = await assertUnit(actor, input.homeUnitId);

    const template = await prisma.role.findFirst({
        where: { company_id: actor.companyId, template_key: input.primaryRole, is_active: true },
        select: { id: true, name: true, role_permissions: { select: { permission_key: true } } },
    });
    if (!template) throw new AccessAdminError('Access templates are not set up for this company. Run the Company-OS backfill.');

    const actorAtHome = await entIn(actor, unit.id);
    must(checkGrant({ actorId: actor.userId, targetUserId: '__new__', actorEnt: actorAtHome, unit: unit.id, keys: template.role_permissions.map((p) => p.permission_key), grantsAdminTemplate: input.primaryRole === 'admin' }));

    const extras: { role: Awaited<ReturnType<typeof roleWithKeys>>; unitId: string | null }[] = [];
    for (const x of input.extraRoles ?? []) {
        const role = await roleWithKeys(actor, x.roleId);
        if (x.unitId) await assertUnit(actor, x.unitId);
        must(checkGrant({ actorId: actor.userId, targetUserId: '__new__', actorEnt: await entIn(actor, x.unitId), unit: x.unitId, keys: role.keys, grantsAdminTemplate: role.isAdminTemplate }));
        extras.push({ role, unitId: x.unitId });
    }
    for (const o of input.overrides ?? []) {
        if (!isCatalogueKey(o.permissionKey) && !LEGACY_PERMISSION_KEYS.includes(o.permissionKey)) throw new AccessAdminError(`Unknown permission ${o.permissionKey}.`);
        if ((o.reason ?? '').trim().length < 3) throw new AccessAdminError('Every override needs a reason.');
        must(o.effect === 'GRANT'
            ? checkGrant({ actorId: actor.userId, targetUserId: '__new__', actorEnt: actorAtHome, unit: unit.id, keys: [o.permissionKey] })
            : checkRevoke({ actorId: actor.userId, targetUserId: '__new__', actorEnt: actorAtHome, unit: unit.id }));
    }

    // identity
    let employeeCode = (input.employeeCode ?? '').trim();
    if (!employeeCode) {
        const n = await prisma.employee.count({ where: { organizationId: unit.id } });
        employeeCode = `EMP-${String(n + 1).padStart(5, '0')}`;
        while (await prisma.employee.findFirst({ where: { organizationId: unit.id, employee_code: employeeCode }, select: { id: true } })) {
            employeeCode = `EMP-${String(Number(employeeCode.slice(4)) + 1).padStart(5, '0')}`;
        }
    } else if (await prisma.employee.findFirst({ where: { organizationId: unit.id, employee_code: employeeCode }, select: { id: true } })) {
        throw new AccessAdminError(`Employee code ${employeeCode} is already used in ${unit.name}.`);
    }
    const username = (input.username ?? '').trim() || employeeCode;
    if (!/^[A-Za-z0-9._@-]{3,60}$/.test(username)) throw new AccessAdminError('Username must be 3–60 characters (letters, digits . _ @ -).');
    if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new AccessAdminError('That username is already taken.');

    const generated = !input.password;
    const password = input.password ?? tempPassword();
    if (password.length < 8) throw new AccessAdminError('Password must be at least 8 characters.');
    const hash = await bcrypt.hash(password, 10);

    let designationText = (input.designation ?? '').trim();
    if (input.designationId) {
        const d = await prisma.designation.findFirst({ where: { id: input.designationId, company_id: actor.companyId } });
        if (!d) throw new AccessAdminError('Unknown designation.');
        designationText = designationText || d.name;
    }
    if (input.orgDepartmentId && !(await prisma.orgDepartment.findFirst({ where: { id: input.orgDepartmentId, company_id: actor.companyId }, select: { id: true } }))) throw new AccessAdminError('Unknown department.');
    if (input.reportingManagerId && !(await prisma.employee.findFirst({ where: { id: input.reportingManagerId, company_id: actor.companyId }, select: { id: true } }))) throw new AccessAdminError('Unknown reporting manager.');

    const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                username, password: hash, name, role: input.primaryRole, organizationId: unit.id, company_id: actor.companyId, is_active: true,
                email: input.email?.trim() || null, phone: input.phone?.trim() || null,
                specialty: input.primaryRole === 'doctor' ? input.specialty?.trim() || null : null,
                designation: designationText || null,
            },
            select: { id: true },
        });
        await tx.employee.create({
            data: {
                user_id: user.id, employee_code: employeeCode, name, designation: designationText || input.primaryRole,
                date_of_joining: input.dateOfJoining ? new Date(input.dateOfJoining) : new Date(), phone: input.phone?.trim() || null, email: input.email?.trim() || null,
                organizationId: unit.id, company_id: actor.companyId, designation_id: input.designationId ?? null, org_department_id: input.orgDepartmentId ?? null,
                reporting_manager_id: input.reportingManagerId ?? null,
            },
        });
        await tx.userRole.create({ data: { user_id: user.id, role_id: template.id, unit_id: unit.id, is_primary: true, granted_by: actor.userId } });
        for (const x of extras) await tx.userRole.create({ data: { user_id: user.id, role_id: x.role.id, unit_id: x.unitId, is_primary: false, granted_by: actor.userId } });
        for (const o of input.overrides ?? []) {
            await tx.userPermissionOverride.create({
                data: { user_id: user.id, permission_key: o.permissionKey, effect: o.effect, scope: o.scope ?? null, unit_id: unit.id, expires_at: o.expiresAt ?? null, reason: o.reason.trim(), granted_by: actor.userId },
            });
        }
        await tx.accessChangeLog.create({
            data: {
                company_id: actor.companyId, actor_id: actor.userId, target_user_id: user.id,
                change: { event: 'user.create', username, employeeCode, primaryRole: input.primaryRole, unitId: unit.id, extraRoles: extras.map((x) => ({ role: x.role.name, unitId: x.unitId })), overrides: (input.overrides ?? []).length } as object,
            },
        });
        await tx.system_audit_logs.create({
            data: { user_id: actor.userId, action: 'CREATE_USER', module: 'admin', entity_type: 'user', entity_id: user.id, details: `Created user ${name} (${username}) with role ${input.primaryRole} via access admin`, organizationId: unit.id },
        });
        return user;
    });
    clearEntitlementCache();
    return { userId: created.id, username, employeeCode, temporaryPassword: generated ? password : null };
}

export async function offboardUser(actor: Actor, input: { targetUserId: string; reason: string; dateOfExit?: Date }) {
    const target = await targetUser(actor, input.targetUserId);
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3) throw new AccessAdminError('A reason is required.');
    if (!target.is_active) throw new AccessAdminError('That user is already inactive.');

    const roles = await prisma.userRole.findMany({ where: { user_id: target.id }, include: { role: { select: { template_key: true } } } });
    const holdsAdmin = roles.some((r) => r.role.template_key === 'admin') || target.role === 'admin';
    must(checkRevoke({ actorId: actor.userId, targetUserId: target.id, actorEnt: await entIn(actor, target.organizationId), unit: target.organizationId, revokesAdminTemplate: holdsAdmin }));
    must(checkNotLastOwner(await activeOwnerIds(actor.companyId), target.id));

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { is_active: false, access_version: { increment: 1 } } });
        const ended = await tx.userRole.updateMany({ where: { user_id: target.id, OR: [{ valid_to: null }, { valid_to: { gt: now } }] }, data: { valid_to: now } });
        const revoked = await tx.userPermissionOverride.deleteMany({ where: { user_id: target.id } });
        await tx.employee.updateMany({ where: { user_id: target.id }, data: { is_active: false, date_of_exit: input.dateOfExit ?? now, exit_reason: reason } });
        await tx.accessChangeLog.create({
            data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: target.id, change: { event: 'user.offboard', reason, rolesEnded: ended.count, overridesRevoked: revoked.count } as object },
        });
    });
    clearEntitlementCache();
}

// ───────────────────────── bulk import ─────────────────────────

const IMPORT_COLUMNS = ['name', 'username', 'email', 'phone', 'role', 'unit', 'employee_code', 'designation'] as const;

function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let cur: string[] = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { cur.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            cur.push(field); field = '';
            if (cur.some((x) => x.trim() !== '')) rows.push(cur);
            cur = [];
        } else field += c;
    }
    cur.push(field);
    if (cur.some((x) => x.trim() !== '')) rows.push(cur);
    return rows;
}

export interface ImportRow { line: number; ok: boolean; errors: string[]; data: Record<string, string> }

export async function previewUserImport(actor: Actor, csv: string): Promise<{ rows: ImportRow[]; columns: readonly string[] }> {
    const table = parseCsv(csv);
    if (!table.length) throw new AccessAdminError('The file is empty.');
    const header = table[0].map((h) => h.trim().toLowerCase());
    if (!header.includes('name') || !header.includes('role') || !header.includes('unit')) throw new AccessAdminError('The header must contain at least: name, role, unit.');
    const units = await prisma.organization.findMany({ where: { company_id: actor.companyId }, select: { id: true, name: true, slug: true } });
    const seenUsernames = new Set<string>();
    const rows: ImportRow[] = [];
    for (let i = 1; i < table.length; i++) {
        const data: Record<string, string> = {};
        IMPORT_COLUMNS.forEach((c) => { const idx = header.indexOf(c); data[c] = idx >= 0 ? (table[i][idx] ?? '').trim() : ''; });
        const errors: string[] = [];
        if (data.name.length < 2) errors.push('name is required');
        if (!SYSTEM_ROLES.some((r) => r.slug === data.role)) errors.push(`unknown role "${data.role}"`);
        const unit = units.find((u) => u.slug === data.unit || u.name.toLowerCase() === data.unit.toLowerCase() || u.id === data.unit);
        if (!unit) errors.push(`unknown unit "${data.unit}"`);
        const uname = data.username || data.employee_code;
        if (uname) {
            if (seenUsernames.has(uname.toLowerCase())) errors.push(`duplicate username "${uname}" in the file`);
            seenUsernames.add(uname.toLowerCase());
            if (await prisma.user.findUnique({ where: { username: uname }, select: { id: true } })) errors.push(`username "${uname}" already exists`);
        }
        if (unit && SYSTEM_ROLES.some((r) => r.slug === data.role)) {
            const tpl = await prisma.role.findFirst({ where: { company_id: actor.companyId, template_key: data.role }, select: { role_permissions: { select: { permission_key: true } } } });
            if (!tpl) errors.push('access templates are not set up');
            else {
                const v = checkGrant({ actorId: actor.userId, targetUserId: '__new__', actorEnt: await entIn(actor, unit.id), unit: unit.id, keys: tpl.role_permissions.map((p) => p.permission_key), grantsAdminTemplate: data.role === 'admin' });
                if (!v.ok) errors.push(v.reason);
            }
        }
        rows.push({ line: i + 1, ok: errors.length === 0, errors, data });
    }
    return { rows, columns: IMPORT_COLUMNS };
}

export async function commitUserImport(actor: Actor, csv: string) {
    const { rows } = await previewUserImport(actor, csv);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) throw new AccessAdminError(`Fix ${bad.length} row(s) first (first problem: line ${bad[0].line}: ${bad[0].errors[0]}).`);
    const units = await prisma.organization.findMany({ where: { company_id: actor.companyId }, select: { id: true, name: true, slug: true } });
    const results: { line: number; username: string; employeeCode: string; temporaryPassword: string | null; error?: string }[] = [];
    for (const r of rows) {
        const unit = units.find((u) => u.slug === r.data.unit || u.name.toLowerCase() === r.data.unit.toLowerCase() || u.id === r.data.unit)!;
        try {
            const out = await createStaffWithAccess(actor, {
                name: r.data.name, username: r.data.username || undefined, email: r.data.email, phone: r.data.phone,
                employeeCode: r.data.employee_code || undefined, designation: r.data.designation, homeUnitId: unit.id, primaryRole: r.data.role,
            });
            results.push({ line: r.line, username: out.username, employeeCode: out.employeeCode, temporaryPassword: out.temporaryPassword });
        } catch (e) {
            results.push({ line: r.line, username: r.data.username, employeeCode: '', temporaryPassword: null, error: (e as Error).message });
        }
    }
    await logChange(actor, null, { event: 'user.import', rows: rows.length, created: results.filter((x) => !x.error).length, failed: results.filter((x) => x.error).length });
    return results;
}

// ───────────────────────── role editor ─────────────────────────

export async function listRolesForEditor(actor: Actor) {
    const roles = await prisma.role.findMany({
        where: { company_id: actor.companyId, template_key: { not: null } },
        select: { id: true, name: true, description: true, template_key: true, is_active: true, role_permissions: { select: { permission_key: true } }, _count: { select: { user_roles: true } } },
        orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
        id: r.id, name: r.name, description: r.description, templateKey: r.template_key, active: r.is_active, custom: !!r.template_key?.startsWith('custom:'),
        isAdmin: r.template_key === 'admin', permissions: r.role_permissions.map((p) => p.permission_key).sort(), users: r._count.user_roles,
    }));
}

/** The permission catalogue grouped for the editor, flagged with what THIS actor may hand out. */
export function catalogueForEditor(actor: Actor) {
    return MODULES.filter((m) => m.permissions?.length && !m.alwaysOn).map((m) => ({
        module: m.key, name: m.name,
        permissions: m.permissions!.map((p) => ({ key: p.key, description: p.description, grantable: actor.ent.isAdmin || can(actor.ent, p.key) !== null })),
    }));
}

function validKeys(keys: readonly string[]): string[] {
    const out = [...new Set(keys)];
    for (const k of out) if (!isCatalogueKey(k) || moduleOfPermission(k)?.alwaysOn) throw new AccessAdminError(`"${k}" is not a grantable permission.`);
    return out;
}

async function companyAnchorOrg(actor: Actor): Promise<string> {
    const anchor = await prisma.role.findFirst({ where: { company_id: actor.companyId, template_key: { not: null } }, select: { organizationId: true } });
    if (!anchor) throw new AccessAdminError('Access templates are not set up for this company. Run the Company-OS backfill.');
    return anchor.organizationId;
}

export async function createCustomRole(actor: Actor, input: { name: string; description?: string; permissionKeys?: string[]; cloneFromRoleId?: string }) {
    const name = (input.name ?? '').trim();
    if (name.length < 2) throw new AccessAdminError('A role name is required.');
    let keys = input.permissionKeys ?? [];
    if (input.cloneFromRoleId) {
        const src = await roleWithKeys(actor, input.cloneFromRoleId);
        if (src.isAdminTemplate) throw new AccessAdminError('The administrator role cannot be cloned.');
        keys = src.keys;
    }
    // Stored keys may be legacy keys (cloned from a template) or catalogue keys (picked in the editor).
    const clean = [...new Set(keys)].filter((k) => isCatalogueKey(k) || LEGACY_PERMISSION_KEYS.includes(k));
    must(checkGrant({ actorId: actor.userId, targetUserId: '__role__', actorEnt: actor.ent, unit: actor.unitId, keys: clean }));

    const slug = slugify(name);
    if (!slug) throw new AccessAdminError('That name is not usable.');
    const templateKey = `custom:${slug}`;
    if (await prisma.role.findFirst({ where: { company_id: actor.companyId, template_key: templateKey }, select: { id: true } })) throw new AccessAdminError('A role with that name already exists.');

    const role = await prisma.role.create({
        data: {
            organizationId: await companyAnchorOrg(actor), name, slug: `custom.${slug}`, description: input.description?.trim() || null,
            is_system: false, is_active: true, permissions: [], data_scope: 'organization', company_id: actor.companyId, unit_id: null, template_key: templateKey,
        },
    });
    if (clean.length) await prisma.rolePermission.createMany({ data: clean.map((permission_key) => ({ role_id: role.id, permission_key, scope: 'UNIT' as const })), skipDuplicates: true });
    await logChange(actor, null, { event: 'role.create', roleId: role.id, name, permissions: clean.length, clonedFrom: input.cloneFromRoleId ?? null });
    return { id: role.id };
}

export async function updateCustomRole(actor: Actor, roleId: string, input: { name?: string; description?: string; permissionKeys?: string[]; active?: boolean }) {
    const role = await prisma.role.findFirst({ where: { id: roleId, company_id: actor.companyId, template_key: { startsWith: 'custom:' } }, select: { id: true, name: true, role_permissions: { select: { permission_key: true } } } });
    if (!role) throw new AccessAdminError('Only custom roles can be edited.');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) { if (input.name.trim().length < 2) throw new AccessAdminError('A role name is required.'); data.name = input.name.trim(); }
    if (input.description !== undefined) data.description = input.description.trim() || null;
    if (input.active !== undefined) data.is_active = input.active;

    let added: string[] = [], removed: string[] = [];
    if (input.permissionKeys) {
        const next = [...new Set(input.permissionKeys)].filter((k) => isCatalogueKey(k) || LEGACY_PERMISSION_KEYS.includes(k));
        const current = role.role_permissions.map((p) => p.permission_key);
        added = next.filter((k) => !current.includes(k));
        removed = current.filter((k) => !next.includes(k));
        // Only ADDING is escalation; taking permissions away needs no subset check.
        if (added.length) must(checkGrant({ actorId: actor.userId, targetUserId: '__role__', actorEnt: actor.ent, unit: actor.unitId, keys: added }));
    }
    await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.role.update({ where: { id: role.id }, data });
        if (removed.length) await tx.rolePermission.deleteMany({ where: { role_id: role.id, permission_key: { in: removed } } });
        if (added.length) await tx.rolePermission.createMany({ data: added.map((permission_key) => ({ role_id: role.id, permission_key, scope: 'UNIT' as const })), skipDuplicates: true });
    });
    const holders = await prisma.userRole.findMany({ where: { role_id: role.id }, select: { user_id: true } });
    await bump([...new Set(holders.map((h) => h.user_id))]);
    await logChange(actor, null, { event: 'role.update', roleId: role.id, name: role.name, added, removed, holders: holders.length });
}

export async function deleteCustomRole(actor: Actor, roleId: string) {
    const role = await prisma.role.findFirst({ where: { id: roleId, company_id: actor.companyId, template_key: { startsWith: 'custom:' } }, select: { id: true, name: true, _count: { select: { user_roles: true } } } });
    if (!role) throw new AccessAdminError('Only custom roles can be deleted.');
    if (role._count.user_roles) throw new AccessAdminError('That role is still assigned to users. Remove it from them first (or switch it off).');
    must(checkRevoke({ actorId: actor.userId, targetUserId: '__role__', actorEnt: actor.ent, unit: actor.unitId }));
    await prisma.role.delete({ where: { id: role.id } });
    await logChange(actor, null, { event: 'role.delete', roleId: role.id, name: role.name });
}

// ───────────────────────── change log ─────────────────────────

export async function listChangeLog(actor: Actor, f: { targetUserId?: string; limit?: number } = {}) {
    const rows = await prisma.accessChangeLog.findMany({
        where: { company_id: actor.companyId, ...(f.targetUserId ? { target_user_id: f.targetUserId } : {}) },
        orderBy: { created_at: 'desc' }, take: Math.min(f.limit ?? 200, 500),
    });
    const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id]).filter(Boolean) as string[])];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, name: true } });
    const label = new Map(users.map((u) => [u.id, `${u.name ?? u.username} (${u.username})`]));
    return rows.map((r) => ({ id: r.id, at: r.created_at, actor: label.get(r.actor_id) ?? r.actor_id, target: r.target_user_id ? label.get(r.target_user_id) ?? r.target_user_id : null, change: r.change as Record<string, unknown> }));
}
