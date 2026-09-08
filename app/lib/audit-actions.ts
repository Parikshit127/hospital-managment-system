/**
 * Audit action vocabulary shared by the Edit/Cancel Audit Report screen, its
 * API route and its Excel export. Kept out of the route file so importing it
 * from a server action doesn't drag a route handler into the bundle.
 *
 * IMPORTANT: every action named here must actually be written by some code path.
 * This list previously offered CANCEL_BILL, EDIT_INVOICE, DELETE_INVOICE,
 * WRITE_OFF, CREDIT_NOTE_CREATED, STOCK_ADJUSTED and VOID_PAYMENT — none of
 * which any action ever logs, so those filters returned "No audit records
 * found" every time. Verify with:
 *   grep -rn "action: '<NAME>'" app/
 */

/**
 * Filter options for the report, in the language a biller uses. One option maps
 * to one or more raw `system_audit_logs.action` values — a user looking for
 * "cancelled admissions" does not know or care that an admin override is
 * recorded as FORCE_CANCEL_ADMISSION.
 */
export const AUDIT_ACTION_GROUPS: { key: string; label: string; actions: string[] }[] = [
    // ── Cancellations ────────────────────────────────────────────────────────
    { key: 'bill_cancelled', label: 'Bill cancelled', actions: ['CANCEL_INVOICE'] },
    {
        key: 'admission_cancelled',
        label: 'Admission cancelled',
        // Force-cancel is the admin override — the single most important row in
        // this report, and it was invisible while only CANCEL_ADMISSION was listed.
        actions: ['CANCEL_ADMISSION', 'FORCE_CANCEL_ADMISSION'],
    },
    { key: 'deposit_cancelled', label: 'Deposit cancelled', actions: ['CANCEL_DEPOSIT'] },
    { key: 'appointment_cancelled', label: 'Appointment cancelled', actions: ['CANCEL_APPOINTMENT'] },

    // ── Edits after the fact ─────────────────────────────────────────────────
    {
        key: 'bill_edited',
        label: 'Bill edited',
        actions: ['UPDATE_INVOICE', 'UPDATE_INVOICE_ITEM', 'UPDATE_INVOICE_HEADER', 'UPDATE_INVOICE_DOCTOR'],
    },
    { key: 'payment_edited', label: 'Payment edited', actions: ['UPDATE_PAYMENT', 'SPLIT_PAYMENT'] },
    { key: 'deposit_edited', label: 'Deposit edited', actions: ['UPDATE_DEPOSIT'] },
    {
        key: 'admission_edited',
        label: 'Admission / discharge edited',
        actions: ['EDIT_ADMISSION_DATE', 'EDIT_DISCHARGE_DATE', 'CHANGE_ADMISSION_DOCTOR', 'CHANGE_PATIENT_CATEGORY'],
    },

    // ── Reversals / undo ─────────────────────────────────────────────────────
    { key: 'payment_reversed', label: 'Payment reversed', actions: ['REVERSE_PAYMENT', 'RECONCILE_OVERPAYMENTS'] },
    {
        key: 'bill_reopened',
        label: 'Bill reopened / unlocked',
        actions: ['REVERT_INVOICE', 'UNLOCK_INVOICE', 'UNLOCK_INVOICE_TO_DRAFT'],
    },
    { key: 'discharge_reversed', label: 'Discharge reversed', actions: ['UNDISCHARGE_IPD'] },

    // ── Money out ────────────────────────────────────────────────────────────
    {
        key: 'refund',
        label: 'Refund',
        actions: ['PROCESS_REFUND', 'REFUND_DEPOSIT', 'REFUND_APPROVED', 'REFUND_REJECTED'],
    },
    {
        key: 'write_off',
        label: 'Write-off',
        actions: ['WRITEOFF_REQUESTED', 'WRITEOFF_APPROVED', 'WRITEOFF_REJECTED', 'WRITEOFF_POSTED', 'WRITEOFF_REVERSED', 'PHARMACY_EXPIRY_WRITEOFF'],
    },
    {
        key: 'credit_note',
        label: 'Credit note',
        actions: ['CREATE_CREDIT_NOTE', 'CREDIT_NOTE_APPROVED', 'CREDIT_NOTE_REJECTED'],
    },
    {
        key: 'discount',
        label: 'Discount applied',
        // Lowercase on purpose — ipd-finance-actions.ts writes these via logAudit()
        // in snake_case. The old list said 'DISCOUNT_APPLIED' and the action
        // filter is case-sensitive, so it never matched a single row.
        actions: ['discount_applied', 'discount_requested', 'discount_approved_applied'],
    },

    // ── Stock & patient identity ─────────────────────────────────────────────
    {
        key: 'stock_adjusted',
        label: 'Stock adjusted',
        actions: ['PHARMACY_STOCK_ADJUSTMENT', 'PHARMACY_BATCH_DETAILS_UPDATED'],
    },
    { key: 'patient_merged', label: 'Patient merged / unmerged', actions: ['MERGE_PATIENT', 'UNMERGE_PATIENT'] },
];

/** Every action that represents a record being changed or undone after the fact. */
export const EDIT_CANCEL_ACTIONS = AUDIT_ACTION_GROUPS.flatMap(g => g.actions);

/**
 * Turn the screen's `?action=` parameter into a Prisma `where.action` clause.
 * Accepts a group key ("bill_cancelled") or a raw action name, so bookmarked
 * URLs from the old dropdown keep working. Returns undefined for "no filter".
 */
export function resolveAuditActionFilter(param?: string): { in: string[] } | string | undefined {
    if (!param) return undefined;
    const group = AUDIT_ACTION_GROUPS.find(g => g.key === param);
    if (group) return { in: group.actions };
    return param;
}

/** Friendly label for a raw action value, for the report's Action column. */
export function auditActionLabel(action?: string | null): string {
    if (!action) return '';
    const group = AUDIT_ACTION_GROUPS.find(g => g.actions.includes(action));
    // Force-cancel must stay visually distinct from a normal cancel even though
    // both live under one filter — it means a guard rail was overridden.
    if (action === 'FORCE_CANCEL_ADMISSION') return 'Admission force-cancelled (override)';
    return group ? group.label : action.replace(/_/g, ' ');
}

/**
 * Recover the actor from an audit row's `details` JSON.
 *
 * The `username` / `user_id` columns were added to system_audit_logs later than
 * the writers that populate `details`, so most historical rows have NULL in both
 * columns while the person's name sits inside the JSON — 22 of 23 CANCEL_INVOICE
 * rows on the demo DB. The report showed "not recorded" for all of them even
 * though the answer to "who cancelled this bill" was right there.
 *
 * Keys in priority order; the first one holding a non-empty string wins.
 */
const ACTOR_DETAIL_KEYS = [
    'cancelled_by', 'reversed_by', 'refunded_by', 'approved_by',
    'performed_by', 'recorded_by', 'requested_by', 'posted_by',
    'updated_by', 'created_by', 'actor', 'username', 'user', 'by',
];

export function auditActorFromDetails(details?: string | null): string | null {
    if (!details || typeof details !== 'string') return null;
    let obj: any;
    try {
        obj = JSON.parse(details);
    } catch {
        return null; // Free-text details, not JSON.
    }
    if (!obj || typeof obj !== 'object') return null;
    const usable = (v: unknown): v is string =>
        typeof v === 'string' && !!v.trim() && v.trim().toLowerCase() !== 'system';

    for (const key of ACTOR_DETAIL_KEYS) {
        const v = obj[key];
        if (usable(v)) {
            return v.trim();
        }
    }
    // The explicit list will never keep up — `settled_by`, `verified_by`,
    // `collected_by` and friends kept turning up as "actor unknown" on the change
    // log while the name sat right there in the details. Any *_by / *By key holding
    // a plain string is an actor, so match the shape instead of enumerating forever.
    // `by_role` deliberately does not match: it holds a role, not a person.
    for (const [key, value] of Object.entries(obj)) {
        if (/(_by|By)$/.test(key) && usable(value)) {
            return value.trim();
        }
    }
    return null;
}

/**
 * Friendly labels for the audit "Record" column. The raw entity_type is a table
 * name, which means nothing to a biller reading the report.
 */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
    invoice: 'Bill',
    payment: 'Receipt',
    deposit: 'Deposit',
    admission: 'Admission',
    user: 'User',
    pharmacy_batch: 'Medicine batch',
    insurance_receipt: 'TPA receipt',
};
