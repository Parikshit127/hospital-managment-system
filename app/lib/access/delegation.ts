/**
 * Delegated administration rules — docs/COMPANY_OS_PLAN.md §5 rules 7–8, ADR-007. Pure and edge-safe so every
 * rule is unit-tested without a database; the service layer feeds it the actor's resolved entitlements.
 *
 *   1. You need `admin.access.assign` in the unit you are acting on.
 *   2. You can hand out only what you hold yourself: every permission in the role / override you grant must be
 *      one you hold in that unit. (An HR admin can hand out HR roles; they can never mint a finance admin.)
 *   3. The admin template ("everything enabled in the unit") can be granted only by someone who holds it.
 *   4. A company-wide grant (unit = all units) needs a company owner.
 *   5. You can never change your own access.
 *   6. Nobody can remove the last company owner (break-glass guarantee).
 */
import { can, type Entitlements } from './resolve';

export type Denial = { ok: false; reason: string; missing?: string[] };
export type Allowed = { ok: true };

export interface GrantRequest {
    actorId: string;
    targetUserId: string;
    /** The actor's entitlements IN THE UNIT being acted on (null unit ⇒ evaluate in the actor's home unit). */
    actorEnt: Pick<Entitlements, 'permissions' | 'denied' | 'modules' | 'isAdmin' | 'isCompanyOwner'>;
    /** null = company-wide (every unit). */
    unit: string | null;
    /** The stored permission keys the granted role / override carries. */
    keys: readonly string[];
    /** True when the thing being granted is the admin access template. */
    grantsAdminTemplate?: boolean;
}

const deny = (reason: string, missing?: string[]): Denial => ({ ok: false, reason, ...(missing ? { missing } : {}) });

export function checkGrant(r: GrantRequest): Allowed | Denial {
    if (r.actorId === r.targetUserId) return deny('You cannot change your own access.');

    if (can(r.actorEnt as Entitlements, 'admin.access.assign') === null) return deny('You do not have permission to assign access in this unit.');

    if (r.unit === null && !r.actorEnt.isCompanyOwner) return deny('Only a company owner can grant company-wide access.');

    if (r.grantsAdminTemplate && !r.actorEnt.isAdmin) return deny('Only an administrator can grant the administrator role.');

    // An administrator holds every permission in their unit, so the subset rule is satisfied by construction.
    if (!r.actorEnt.isAdmin) {
        const missing = r.keys.filter((k) => can(r.actorEnt as Entitlements, k) === null);
        if (missing.length) return deny(`You can only grant permissions you hold yourself. Missing: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`, missing);
    }
    return { ok: true };
}

/** Removing access: same actor rules, but the subset rule does not apply (taking away is never escalation). */
export function checkRevoke(r: Omit<GrantRequest, 'keys' | 'grantsAdminTemplate'> & { revokesAdminTemplate?: boolean }): Allowed | Denial {
    if (r.actorId === r.targetUserId) return deny('You cannot change your own access.');
    if (can(r.actorEnt as Entitlements, 'admin.access.assign') === null) return deny('You do not have permission to change access in this unit.');
    if (r.unit === null && !r.actorEnt.isCompanyOwner) return deny('Only a company owner can change company-wide access.');
    if (r.revokesAdminTemplate && !r.actorEnt.isAdmin) return deny('Only an administrator can remove the administrator role.');
    return { ok: true };
}

/** Break-glass: refuse an action that would leave the company with no active company owner. */
export function checkNotLastOwner(activeOwnerIds: readonly string[], affectedUserId: string): Allowed | Denial {
    const remaining = activeOwnerIds.filter((id) => id !== affectedUserId);
    if (activeOwnerIds.includes(affectedUserId) && remaining.length === 0) {
        return deny('This is the last company owner. Make another user a company owner first.');
    }
    return { ok: true };
}
