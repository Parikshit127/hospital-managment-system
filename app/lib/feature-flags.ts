import { prisma } from '@/backend/db';

/**
 * Feature flags for staged rollouts (see docs/COMPANY_OS_PLAN.md §0 rule 5).
 *
 * Contract: reading a flag NEVER throws and NEVER blocks a request. If the
 * `feature_flags` table does not exist yet (migration not applied), the row is
 * missing, or the DB hiccups, the caller gets the supplied default — so shipping
 * code that calls getFlag() is safe before the migration is applied.
 *
 * Server-only (uses Prisma). Not for proxy.ts / the Edge runtime.
 */

export type FlagScopeType = 'platform' | 'company' | 'organization';

export type AccessEngineMode = 'legacy' | 'shadow' | 'enforce';

const TTL_MS = 30_000;
const cache = new Map<string, { value: string | null; at: number }>();

function cacheKey(scopeType: string, scopeId: string, key: string) {
    return `${scopeType}:${scopeId}:${key}`;
}

/** Raw read of one flag row; null when absent or unreadable. Cached for 30 s. */
async function readFlag(scopeType: FlagScopeType, scopeId: string, key: string): Promise<string | null> {
    const ck = cacheKey(scopeType, scopeId, key);
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    let value: string | null = null;
    try {
        const row = await prisma.featureFlag.findUnique({
            where: { scope_type_scope_id_key: { scope_type: scopeType, scope_id: scopeId, key } },
            select: { value: true },
        });
        value = row?.value ?? null;
    } catch {
        value = null; // table missing / DB error → fall back to default
    }
    cache.set(ck, { value, at: Date.now() });
    return value;
}

export async function getFlag(
    scopeType: FlagScopeType,
    scopeId: string,
    key: string,
    defaultValue: string,
): Promise<string> {
    return (await readFlag(scopeType, scopeId, key)) ?? defaultValue;
}

/** Drop cached values (call after writing a flag, and in tests). */
export function clearFlagCache(): void {
    cache.clear();
    companyCache.clear();
}

/**
 * Resolve the access-engine mode for a unit. Most specific wins:
 * organization → company → platform → 'legacy'. Anything unrecognised is 'legacy'.
 * (`companyId` is optional until the Company model exists — Phase 2.)
 */
export async function getAccessEngineMode(organizationId: string, companyId?: string | null): Promise<AccessEngineMode> {
    const candidates: Array<[FlagScopeType, string]> = [['organization', organizationId]];
    if (companyId) candidates.push(['company', companyId]);
    candidates.push(['platform', 'global']);

    for (const [t, id] of candidates) {
        const v = await readFlag(t, id, 'access_engine');
        if (v === 'legacy' || v === 'shadow' || v === 'enforce') return v;
    }
    return 'legacy';
}

// ─── unit → company (needed to resolve a company-level flag) ───────────────

const companyCache = new Map<string, { value: string | null; at: number }>();

/** The company that owns a unit, or null (not backfilled yet / column missing / DB error). Cached for 60 s. */
export async function getCompanyIdForOrg(organizationId: string): Promise<string | null> {
    const hit = companyCache.get(organizationId);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    let value: string | null = null;
    try {
        const row = await prisma.organization.findUnique({ where: { id: organizationId }, select: { company_id: true } });
        value = row?.company_id ?? null;
    } catch {
        value = null;
    }
    companyCache.set(organizationId, { value, at: Date.now() });
    return value;
}
