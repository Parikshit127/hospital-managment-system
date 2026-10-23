import { getAccessEngineMode, getCompanyIdForOrg } from '@/app/lib/feature-flags';
import { getEntitlements } from './entitlements';
import { claimModules, type AccessClaims } from './claims';
import { hasProfileRow } from './profile-store';

/**
 * Mint access claims for a staff JWT (server-only). Returns null — "no claims, behave exactly as before" — unless
 * the user has a per-employee access profile, or the unit's access_engine flag is `enforce` AND the user has been
 * provisioned by the Phase 2 backfill.
 * Any failure also returns null: minting claims must never stop a login.
 */
export async function buildAccessClaims(user: { id: string; role: string; organization_id: string }): Promise<AccessClaims | null> {
    try {
        const companyId = await getCompanyIdForOrg(user.organization_id);
        const mode = await getAccessEngineMode(user.organization_id, companyId);
        // Per-employee access profile: governed by the new engine whatever the unit flag says. An uncached one-row
        // check - this runs at login / refresh only, and must see a profile saved a moment ago on another instance.
        if (mode !== 'enforce' && !(await hasProfileRow(user.id))) return null;
        const ent = await getEntitlements(user.id, user.organization_id);
        if (!ent.provisioned) return null;
        return { cid: ent.companyId, eid: ent.employeeId, mods: claimModules(ent, user.role), mv: ent.version, ae: 'enforce' };
    } catch {
        return null;
    }
}
