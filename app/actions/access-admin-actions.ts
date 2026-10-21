'use server';

/**
 * Server actions behind /admin/access/* (Company-OS Phase 4). Thin: the rules live in
 * app/lib/access/admin-service.ts and app/lib/access/delegation.ts.
 *
 * Guard: requireAccess('admin.access.*' …) with the pre-Company-OS rule — "role is admin" — as the `legacy` leg,
 * so today only admins reach these (same as the rest of /admin), and a company can later delegate e.g. an HR admin
 * through the new engine. The service then applies the delegation rules on every call.
 */
import { requireAccess } from '@/app/lib/access/require-access';
import { getSession } from '@/app/lib/session';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { prisma } from '@/backend/db';
import {
    AccessAdminError, loadActor, getAccessOverview, listAccessUsers, getUserAccessDetail, listAssignableRoles, assignRole, revokeUserRole,
    addOverride, removeOverride, createStaffWithAccess, offboardUser, previewUserImport, commitUserImport, listRolesForEditor, catalogueForEditor,
    createCustomRole, updateCustomRole, deleteCustomRole, listChangeLog, type Actor, type ListFilters,
} from '@/app/lib/access/admin-service';
import type { DataScope } from '@/app/lib/modules/types';

type Result<T> = { success: true; data: T } | { success: false; error: string };

async function legacyAdminOnly() {
    const session = await getSession();
    if (session?.role !== 'admin') throw new ForbiddenError('FORBIDDEN_ERROR: admin only');
}

async function run<T>(permission: string, fn: (actor: Actor) => Promise<T>): Promise<Result<T>> {
    try {
        const ctx = await requireAccess(permission, { target: permission, legacy: legacyAdminOnly });
        const actor = await loadActor({ id: ctx.session.id, organization_id: ctx.organizationId });
        return { success: true, data: await fn(actor) };
    } catch (e) {
        if (e instanceof AccessAdminError) return { success: false, error: e.message };
        if (e instanceof AuthError) return { success: false, error: 'Session expired. Please log in again.' };
        if (e instanceof ForbiddenError) return { success: false, error: 'You do not have permission to do that.' };
        console.error(`[access-admin] ${permission} failed`, e);
        return { success: false, error: 'Something went wrong. Please try again.' };
    }
}

const date = (v?: string | null) => (v ? new Date(v) : null);

// ───── reading ─────
export async function getAccessOverviewAction() {
    return run('admin.access.view', (a) => getAccessOverview(a));
}
export async function listAccessUsersAction(filters: ListFilters = {}) {
    return run('admin.access.view', (a) => listAccessUsers(a, filters));
}
export async function getUserAccessDetailAction(userId: string) {
    return run('admin.access.view', (a) => getUserAccessDetail(a, userId));
}
export async function listAssignableRolesAction() {
    return run('admin.role.view', (a) => listAssignableRoles(a));
}
export async function listChangeLogAction(filters: { targetUserId?: string; limit?: number } = {}) {
    return run('admin.access.view', (a) => listChangeLog(a, filters));
}

/** Everything the "add user" wizard needs in one round trip. */
export async function getWizardLookupsAction() {
    return run('admin.user.create', async (a) => {
        const [units, designations, departments, managers] = await Promise.all([
            prisma.organization.findMany({ where: { company_id: a.companyId, is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            prisma.designation.findMany({ where: { company_id: a.companyId, is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            prisma.orgDepartment.findMany({ where: { company_id: a.companyId, is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            prisma.employee.findMany({ where: { company_id: a.companyId, is_active: true }, select: { id: true, name: true, employee_code: true }, orderBy: { name: 'asc' }, take: 1000 }),
        ]);
        return { units, designations, departments, managers, roles: await listAssignableRoles(a), catalogue: catalogueForEditor(a), homeUnitId: a.unitId };
    });
}

// ───── assignments & overrides ─────
export async function assignRoleAction(input: { targetUserId: string; roleId: string; unitId: string | null; validTo?: string | null }) {
    return run('admin.access.assign', (a) => assignRole(a, { ...input, validTo: date(input.validTo) }));
}
export async function revokeUserRoleAction(userRoleId: string) {
    return run('admin.access.assign', (a) => revokeUserRole(a, userRoleId));
}
export async function addOverrideAction(input: {
    targetUserId: string; permissionKey: string; effect: 'GRANT' | 'DENY'; scope?: DataScope | null; unitId?: string | null; expiresAt?: string | null; reason: string;
}) {
    return run('admin.access.assign', (a) => addOverride(a, { ...input, expiresAt: date(input.expiresAt) }));
}
export async function removeOverrideAction(overrideId: string) {
    return run('admin.access.assign', (a) => removeOverride(a, overrideId));
}

// ───── people ─────
export async function createStaffAction(input: {
    name: string; username?: string; email?: string; phone?: string; password?: string; employeeCode?: string; designation?: string; designationId?: string | null;
    orgDepartmentId?: string | null; reportingManagerId?: number | null; specialty?: string; dateOfJoining?: string; homeUnitId: string; primaryRole: string;
    extraRoles?: { roleId: string; unitId: string | null }[];
    overrides?: { permissionKey: string; effect: 'GRANT' | 'DENY'; scope?: DataScope | null; reason: string; expiresAt?: string | null }[];
}) {
    return run('admin.user.create', (a) => createStaffWithAccess(a, { ...input, overrides: input.overrides?.map((o) => ({ ...o, expiresAt: date(o.expiresAt) })) }));
}
export async function offboardUserAction(input: { targetUserId: string; reason: string }) {
    return run('admin.user.offboard', (a) => offboardUser(a, input));
}
export async function previewUserImportAction(csv: string) {
    return run('admin.user.create', (a) => previewUserImport(a, csv));
}
export async function commitUserImportAction(csv: string) {
    return run('admin.user.create', (a) => commitUserImport(a, csv));
}

// ───── role editor ─────
export async function listRolesForEditorAction() {
    return run('admin.role.view', async (a) => ({ roles: await listRolesForEditor(a), catalogue: catalogueForEditor(a) }));
}
export async function createCustomRoleAction(input: { name: string; description?: string; permissionKeys?: string[]; cloneFromRoleId?: string }) {
    return run('admin.role.edit', (a) => createCustomRole(a, input));
}
export async function updateCustomRoleAction(roleId: string, input: { name?: string; description?: string; permissionKeys?: string[]; active?: boolean }) {
    return run('admin.role.edit', (a) => updateCustomRole(a, roleId, input));
}
export async function deleteCustomRoleAction(roleId: string) {
    return run('admin.role.edit', (a) => deleteCustomRole(a, roleId));
}
