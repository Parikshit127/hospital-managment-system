/**
 * Who may run a server action.
 *
 * Authorization in this codebase was route-based only. proxy.ts decides which
 * *pages* a role may open; nothing checked the role when an *action* ran. Of
 * 1,084 server actions, 121 in 7 files had a guard — every one of them added
 * during the nursing work. The other 963 had none.
 *
 * That is not theoretical. A nurse opened /ipd/discharge-settlement, which
 * proxy.ts allows because the ward screens live under /ipd, and discharged a
 * patient and settled an ₹11,700 bill — while CLINICAL_ROLES.DISCHARGE says
 * nurses may not discharge. The action she called, settleAndDischarge, had no
 * guard at all.
 *
 * The rule here: **a module's policy is never stricter than the page access
 * proxy.ts already grants**, except where the module is explicitly listed below
 * as sensitive. That means every flow that works today through the intended UI
 * keeps working; what stops working is calling an action from a portal that has
 * no business calling it.
 */

// Mirrors ROLE_ROUTES in proxy.ts. If that changes, change this.
export const PORTAL_ROLES: Record<string, string[]> = {
    admin: ['admin'],
    doctor: ['admin', 'doctor'],
    reception: ['admin', 'receptionist', 'opd_manager'],
    lab: ['admin', 'lab_technician', 'doctor', 'nurse'],
    pharmacy: ['admin', 'pharmacist', 'doctor', 'nurse'],
    finance: ['admin', 'finance'],
    ipd: ['admin', 'ipd_manager', 'doctor', 'nurse', 'er_staff', 'ot_manager'],
    discharge: ['admin', 'ipd_manager', 'doctor'],
    opd: ['admin', 'receptionist', 'doctor', 'opd_manager', 'nurse'],
    insurance: ['admin', 'finance', 'ipd_manager'],
    nurse: ['admin', 'nurse'],
    opd_manager: ['admin', 'opd_manager'],
    hr: ['admin', 'hr'],
    ot: ['admin', 'ot_manager', 'doctor', 'nurse'],
    er: ['admin', 'er_staff', 'doctor', 'nurse'],
    billing: ['admin', 'finance', 'ipd_manager', 'receptionist', 'opd_manager'],
};

/** Everyone who can hold a staff session. The honest default for shared reads. */
export const ANY_STAFF = [
    'admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician',
    'finance', 'ipd_manager', 'opd_manager', 'hr', 'er_staff', 'ot_manager',
    'coordinator',
];

/**
 * Money. Posting charges, discounts, write-offs, ledger entries and settlement
 * are finance decisions wherever the screen happens to live — an /ipd page does
 * not make a nurse an accountant.
 */
const MONEY = ['admin', 'finance', 'ipd_manager', 'receptionist'];

/** Ending an admission. Deliberately excludes nurses, as CLINICAL_ROLES does. */
const DISCHARGE = ['admin', 'ipd_manager', 'doctor'];

/** Configuration, users, roles, master data. */
const ADMIN_ONLY = ['admin'];

/**
 * Per-module policy, keyed by the action file's basename without extension.
 *
 * Anything not listed falls back to the portal derived from the filename, and
 * finally to ANY_STAFF — which is no weaker than today, since today there is no
 * check at all.
 */
export const MODULE_POLICY: Record<string, string[]> = {
    // ── money ────────────────────────────────────────────────────────────────
    'ipd-finance-actions': MONEY,
    'finance-actions': ['admin', 'finance'],
    'billing-engine': MONEY,
    'billing-actions': MONEY,
    'deposit-actions': MONEY,
    'expense-actions': ['admin', 'finance'],
    'bank-actions': ['admin', 'finance'],
    'budget-actions': ['admin', 'finance'],
    'dunning-actions': MONEY,
    'approval-center-actions': ['admin', 'finance', 'ipd_manager'],
    'doctor-commission-actions': ['admin', 'finance'],
    'insurance-actions': ['admin', 'finance', 'ipd_manager'],
    'tpa-actions': ['admin', 'finance', 'ipd_manager', 'receptionist'],
    'refund-actions': MONEY,
    'writeoff-actions': ['admin', 'finance'],

    // ── ending an admission ──────────────────────────────────────────────────
    'discharge-actions': DISCHARGE,

    // ── configuration and master data ────────────────────────────────────────
    'admin-actions': ADMIN_ONLY,
    'branch-actions': ADMIN_ONLY,
    'role-actions': ADMIN_ONLY,
    'user-actions': ADMIN_ONLY,
    'organization-actions': ADMIN_ONLY,
    'asset-management-actions': ['admin', 'finance'],
    'asset-register-actions': ['admin', 'finance'],
    'doctor-master-actions': ADMIN_ONLY,
    'doctor-commission-config-actions': ADMIN_ONLY,

    // ── clinical ─────────────────────────────────────────────────────────────
    'doctor-actions': ['admin', 'doctor'],
    'emr-actions': ['admin', 'doctor'],
    'prescription-actions': ['admin', 'doctor'],
    'lab-actions': ['admin', 'lab_technician', 'doctor'],
    'radiology-actions': ['admin', 'lab_technician', 'doctor'],
    'pharmacy-actions': ['admin', 'pharmacist'],
    'er-actions': ['admin', 'er_staff', 'doctor', 'nurse'],
    'ot-actions': ['admin', 'ot_manager', 'doctor', 'nurse'],
    'triage-actions': ['admin', 'er_staff', 'doctor', 'nurse', 'receptionist'],

    // ── ward ─────────────────────────────────────────────────────────────────
    'ipd-actions': PORTAL_ROLES.ipd,
    'ipd-emr-actions': PORTAL_ROLES.ipd,
    'ipd-nursing-actions': PORTAL_ROLES.ipd,
    'ipd-automation-actions': ['admin', 'ipd_manager'],
    'nurse-actions': ['admin', 'nurse', 'ipd_manager'],
    'nursing-care-actions': PORTAL_ROLES.ipd,

    // ── front desk ───────────────────────────────────────────────────────────
    'reception-actions': ['admin', 'receptionist', 'opd_manager'],
    'appointment-actions': ['admin', 'receptionist', 'opd_manager', 'doctor'],
    'opd-actions': PORTAL_ROLES.opd,

    // ── people ───────────────────────────────────────────────────────────────
    'hr-actions': ['admin', 'hr'],
    'payroll-actions': ['admin', 'hr', 'finance'],
    'attendance-actions': ['admin', 'hr'],
};

/** Portal implied by an action filename, when the module is not listed above. */
function portalFor(moduleKey: string): string[] | null {
    for (const [portal, roles] of Object.entries(PORTAL_ROLES)) {
        if (moduleKey.startsWith(`${portal}-`) || moduleKey.startsWith(`${portal.replace('_', '-')}-`)) {
            return roles;
        }
    }
    return null;
}

/** Roles permitted to run actions in this module. */
export function policyFor(moduleKey: string): string[] {
    return MODULE_POLICY[moduleKey] ?? portalFor(moduleKey) ?? ANY_STAFF;
}
