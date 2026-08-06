import { getSession } from '@/app/lib/session';

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
): Promise<PharmacyDenial | null> {
    const session = await getSession();

    // No staff session at all — either signed out, or holding only a patient /
    // super-admin / dev-portal cookie. None of those may touch pharmacy data.
    if (!session?.organization_id) {
        return { success: false, error: 'Not signed in as staff. Please log in.' };
    }

    if (!allowedRoles.includes(session.role)) {
        return {
            success: false,
            error: `Access denied — your role (${session.role || 'unknown'}) cannot perform this pharmacy action.`,
        };
    }

    return null;
}
