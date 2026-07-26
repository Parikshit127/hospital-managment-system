/**
 * The role check that runs when a server action is invoked.
 *
 * proxy.ts guards page *routes*. It cannot guard actions: a server action is a
 * POST to whatever route the caller is standing on, so a role allowed on that
 * page can invoke any action reachable from it. That is how a nurse, on the
 * /ipd discharge screen that proxy.ts legitimately lets her open, discharged a
 * patient and settled a bill — the role table forbids it and nothing asked.
 *
 * Applied to mutating actions only. Reads already run through the tenant-scoped
 * client so they cannot cross hospitals, and guarding them would break the many
 * screens that legitimately read another module's data — a nurse reading lab
 * results, a doctor reading a bill.
 *
 * Not a 'use server' module: it is imported by them, and every export there
 * must be an async action.
 */

import { getSession } from '@/app/lib/session';
import { policyFor, ANY_STAFF } from '@/app/lib/action-policy';

export type Denial = { success: false; error: string };

/**
 * Roles the organisation defined itself, which do not appear in any built-in
 * list. proxy.ts falls back to their JWT permissions for page access rather
 * than rejecting them; blocking them here would silently break a hospital that
 * uses custom roles, so they are allowed through and remain governed by the
 * route guard exactly as they are today.
 */
function isBuiltInRole(role: string): boolean {
    return ANY_STAFF.includes(role) || role === 'superadmin' || role === 'patient';
}

export async function guardAction(
    moduleKey: string,
    actionName: string,
): Promise<Denial | null> {
    const session = await getSession();
    if (!session) return { success: false, error: 'Not signed in.' };

    // superadmin operates across organisations by design.
    if (session.role === 'superadmin') return null;
    if (!isBuiltInRole(session.role)) return null;

    const allowed = policyFor(moduleKey);
    if (allowed.includes(session.role)) return null;

    return {
        success: false,
        error: `Your role (${session.role}) is not permitted to ${humanise(actionName)}.`,
    };
}

/** "settleAndDischarge" -> "settle and discharge", for a message a human reads. */
function humanise(actionName: string): string {
    return actionName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\bAnd\b/g, 'and')
        .toLowerCase()
        .trim();
}
