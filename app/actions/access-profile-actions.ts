'use server';

/**
 * Server actions behind the per-employee "Login & Access" screens (HR employee pages and Admin → user access).
 * Thin: the rules live in app/lib/access/profile-service.ts and app/lib/access/presets.ts.
 *
 * Guards (ACCESS_PROFILES_PLAN.md): reading needs `hr.employee.view`; changing anything needs `hr.access.assign`
 * (today exactly admin and the HR role, because the key is tied to `hr.create`). What a non-admin may actually hand
 * out is then decided by `checkProfileChange`: never Admin / Finance / Insurance, never their own access.
 */
import { requireAccess } from '@/app/lib/access/require-access';
import { hasPermission } from '@/app/lib/session';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { AccessAdminError } from '@/app/lib/access/admin-service';
import {
    createLoginForEmployee, getAccessStatus, getEditorSetup, getEmployeeAccess, loadProfileActor, precheckNewLogin, removeProfile,
    resetLoginPassword, saveProfile, setLoginActive, type NewLoginInput, type ProfileActor, type SaveProfileInput,
} from '@/app/lib/access/profile-service';
import { createEmployee } from '@/app/actions/hr-actions';

type Result<T> = { success: true; data: T } | { success: false; error: string };

type LegacyKey = 'view' | 'create';
const legacy = (action: LegacyKey) => async () => {
    if (!(await hasPermission(`hr.${action}`))) throw new ForbiddenError(`FORBIDDEN_ERROR: hr.${action} required`);
};

async function run<T>(permission: 'hr.employee.view' | 'hr.access.assign', fn: (actor: ProfileActor) => Promise<T>): Promise<Result<T>> {
    try {
        const ctx = await requireAccess(permission, { target: permission, legacy: legacy(permission === 'hr.employee.view' ? 'view' : 'create') });
        const actor = await loadProfileActor(ctx.session);
        return { success: true, data: await fn(actor) };
    } catch (e) {
        if (e instanceof AccessAdminError) return { success: false, error: e.message };
        if (e instanceof AuthError) return { success: false, error: 'Session expired. Please log in again.' };
        if (e instanceof ForbiddenError) return { success: false, error: 'You do not have permission to do that.' };
        console.error(`[access-profile] ${permission} failed`, e);
        return { success: false, error: 'Something went wrong. Please try again.' };
    }
}

// ───── reading ─────
export async function getAccessEditorSetupAction() {
    return run('hr.employee.view', (a) => getEditorSetup(a));
}
export async function getEmployeeAccessAction(employeeId: number) {
    return run('hr.employee.view', (a) => getEmployeeAccess(a, employeeId));
}
export async function getAccessStatusAction(employeeIds: number[]) {
    return run('hr.employee.view', (a) => getAccessStatus(a, employeeIds.slice(0, 200)));
}

// ───── writing ─────
export async function saveEmployeeAccessAction(userId: string, input: SaveProfileInput) {
    return run('hr.access.assign', (a) => saveProfile(a, userId, input));
}
export async function resetEmployeeAccessAction(userId: string) {
    return run('hr.access.assign', (a) => removeProfile(a, userId));
}
export async function createLoginForEmployeeAction(employeeId: number, input: NewLoginInput) {
    return run('hr.access.assign', (a) => createLoginForEmployee(a, employeeId, input));
}
export async function setEmployeeLoginActiveAction(employeeId: number, active: boolean) {
    return run('hr.access.assign', (a) => setLoginActive(a, employeeId, active));
}

export async function resetEmployeePasswordAction(employeeId: number, password?: string) {
    return run('hr.access.assign', (a) => resetLoginPassword(a, employeeId, password));
}

type NewEmployeeInput = Parameters<typeof createEmployee>[0];

/**
 * Add an employee and, optionally, their login + access profile in one go. The login is fully validated BEFORE the
 * employee is created, so the common failures (taken username, a module HR may not hand out) leave nothing behind.
 */
export async function createEmployeeWithAccessAction(input: { employee: NewEmployeeInput; login?: NewLoginInput }) {
    return run('hr.employee.view', async (actor) => {
        if (input.login) {
            // changing access needs the stronger right - checked here rather than silently skipped
            await requireAccess('hr.access.assign', { target: 'hr.access.assign', legacy: legacy('create') });
            await precheckNewLogin(actor, input.login);
        }
        const created = await createEmployee(input.employee);
        if (!created.success) throw new AccessAdminError((created as { error?: string }).error ?? 'Could not create the employee.');
        const employee = (created as { data: { id: number; employee_code: string; name: string } }).data;
        if (!input.login) return { employeeId: employee.id, employeeCode: employee.employee_code, login: null, loginError: null as string | null };
        try {
            const login = await createLoginForEmployee(actor, employee.id, input.login);
            return { employeeId: employee.id, employeeCode: employee.employee_code, login, loginError: null as string | null };
        } catch (e) {
            const msg = e instanceof AccessAdminError ? e.message : 'The login could not be created.';
            return { employeeId: employee.id, employeeCode: employee.employee_code, login: null, loginError: msg };
        }
    });
}
