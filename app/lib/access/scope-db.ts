import { prisma, getTenantPrisma } from '@/backend/db';

/**
 * DB-backed scope helpers (server-only). See scope.ts for the pure part.
 */

const TEAM_TTL_MS = 60_000;
const teamCache = new Map<string, { at: number; ids: number[] }>();

/** An employee plus everyone below them in the reporting line (cycle-safe, depth-limited). */
export async function reportIds(employeeId: number): Promise<number[]> {
    const hit = teamCache.get(String(employeeId));
    if (hit && Date.now() - hit.at < TEAM_TTL_MS) return hit.ids;

    const seen = new Set<number>([employeeId]);
    let frontier = [employeeId];
    for (let depth = 0; depth < 8 && frontier.length; depth++) {
        const rows = await prisma.employee.findMany({
            where: { reporting_manager_id: { in: frontier } },
            select: { id: true },
        });
        frontier = [];
        for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); frontier.push(r.id); }
    }
    const ids = [...seen];
    teamCache.set(String(employeeId), { at: Date.now(), ids });
    return ids;
}

export function clearTeamCache(): void {
    teamCache.clear();
}

/**
 * Tenant-scoped Prisma for a unit. Phase 3 keeps `getTenantPrisma` as the engine (unit-level models are
 * filtered by organizationId); company-level models gain `company_id` scoping when they exist (Phase 5+).
 */
export function getScopedPrisma(ctx: { companyId?: string | null; unitId: string }) {
    return getTenantPrisma(ctx.unitId);
}

const delegate = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/**
 * getTenantPrisma scopes reads/creates but NOT update/delete/upsert-by-id (docs/ARCHITECTURE_BRIEF.md §8).
 * These write by `{ id, organizationId }` through updateMany/deleteMany so a forged id from another unit
 * matches zero rows. Returns the number of rows changed (0 = not found in this unit).
 */
export async function updateByIdInUnit(model: string, id: string | number, unitId: string, data: Record<string, unknown>): Promise<number> {
    const res = await (prisma as any)[delegate(model)].updateMany({ where: { id, organizationId: unitId }, data });
    return res.count as number;
}

export async function deleteByIdInUnit(model: string, id: string | number, unitId: string): Promise<number> {
    const res = await (prisma as any)[delegate(model)].deleteMany({ where: { id, organizationId: unitId } });
    return res.count as number;
}
