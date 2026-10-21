import { getSession } from '@/app/lib/session';
import { requireAccess } from '@/app/lib/access/require-access';
import { AuthError, ForbiddenError } from '@/backend/tenant';

/**
 * Role gate for the pharmacy server-action layer.
 *
 * Why this exists: every action in pharmacy-actions.ts used to start with
 * `requireTenantContext()`, which only proves *somebody* is logged in — and it
 * falls back to `getPatientSession()`, so a patient logged into the patient
 * portal satisfied it. Server actions are addressed by action ID and can be
 * POSTed from any page, so proxy.ts's `/pharmacy → [admin, pharmacist]` route
 * gate does NOT protect them: a nurse sitting on /nurse could invoke
 * adjustStock or receivePurchaseOrder directly.
 *
 * These checks read the STAFF session only (`getSession`), never the patient
 * session, which closes that hole outright.
 *
 * The tiers below are deliberately no wider than proxy.ts already allows for
 * the screens that call them, so no existing user loses access:
 *   /pharmacy/*       → admin, pharmacist
 *   /admin/pharmacy/* → admin
 * The one deliberate widening is CATALOG (read-only medicine/stock lookup),
 * which matches the `pharmacy.view` permission that SYSTEM_ROLE_PERMISSIONS in
 * session.ts already grants to clinical roles, and RETURNS, which nurses reach
 * through nurse-actions.ts `returnIndentMedicine`.
 */

/** Read-only medicine + stock lookup. Mirrors the `pharmacy.view` permission. */
export const PHARMACY_CATALOG_ROLES = [
    'admin', 'pharmacist', 'doctor', 'nurse',
    'ipd_manager', 'opd_manager', 'ot_manager', 'er_staff',
] as const;

/** Dispensing, billing, stock movement, registers, pharmacy financials. */
export const PHARMACY_OPERATE_ROLES = ['admin', 'pharmacist'] as const;

/** Suppliers, purchase orders, GRN, purchase invoices, supplier payments. */
export const PHARMACY_PROCUREMENT_ROLES = ['admin', 'pharmacist'] as const;

/**
 * Approving a purchase order is the checker half of maker-checker — a
 * pharmacist must not approve their own PO, so this stays admin-only.
 */
export const PHARMACY_PO_APPROVE_ROLES = ['admin'] as const;

/** Patient returns. Nurses file these from the ward indent screen. */
export const PHARMACY_RETURN_ROLES = ['admin', 'pharmacist', 'nurse'] as const;

/**
 * Deliberately carries no `data` key. Actions in this module return `data` as a
 * list in some cases and an object in others, so a fixed shape here would
 * collide with one of them; callers already read `data` only after checking
 * `success`, and TypeScript narrows this branch out for them.
 */
export type PharmacyDenial = { success: false; error: string };

/**
 * Returns a ready-to-return denial object when the caller may not perform the
 * action, or `null` when they may. Call it as the FIRST statement of an action,
 * outside its try/catch, so the reason reaches the UI verbatim instead of being
 * flattened into that action's generic "Failed to ..." catch message:
 *
 *   const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
 *   if (denied) return denied;
 */
export async function denyUnlessPharmacyRole(
    allowedRoles: readonly string[],
    permission?: string,
): Promise<PharmacyDenial | null> {
    // Company-OS: each tier has an equivalent `pharmacy.*` permission (proven equal to the role list by
    // tests/access/permission-parity.test.ts). The OLD role-list check below is still what decides while the
    // unit's access_engine flag is `legacy` (default) or `shadow`; only `enforce` lets the new engine decide.
    const perm = permission ?? TIER_PERMISSION.get(allowedRoles);
    if (!perm) return legacyDenial(allowedRoles);

    try {
        await requireAccess(perm, {
            target: perm,
            legacy: async () => {
                const denial = await legacyDenial(allowedRoles);
                if (denial) throw new ForbiddenError(denial.error);
            },
        });
        return null;
    } catch (e) {
        if (e instanceof AuthError) return { success: false, error: NOT_SIGNED_IN };
        if (e instanceof ForbiddenError) {
            // A legacy denial carries its own message; an engine denial gets the standard one.
            return { success: false, error: e.message.startsWith('FORBIDDEN_ERROR') ? await standardDenial(allowedRoles) : e.message };
        }
        // Anything unexpected inside the new machinery must not change pharmacy behaviour: answer exactly as before.
        console.error('[pharmacy-access] access engine error — using the legacy role check', e);
        return legacyDenial(allowedRoles);
    }
}

const NOT_SIGNED_IN = 'Not signed in as staff. Please log in.';

async function standardDenial(allowedRoles: readonly string[]): Promise<string> {
    const session = await getSession();
    void allowedRoles;
    return `Access denied — your role (${session?.role || 'unknown'}) cannot perform this pharmacy action.`;
}

/** The original role-list check, unchanged. */
async function legacyDenial(allowedRoles: readonly string[]): Promise<PharmacyDenial | null> {
    const session = await getSession();

    // No staff session at all — either signed out, or holding only a patient /
    // super-admin / dev-portal cookie. None of those may touch pharmacy data.
    if (!session?.organization_id) {
        return { success: false, error: NOT_SIGNED_IN };
    }

    if (!allowedRoles.includes(session.role)) {
        return {
            success: false,
            error: `Access denied — your role (${session.role || 'unknown'}) cannot perform this pharmacy action.`,
        };
    }

    return null;
}

/** Tier (by array identity) → the equivalent permission in the module registry. */
const TIER_PERMISSION = new Map<readonly string[], string>([
    [PHARMACY_CATALOG_ROLES, 'pharmacy.catalog.view'],
    [PHARMACY_OPERATE_ROLES, 'pharmacy.dispense.execute'],
    [PHARMACY_PROCUREMENT_ROLES, 'pharmacy.purchase.create'],
    [PHARMACY_PO_APPROVE_ROLES, 'pharmacy.purchase.approve'],
    [PHARMACY_RETURN_ROLES, 'pharmacy.return.create'],
]);
