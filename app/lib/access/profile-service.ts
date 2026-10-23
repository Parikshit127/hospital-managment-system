import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/backend/db';
import { AccessAdminError, loadActor, type Actor } from './admin-service';
import { clearEntitlementCache } from './entitlements';
import { can } from './resolve';
import { HR_RESTRICTED_PRESETS, ProfileError, checkProfileChange, listModuleMeta, listPresets, normalizeProfile, presetValue, restrictedSlice, type AccessProfileValue } from './presets';
import { clearManagedCache, deleteProfileRow, loadProfile } from './profile-store';

/**
 * Per-employee access profiles — the operations behind the HR "Login & Access" screens and the Admin user page
 * (ACCESS_PROFILES_PLAN.md). Server-only and NOT a 'use server' file: the guarded actions in
 * app/actions/access-profile-actions.ts are the only callers.
 *
 * Every write is confined to the actor's company, passes `checkProfileChange` (who may hand out what), bumps the
 * target's `access_version` so caches refresh at once, and leaves an `access_change_logs` + `system_audit_logs` row.
 */

export interface ProfileActor extends Actor {
    /** Administrator (role admin, or holds the admin access template). May hand out everything but the Admin console. */
    isAdmin: boolean;
}

export async function loadProfileActor(session: { id: string; role: string; organization_id: string }): Promise<ProfileActor> {
    const actor = await loadActor({ id: session.id, organization_id: session.organization_id });
    return { ...actor, isAdmin: session.role === 'admin' || actor.ent.isAdmin };
}

const wrap = <T>(fn: () => Promise<T>) => fn().catch((e) => { if (e instanceof ProfileError) throw new AccessAdminError(e.message); throw e; });

const tempPassword = () => randomBytes(9).toString('base64url');
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,60}$/;

// ───────────────────────── reading ─────────────────────────

/** Everything the editor needs that does not depend on one employee. */
export async function getEditorSetup(actor: ProfileActor) {
    const available = actor.ent.modules;
    const modules = listModuleMeta().filter((m) => available.size === 0 || available.has(m.key));
    const presets = listPresets().map((p) => ({ ...p, value: presetValue(p.slug) }));
    return {
        modules, presets,
        actor: { isAdmin: actor.isAdmin, canAssign: actor.isAdmin || can(actor.ent, 'hr.access.assign') !== null },
    };
}

export async function getEmployeeAccess(actor: ProfileActor, employeeId: number) {
    const employee = await prisma.employee.findFirst({
        where: { id: employeeId, organization: { company_id: actor.companyId } },
        select: {
            id: true, employee_code: true, name: true, designation: true, is_active: true, user_id: true, organizationId: true,
            user: { select: { id: true, username: true, role: true, is_active: true, organizationId: true } },
        },
    });
    if (!employee) throw new AccessAdminError('Employee not found.');
    if (!employee.user) return { employee, user: null, profile: null, current: null, history: [] as { at: Date; by: string; event: string }[], canEdit: true };

    const profile = await loadProfile(employee.user.id);
    const knownRole = listPresets().some((p) => p.slug === employee.user!.role);
    const current: AccessProfileValue | null = profile ?? (knownRole ? presetValue(employee.user.role) : null);

    const logs = await prisma.accessChangeLog.findMany({ where: { company_id: actor.companyId, target_user_id: employee.user.id }, orderBy: { created_at: 'desc' }, take: 10 });
    const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actor_id))] } }, select: { id: true, name: true, username: true } });
    const label = new Map(actors.map((u) => [u.id, u.name ?? u.username]));

    const targetIsAdmin = employee.user.role === 'admin';
    const canEdit = !targetIsAdmin && employee.user.id !== actor.userId && (!current || checkProfileChange({
        actorId: actor.userId, targetUserId: employee.user.id, actorIsAdmin: actor.isAdmin, actorCanAssign: true, targetIsAdmin, next: current, current,
    }).ok);

    return {
        employee: { ...employee, user: undefined }, user: employee.user,
        profile: profile ? { ...profile, updatedAt: profile.updatedAt.toISOString() } : null,
        current, canEdit,
        history: logs.map((l) => ({ at: l.created_at, by: label.get(l.actor_id) ?? l.actor_id, event: String((l.change as Record<string, unknown>).event ?? '') })),
    };
}

/** Login + profile status for a page of employees (HR employee list). */
export async function getAccessStatus(actor: ProfileActor, employeeIds: number[]) {
    const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds }, organization: { company_id: actor.companyId } },
        select: { id: true, user: { select: { id: true, username: true, role: true, is_active: true } } },
    });
    const userIds = employees.map((e) => e.user?.id).filter(Boolean) as string[];
    let profiles: { user_id: string; modules: string[] }[] = [];
    try { profiles = await prisma.userAccessProfile.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, modules: true } }); } catch { /* table not migrated yet */ }
    const byUser = new Map(profiles.map((p) => [p.user_id, p]));
    const out: Record<number, { hasLogin: boolean; username: string | null; loginActive: boolean; role: string | null; managed: boolean; moduleCount: number | null }> = {};
    for (const e of employees) {
        const p = e.user ? byUser.get(e.user.id) : undefined;
        out[e.id] = {
            hasLogin: !!e.user, username: e.user?.username ?? null, loginActive: e.user?.is_active ?? false, role: e.user?.role ?? null,
            managed: !!p, moduleCount: p ? p.modules.length : null,
        };
    }
    return out;
}

// ───────────────────────── writing ─────────────────────────

async function targetUser(actor: ProfileActor, userId: string) {
    const u = await prisma.user.findFirst({
        where: { id: userId, organization: { company_id: actor.companyId } },
        select: { id: true, username: true, name: true, role: true, is_active: true, organizationId: true },
    });
    if (!u) throw new AccessAdminError('User not found in your company.');
    return u;
}

function assertModulesAvailable(actor: ProfileActor, p: AccessProfileValue) {
    const available = actor.ent.modules;
    if (available.size === 0) return; // company not provisioned: nothing to compare with
    const missing = p.modules.filter((m) => !available.has(m));
    if (missing.length) throw new AccessAdminError(`Not available to this company/unit: ${missing.join(', ')}.`);
}

function diff(before: AccessProfileValue, after: AccessProfileValue) {
    const sub = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
    const bp = Object.keys(before.permissions), ap = Object.keys(after.permissions);
    return {
        presetFrom: before.preset, presetTo: after.preset,
        modulesAdded: sub(after.modules, before.modules), modulesRemoved: sub(before.modules, after.modules),
        permissionsAdded: sub(ap, bp), permissionsRemoved: sub(bp, ap),
    };
}

/** Keep the user's primary access-template role in step with the profile's base role, so removing the profile later reverts cleanly. */
async function syncPrimaryRole(tx: Pick<typeof prisma, 'role' | 'userRole'>, companyId: string, userId: string, unitId: string, preset: string, actorId: string) {
    const template = await tx.role.findFirst({ where: { company_id: companyId, template_key: preset, is_active: true }, select: { id: true } });
    if (!template) return; // templates not seeded: the engine does not need them for a managed user
    const primary = await tx.userRole.findFirst({ where: { user_id: userId, is_primary: true } });
    if (primary && primary.role_id === template.id) return;
    const clash = await tx.userRole.findFirst({ where: { user_id: userId, role_id: template.id, unit_id: unitId } });
    if (primary) {
        if (clash && clash.id !== primary.id) await tx.userRole.delete({ where: { id: clash.id } });
        await tx.userRole.update({ where: { id: primary.id }, data: { role_id: template.id, valid_to: null, granted_by: actorId } });
    } else if (clash) {
        await tx.userRole.update({ where: { id: clash.id }, data: { is_primary: true, valid_to: null } });
    } else {
        await tx.userRole.create({ data: { user_id: userId, role_id: template.id, unit_id: unitId, is_primary: true, granted_by: actorId } });
    }
}

export interface SaveProfileInput { preset: string; modules: string[]; permissions: Record<string, string>; note?: string }

export async function saveProfile(actor: ProfileActor, targetUserId: string, input: SaveProfileInput) {
    return wrap(async () => {
        const target = await targetUser(actor, targetUserId);
        if (!target.is_active) throw new AccessAdminError('That login is switched off. Switch it on first.');
        const next = normalizeProfile(input);
        assertModulesAvailable(actor, next);

        const existing = await loadProfile(target.id);
        const knownRole = listPresets().some((p) => p.slug === target.role);
        const current: AccessProfileValue = existing ?? (knownRole ? presetValue(target.role) : { preset: target.role, modules: [], permissions: {} });
        const verdict = checkProfileChange({
            actorId: actor.userId, targetUserId: target.id, actorIsAdmin: actor.isAdmin, actorCanAssign: true,
            targetIsAdmin: target.role === 'admin', next, current,
        });
        if (!verdict.ok) throw new AccessAdminError(verdict.reason);

        await prisma.$transaction(async (tx) => {
            await tx.userAccessProfile.upsert({
                where: { user_id: target.id },
                create: { user_id: target.id, created_by: actor.userId, company_id: actor.companyId, preset: next.preset, modules: next.modules, permissions: next.permissions as object, note: input.note?.trim() || null, updated_by: actor.userId },
                update: { company_id: actor.companyId, preset: next.preset, modules: next.modules, permissions: next.permissions as object, note: input.note?.trim() || null, updated_by: actor.userId },
            });
            await tx.user.update({ where: { id: target.id }, data: { role: next.preset, access_version: { increment: 1 } } });
            await syncPrimaryRole(tx, actor.companyId, target.id, target.organizationId, next.preset, actor.userId);
            await tx.accessChangeLog.create({
                data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: target.id, change: { event: existing ? 'profile.update' : 'profile.create', ...diff(current, next) } as object },
            });
            await tx.system_audit_logs.create({
                data: {
                    user_id: actor.userId, action: 'ACCESS_PROFILE_SAVE', module: 'hr', entity_type: 'user', entity_id: target.id,
                    details: `Set access for ${target.name ?? target.username}: ${next.modules.length} module(s), base role ${next.preset}`, organizationId: actor.unitId,
                },
            });
        });
        await afterWrite(target.id);
        return { userId: target.id };
    });
}

/** Back to "follows the base role only" (today's behaviour for everyone who never had a profile). */
export async function removeProfile(actor: ProfileActor, targetUserId: string) {
    return wrap(async () => {
        const target = await targetUser(actor, targetUserId);
        const existing = await loadProfile(target.id);
        if (!existing) throw new AccessAdminError('This person has no custom access profile.');
        const next = presetValue(target.role);
        const verdict = checkProfileChange({
            actorId: actor.userId, targetUserId: target.id, actorIsAdmin: actor.isAdmin, actorCanAssign: true,
            targetIsAdmin: target.role === 'admin', next, current: existing,
        });
        if (!verdict.ok) throw new AccessAdminError(verdict.reason);

        await deleteProfileRow(target.id);
        await prisma.user.update({ where: { id: target.id }, data: { access_version: { increment: 1 } } });
        await prisma.accessChangeLog.create({ data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: target.id, change: { event: 'profile.remove', ...diff(existing, next) } as object } });
        await prisma.system_audit_logs.create({
            data: { user_id: actor.userId, action: 'ACCESS_PROFILE_REMOVE', module: 'hr', entity_type: 'user', entity_id: target.id, details: `Reset access of ${target.name ?? target.username} to the ${target.role} role`, organizationId: actor.unitId },
        });
        await afterWrite(target.id);
    });
}

export interface NewLoginInput { username?: string; password?: string; profile: SaveProfileInput; note?: string }

/** Validate everything about a new login WITHOUT writing, so a create-employee call can fail before it creates anything. */
export async function precheckNewLogin(actor: ProfileActor, input: NewLoginInput) {
    return wrap(async () => {
        const next = normalizeProfile(input.profile);
        assertModulesAvailable(actor, next);
        const verdict = checkProfileChange({
            actorId: actor.userId, targetUserId: '__new__', actorIsAdmin: actor.isAdmin, actorCanAssign: true, targetIsAdmin: false,
            next, current: { preset: '', modules: [], permissions: {} },
        });
        if (!verdict.ok) throw new AccessAdminError(verdict.reason);
        if (input.username !== undefined && input.username.trim()) {
            const u = input.username.trim();
            if (!USERNAME_RE.test(u)) throw new AccessAdminError('Username must be 3–60 characters (letters, digits . _ @ -).');
            if (await prisma.user.findUnique({ where: { username: u }, select: { id: true } })) throw new AccessAdminError('That username is already taken.');
        }
        if (input.password !== undefined && input.password && input.password.length < 8) throw new AccessAdminError('Password must be at least 8 characters.');
        return next;
    });
}

/** Give an existing employee (who has no login yet) a login with a custom access profile. Credentials are returned once. */
export async function createLoginForEmployee(actor: ProfileActor, employeeId: number, input: NewLoginInput) {
    return wrap(async () => {
        const employee = await prisma.employee.findFirst({
            where: { id: employeeId, organization: { company_id: actor.companyId } },
            select: { id: true, employee_code: true, name: true, phone: true, email: true, designation: true, user_id: true, organizationId: true, is_active: true },
        });
        if (!employee) throw new AccessAdminError('Employee not found.');
        if (employee.user_id) throw new AccessAdminError('This employee already has a login.');
        if (!employee.is_active) throw new AccessAdminError('This employee is inactive.');
        const unit = await prisma.organization.findFirst({ where: { id: employee.organizationId, company_id: actor.companyId }, select: { id: true } });
        if (!unit) throw new AccessAdminError('That employee belongs to a unit outside your company.');

        const next = await precheckNewLogin(actor, input);
        const username = input.username?.trim() || employee.employee_code;
        if (!USERNAME_RE.test(username)) throw new AccessAdminError('Username must be 3–60 characters (letters, digits . _ @ -).');
        if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new AccessAdminError(`The username "${username}" is already taken. Choose another.`);
        const generated = !input.password;
        const password = input.password || tempPassword();
        if (password.length < 8) throw new AccessAdminError('Password must be at least 8 characters.');
        const hash = await bcrypt.hash(password, 10);

        const userId = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    username, password: hash, name: employee.name, role: next.preset, organizationId: unit.id, company_id: actor.companyId, is_active: true,
                    email: employee.email, phone: employee.phone, designation: employee.designation,
                },
                select: { id: true },
            });
            await tx.employee.update({ where: { id: employee.id }, data: { user_id: user.id } });
            await syncPrimaryRole(tx, actor.companyId, user.id, unit.id, next.preset, actor.userId);
            await tx.userAccessProfile.create({
                data: { user_id: user.id, company_id: actor.companyId, preset: next.preset, modules: next.modules, permissions: next.permissions as object, note: input.note?.trim() || null, created_by: actor.userId, updated_by: actor.userId },
            });
            await tx.accessChangeLog.create({
                data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: user.id, change: { event: 'login.create', username, employeeCode: employee.employee_code, ...diff({ preset: '', modules: [], permissions: {} }, next) } as object },
            });
            await tx.system_audit_logs.create({
                data: { user_id: actor.userId, action: 'CREATE_USER', module: 'hr', entity_type: 'user', entity_id: user.id, details: `Created login ${username} for employee ${employee.employee_code} (${employee.name}) with role ${next.preset}`, organizationId: unit.id },
            });
            return user.id;
        });
        await afterWrite(userId);
        return { userId, username, temporaryPassword: generated ? password : null };
    });
}

/**
 * May this actor manage the target's LOGIN (switch it on/off, reset its password)? Resetting a password lets the actor
 * sign in as that person, so a non-admin may not do it for anyone who holds Finance / Insurance / "assign access"
 * rights or the Admin role - the same slice they cannot hand out.
 */
async function assertMayManageLogin(actor: ProfileActor, target: { id: string; role: string }) {
    if (target.id === actor.userId) throw new AccessAdminError('You cannot do that to your own login.');
    if (actor.isAdmin) return;
    if (target.role === 'admin') throw new AccessAdminError('Only an administrator can manage an administrator’s login.');
    const profile = await loadProfile(target.id);
    const known = listPresets().some((p) => p.slug === target.role);
    const effective: AccessProfileValue = profile ?? (known ? presetValue(target.role) : { preset: target.role, modules: [], permissions: {} });
    if (restrictedSlice(effective).length || HR_RESTRICTED_PRESETS.includes(effective.preset)) {
        throw new AccessAdminError('Only an administrator can manage logins that have Finance, Insurance or “assign access” rights.');
    }
}

async function loginOfEmployee(actor: ProfileActor, employeeId: number) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, organization: { company_id: actor.companyId } }, select: { user_id: true, name: true } });
    if (!employee?.user_id) return null;
    return { employee, target: await targetUser(actor, employee.user_id) };
}

/** Switch a login on/off together with the employee's active flag (offboarding without leaving a live login behind). */
export async function setLoginActive(actor: ProfileActor, employeeId: number, active: boolean) {
    return wrap(async () => {
        const found = await loginOfEmployee(actor, employeeId);
        if (!found) return { changed: false };
        const { target } = found;
        await assertMayManageLogin(actor, target);
        if (target.is_active === active) return { changed: false };
        await prisma.user.update({ where: { id: target.id }, data: { is_active: active, access_version: { increment: 1 } } });
        await prisma.accessChangeLog.create({ data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: target.id, change: { event: active ? 'login.enable' : 'login.disable' } as object } });
        await afterWrite(target.id);
        return { changed: true };
    });
}

/** New password for an employee's login (generated unless one is supplied). Returned once; the old one stops working. */
export async function resetLoginPassword(actor: ProfileActor, employeeId: number, password?: string) {
    return wrap(async () => {
        const found = await loginOfEmployee(actor, employeeId);
        if (!found) throw new AccessAdminError('This employee has no login.');
        const { target } = found;
        await assertMayManageLogin(actor, target);
        const generated = !password;
        const next = password || tempPassword();
        if (next.length < 8) throw new AccessAdminError('Password must be at least 8 characters.');
        await prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(next, 10) } });
        await prisma.accessChangeLog.create({ data: { company_id: actor.companyId, actor_id: actor.userId, target_user_id: target.id, change: { event: 'login.password_reset' } as object } });
        await prisma.system_audit_logs.create({
            data: { user_id: actor.userId, action: 'RESET_PASSWORD', module: 'hr', entity_type: 'user', entity_id: target.id, details: `Reset password of ${target.name ?? target.username}`, organizationId: actor.unitId },
        });
        return { username: target.username, temporaryPassword: generated ? next : null };
    });
}

/** Make the change visible at once on this instance (other instances catch up within the 30–60 s cache TTLs). */
async function afterWrite(userId: string) {
    clearEntitlementCache();
    clearManagedCache(userId);
}
