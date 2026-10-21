/**
 * Data scope → Prisma `where` (docs/COMPANY_OS_PLAN.md §7.4). Pure and edge-safe; the DB-backed helpers
 * (reporting-line lookup, scoped writes) live in scope-db.ts.
 *
 *   OWN        → the row belongs to me          { [employeeField]: myEmployeeId }
 *   TEAM       → me or anyone who reports to me { [employeeField]: { in: [...] } }
 *   DEPARTMENT → my department                  { [departmentField]: myDepartmentId }
 *   UNIT       → my active unit                 { [unitField ?? 'organizationId']: unitId }
 *   COMPANY    → whole company                  { [companyField]: companyId }   (or no extra filter)
 *
 * Fail closed: when the caller has no employee / department, OWN / TEAM / DEPARTMENT match NOTHING rather
 * than everything. A model that has not declared its owner column in the registry cannot be OWN/TEAM/
 * DEPARTMENT-scoped (programmer error → throws), so a missing declaration can never silently widen access.
 */
import { MODULES } from '../modules/registry';
import type { DataScope, ModelOwnership } from '../modules/types';

export interface ScopeContext {
    unitId: string;
    companyId: string | null;
    employeeId: number | null;
    departmentId: string | null;
    /** me + everyone below me in the reporting line; required (and only read) for TEAM scope. */
    teamEmployeeIds?: readonly number[];
}

const OWNERSHIP = new Map<string, ModelOwnership>();
for (const m of MODULES) for (const [model, o] of Object.entries(m.models ?? {})) OWNERSHIP.set(model, o);

export function ownershipOf(model: string): ModelOwnership | undefined {
    return OWNERSHIP.get(model);
}

const NOTHING_INT = -1;
const NOTHING_STR = '__no_match__';

export function scopeWhere(ctx: ScopeContext, scope: DataScope, model: string): Record<string, unknown> {
    const o = OWNERSHIP.get(model);
    switch (scope) {
        case 'COMPANY':
            return o?.companyField && ctx.companyId ? { [o.companyField]: ctx.companyId } : {};
        case 'UNIT':
            return { [o?.unitField ?? 'organizationId']: ctx.unitId };
        case 'DEPARTMENT':
            if (!o?.departmentField) throw new Error(`scopeWhere: model "${model}" declares no departmentField in the registry`);
            return { [o.departmentField]: ctx.departmentId ?? NOTHING_STR };
        case 'OWN':
            if (!o?.employeeField) throw new Error(`scopeWhere: model "${model}" declares no employeeField in the registry`);
            return { [o.employeeField]: ctx.employeeId ?? NOTHING_INT };
        case 'TEAM': {
            if (!o?.employeeField) throw new Error(`scopeWhere: model "${model}" declares no employeeField in the registry`);
            const ids = ctx.teamEmployeeIds?.length ? ctx.teamEmployeeIds : ctx.employeeId != null ? [ctx.employeeId] : [NOTHING_INT];
            return { [o.employeeField]: { in: [...ids] } };
        }
    }
}
