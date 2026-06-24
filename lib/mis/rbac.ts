/**
 * lib/mis/rbac.ts
 * ---------------
 * Single source of truth for MIS Report role-based access control.
 *
 * ## Design decisions
 *
 * 1. `MISRole` is a plain string union — it maps to `User.role` (a `String`
 *    column in the DB), so we do NOT use an enum to avoid a Prisma migration.
 *    Any user whose `User.role` value is not in `MISRole` falls through to
 *    the `viewer` defaults via `getMISPermissions()`.
 *
 * 2. `ROLE_PERMISSIONS` is the only place where role → permission keys are
 *    defined. Adding a new permission tier requires a single entry here; no
 *    other file needs to change except the registry definition that references
 *    the new key.
 *
 * 3. `MISAccessDeniedError` carries a typed `code` so callers can
 *    `catch (e) { if (e?.code === 'MIS_ACCESS_DENIED') ... }` without an
 *    `instanceof` check that could fail across module boundaries.
 *
 * 4. `assertReportAccess` is a pure, synchronous function — zero I/O — so it
 *    can be called safely inside any Server Action before any DB work begins.
 */

// ─── Role type ────────────────────────────────────────────────────────────────

/**
 * Recognised MIS roles.
 *
 * These values are matched against `User.role` (a plain String in the DB).
 * Unknown role strings fall back to `viewer` permissions via
 * `getMISPermissions()`.
 */
export type MISRole =
  | 'admin'
  | 'finance'
  | 'billing_officer'
  | 'viewer'
  | 'doctor'
  | 'receptionist'
  | 'lab_technician'
  | 'pharmacist'
  | 'ipd_manager'
  | 'ot_manager';

// ─── Permission → Role mapping ────────────────────────────────────────────────

/**
 * Maps each MISRole to the set of `requiredPermission` strings it is allowed
 * to use. Each string must exactly match the `requiredPermission` field on at
 * least one `ReportDefinition` in the registry.
 *
 * Permission tiers (additive):
 *   viewer          → read-only, non-sensitive billing & revenue data
 *   billing_officer → same as viewer (billing ops staff)
 *   finance         → viewer + revenue analytics + admission & inventory data
 *   admin           → all of the above + sensitive financial/payroll/OT reports
 *   ot_manager      → OT-specific reports only
 *
 * Granular specialized permissions (split from mis_reports.specialized.view):
 *   mis_reports.ot.view        → OT Booking, Surgery Details, Surgery TAT
 *   mis_reports.ambulance.view → Ambulance Orders, Request, TAT
 *   mis_reports.optical.view   → Optical Billing, Settlement, Payment
 */
export const ROLE_PERMISSIONS: Record<MISRole, string[]> = {
  admin: [
    'mis_reports.billing.view',
    'mis_reports.billing.admin',   // doctor payouts, discounts, accounts payable
    'mis_reports.revenue.view',
    'mis_reports.finance.view',
    'mis_reports.registration.view',
    'mis_reports.appointment.view',
    'mis_reports.frontdesk.view',
    'mis_reports.admission.view',
    'mis_reports.diagnostic.view',
    'mis_reports.pharmacy.view',
    'mis_reports.inventory.view',
    'mis_reports.ot.view',
    'mis_reports.ambulance.view',
    'mis_reports.optical.view',
  ],
  finance: [
    'mis_reports.billing.view',
    'mis_reports.revenue.view',
    'mis_reports.finance.view',
    'mis_reports.admission.view',  // F3: bed-occupancy & discharge revenue data
    'mis_reports.inventory.view',  // F3: stock valuation for asset reporting
  ],
  billing_officer: [
    'mis_reports.billing.view',
  ],
  doctor: [
    'mis_reports.appointment.view',
    'mis_reports.diagnostic.view',
    'mis_reports.ot.view',         // doctors need their own OT schedule visibility
  ],
  receptionist: [
    'mis_reports.registration.view',
    'mis_reports.appointment.view',
    'mis_reports.frontdesk.view',
  ],
  lab_technician: [
    'mis_reports.diagnostic.view',
  ],
  pharmacist: [
    'mis_reports.pharmacy.view',
    'mis_reports.inventory.view',
  ],
  ipd_manager: [
    'mis_reports.admission.view',
    'mis_reports.frontdesk.view',
    'mis_reports.billing.view',
    'mis_reports.ot.view',
    'mis_reports.ambulance.view',
  ],
  ot_manager: [
    'mis_reports.ot.view',
    'mis_reports.ambulance.view',  // OT coordinators also manage ambulance transport
  ],
  viewer: [
    'mis_reports.billing.view',
  ],
} as const;

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Thrown by `assertReportAccess` when the user's permission set does not
 * include the report's `requiredPermission`.
 *
 * The `code` property allows callers to identify this error type without
 * relying on `instanceof` (which can fail across Next.js module boundaries):
 *
 * ```ts
 * } catch (e: any) {
 *   if (e?.code === 'MIS_ACCESS_DENIED') { ... }
 * }
 * ```
 */
export class MISAccessDeniedError extends Error {
  /** Stable discriminant — use this for `catch` type-narrowing. */
  readonly code = 'MIS_ACCESS_DENIED' as const;

  constructor(requiredPermission: string) {
    super(
      `Access denied: your role does not grant the '${requiredPermission}' ` +
      `permission required to view this report.`
    );
    this.name = 'MISAccessDeniedError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives the MIS permission set for a given `User.role` string.
 *
 * If the role is not a recognised `MISRole`, returns the `viewer` defaults
 * so that unknown/legacy roles are never silently granted elevated access.
 *
 * @param userRole  The raw `User.role` string from the database / session.
 * @returns         An array of permission strings this user may exercise.
 */
export function getMISPermissions(userRole: string): string[] {
  const knownRoles = Object.keys(ROLE_PERMISSIONS) as MISRole[];
  const role = knownRoles.find((r) => r === userRole) ?? 'viewer';
  return ROLE_PERMISSIONS[role];
}

/**
 * Pure synchronous guard — throws `MISAccessDeniedError` if the user's
 * permission set does not contain `requiredPermission`.
 *
 * Call this at the very top of any Server Action that runs a report, before
 * any DB queries, so that unauthorized requests are rejected immediately.
 *
 * @param requiredPermission  The `requiredPermission` key from `ReportDefinition`.
 * @param userPermissions     The resolved permission set from `getMISPermissions()`.
 * @throws {MISAccessDeniedError}
 */
export function assertReportAccess(
  requiredPermission: string,
  userPermissions: string[]
): void {
  if (!userPermissions.includes(requiredPermission)) {
    throw new MISAccessDeniedError(requiredPermission);
  }
}
