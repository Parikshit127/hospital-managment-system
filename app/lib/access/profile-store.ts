import { prisma } from '@/backend/db';
import type { DataScope } from '../modules/types';
import { isDataScope } from './permissions';
import type { AccessProfileValue } from './presets';

/**
 * Persistence for per-employee access profiles (table `user_access_profiles`, ACCESS_PROFILES_PLAN.md). Server-only.
 *
 * Contract: every READ here swallows errors and answers "no profile". That is what makes the feature safe to ship
 * before its migration is applied (the table does not exist yet → nobody is managed → behaviour is exactly as
 * before) and keeps a database hiccup from turning a request into a lock-out. WRITES throw.
 */

const TTL_MS = 30_000;
const managedCache = new Map<string, { at: number; managed: boolean }>();

export function clearManagedCache(userId?: string): void {
    if (userId) managedCache.delete(userId);
    else managedCache.clear();
}

/** Uncached "does this user have a profile row" - for login / token refresh. */
export async function hasProfileRow(userId: string): Promise<boolean> {
    try {
        return !!(await prisma.userAccessProfile.findUnique({ where: { user_id: userId }, select: { user_id: true } }));
    } catch {
        return false;
    }
}

/** Cached (30 s) version for the per-request guard. Saving a profile clears the local cache; other instances catch up within the TTL. */
export async function isProfileManaged(userId: string): Promise<boolean> {
    const hit = managedCache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.managed;
    const managed = await hasProfileRow(userId);
    managedCache.set(userId, { at: Date.now(), managed });
    if (managedCache.size > 5000) managedCache.clear();
    return managed;
}

export interface StoredProfile extends AccessProfileValue {
    note: string | null;
    updatedAt: Date;
    updatedBy: string | null;
}

export function parsePermissions(raw: unknown): Record<string, DataScope> {
    const out: Record<string, DataScope> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isDataScope(v)) out[k] = v;
    }
    return out;
}

export async function loadProfile(userId: string): Promise<StoredProfile | null> {
    try {
        const row = await prisma.userAccessProfile.findUnique({ where: { user_id: userId } });
        if (!row) return null;
        return {
            preset: row.preset, modules: [...row.modules], permissions: parsePermissions(row.permissions),
            note: row.note, updatedAt: row.updated_at, updatedBy: row.updated_by,
        };
    } catch {
        return null;
    }
}

export async function saveProfileRow(input: { userId: string; companyId: string | null; actorId: string; note?: string | null; profile: AccessProfileValue }): Promise<void> {
    const data = {
        company_id: input.companyId, preset: input.profile.preset, modules: input.profile.modules,
        permissions: input.profile.permissions as object, note: input.note?.trim() || null, updated_by: input.actorId,
    };
    await prisma.userAccessProfile.upsert({
        where: { user_id: input.userId },
        create: { user_id: input.userId, created_by: input.actorId, ...data },
        update: data,
    });
    clearManagedCache(input.userId);
}

export async function deleteProfileRow(userId: string): Promise<boolean> {
    const r = await prisma.userAccessProfile.deleteMany({ where: { user_id: userId } });
    clearManagedCache(userId);
    return r.count > 0;
}
