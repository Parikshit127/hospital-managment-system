"use server";

/**
 * Unified Approval Center (Master Billing Phase 2)
 * ------------------------------------------------
 * Orchestrates over existing approval surfaces:
 *   - Refund (status Pending → Approved/Rejected/Processed)
 *   - CreditNote (status Draft → Approved → Applied)
 *   - Writeoff (status Requested → Approved/Rejected → Posted)
 *
 * No new schema. This module:
 *   - Aggregates pending items from each source into a single feed
 *   - Routes approval calls to the correct underlying writer action
 *   - Enforces amount-tier role gating consistently across types
 *
 * Existing single-table approvers (kept working):
 *   updateRefundStatus(id, status) -> finance-actions
 *   approveCreditNote(id) -> deposit-actions
 *
 * New unified approvers:
 *   approveItem(type, id) / rejectItem(type, id, reason)
 *     -> dispatches to the appropriate underlying flow
 */

import { requireTenantContext } from "@/backend/tenant";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";
import {
  approveWriteoff,
  rejectWriteoff,
  postWriteoff,
  getRequiredApproverRoles,
} from "@/app/actions/writeoff-actions";
import { approveExpense, rejectExpense } from "@/app/actions/expense-actions";

// ── helpers ───────────────────────────────────────────────────────────────

function decToNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof (value as any)?.toNumber === "function") {
    return Number((value as any).toNumber());
  }
  return Number(value) || 0;
}

function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => {
      if (value === null || value === undefined) return value;
      if (typeof value === "bigint") return value.toString();
      if (
        typeof value === "object" &&
        value !== null &&
        (value as any).constructor?.name === "Decimal"
      ) {
        return decToNum(value);
      }
      return value;
    }),
  );
}

// ── unified record shape ──────────────────────────────────────────────────

export type ApprovalItemType = "refund" | "credit_note" | "writeoff" | "expense";

export interface ApprovalItem {
  id: string; // entity id (string for writeoffs/credit_notes, numeric for refunds — coerced)
  type: ApprovalItemType;
  number: string; // user-facing reference number
  patient_id: string | null;
  patient_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  amount: number;
  reason: string;
  status: string;
  requested_by: string | null;
  requested_role: string | null;
  requested_at: string;
  required_roles: string[];
  raw: any;
}

// ──────────────────────────────────────────────────────────────────────────
// Tier-based gating (per blueprint § 11 + § 14)
// ──────────────────────────────────────────────────────────────────────────

export async function getRequiredApproverRolesForType(
  type: ApprovalItemType,
  amount: number,
): Promise<string[]> {
  switch (type) {
    case "writeoff":
      return getRequiredApproverRoles(amount);
    case "refund":
      // Refunds: smaller threshold than write-offs since they move cash.
      if (amount < 2000) return ["admin", "finance", "ipd_manager", "receptionist"];
      if (amount < 25000) return ["admin", "finance"];
      return ["admin"];
    case "credit_note":
      // Credit notes affect GST + revenue — finance/admin only.
      if (amount < 25000) return ["admin", "finance"];
      return ["admin"];
    case "expense":
      // Expenses: small amounts any finance role, large amounts admin only
      if (amount < 10000) return ["admin", "finance", "ipd_manager"];
      if (amount < 50000) return ["admin", "finance"];
      return ["admin"];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Unified queue
// ──────────────────────────────────────────────────────────────────────────

export interface ApprovalFilter {
  type?: ApprovalItemType;
  patient_id?: string;
  min_amount?: number;
  max_amount?: number;
  limit?: number;
}

export async function getApprovalQueue(filter: ApprovalFilter = {}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const limit = Math.min(500, filter.limit ?? 200);

    // Refunds: status = Pending
    const refundsRaw =
      !filter.type || filter.type === "refund"
        ? await db.refunds.findMany({
            where: { organizationId, status: "Pending" },
            orderBy: { created_at: "desc" },
            take: limit,
          })
        : [];

    // Credit notes: status = Draft (awaiting approval)
    const creditNotesRaw =
      !filter.type || filter.type === "credit_note"
        ? await db.creditNote.findMany({
            where: { organizationId, status: "Draft" },
            include: {
              original_invoice: {
                select: { invoice_number: true, patient_id: true, patient: { select: { full_name: true } } },
              },
            },
            orderBy: { created_at: "desc" },
            take: limit,
          })
        : [];

    // Write-offs: status = Requested
    const writeoffsRaw =
      !filter.type || filter.type === "writeoff"
        ? await db.writeoff.findMany({
            where: { organizationId, status: "Requested" },
            include: {
              invoice: { select: { invoice_number: true } },
            },
            orderBy: { created_at: "desc" },
            take: limit,
          })
        : [];

    // Expenses: status = Pending (awaiting approval)
    const expensesRaw =
      !filter.type || filter.type === "expense"
        ? await db.expense.findMany({
            where: { organizationId, status: "Pending" },
            include: {
              category: { select: { name: true } },
              vendor: { select: { vendor_name: true } },
            },
            orderBy: { created_at: "desc" },
            take: limit,
          })
        : [];

    // Hydrate refunds with invoice + patient info (refund stores invoice_id as string)
    const refundInvoiceIds = Array.from(
      new Set(
        refundsRaw
          .map((r: any) => Number(r.invoice_id))
          .filter((n: number) => Number.isFinite(n) && n > 0),
      ),
    ) as number[];
    const refundInvoiceMap = new Map<number, any>();
    if (refundInvoiceIds.length > 0) {
      const invs = await db.invoices.findMany({
        where: { id: { in: refundInvoiceIds }, organizationId },
        select: {
          id: true,
          invoice_number: true,
          patient_id: true,
          patient: { select: { full_name: true } },
        },
      });
      invs.forEach((i: any) => refundInvoiceMap.set(i.id, i));
    }

    // Patient lookup for write-offs (no relation, weak FK)
    const writeoffPatientIds = Array.from(new Set(writeoffsRaw.map((w: any) => w.patient_id)));
    const patientMap = new Map<string, string>();
    if (writeoffPatientIds.length > 0) {
      const patients = await db.oPD_REG.findMany({
        where: { organizationId, patient_id: { in: writeoffPatientIds } },
        select: { patient_id: true, full_name: true },
      });
      patients.forEach((p: any) => patientMap.set(p.patient_id, p.full_name));
    }

    const items: ApprovalItem[] = [];

    for (const r of refundsRaw) {
      const inv = refundInvoiceMap.get(Number(r.invoice_id));
      const amount = decToNum(r.amount);
      items.push({
        id: String(r.id),
        type: "refund",
        number: `R-${r.id}`,
        patient_id: inv?.patient_id ?? null,
        patient_name: inv?.patient?.full_name ?? null,
        invoice_id: r.invoice_id,
        invoice_number: inv?.invoice_number ?? null,
        amount,
        reason: r.reason ?? "",
        status: r.status,
        requested_by: r.processed_by ?? null,
        requested_role: null,
        requested_at: new Date(r.created_at).toISOString(),
        required_roles: await getRequiredApproverRolesForType("refund", amount),
        raw: serialize(r),
      });
    }

    for (const cn of creditNotesRaw) {
      const amount = decToNum(cn.total_amount);
      items.push({
        id: String(cn.id),
        type: "credit_note",
        number: cn.credit_note_number,
        patient_id: cn.original_invoice?.patient_id ?? null,
        patient_name: cn.original_invoice?.patient?.full_name ?? null,
        invoice_id: cn.original_invoice_id != null ? String(cn.original_invoice_id) : null,
        invoice_number: cn.original_invoice?.invoice_number ?? null,
        amount,
        reason: cn.reason ?? "",
        status: cn.status,
        requested_by: null,
        requested_role: null,
        requested_at: new Date(cn.created_at).toISOString(),
        required_roles: await getRequiredApproverRolesForType("credit_note", amount),
        raw: serialize(cn),
      });
    }

    for (const wo of writeoffsRaw) {
      const amount = decToNum(wo.amount);
      items.push({
        id: wo.id,
        type: "writeoff",
        number: wo.writeoff_number,
        patient_id: wo.patient_id,
        patient_name: patientMap.get(wo.patient_id) ?? null,
        invoice_id: wo.invoice_id != null ? String(wo.invoice_id) : null,
        invoice_number: wo.invoice?.invoice_number ?? null,
        amount,
        reason: wo.reason,
        status: wo.status,
        requested_by: wo.requested_by,
        requested_role: wo.requested_role,
        requested_at: new Date(wo.created_at).toISOString(),
        required_roles: await getRequiredApproverRolesForType("writeoff", amount),
        raw: serialize(wo),
      });
    }

    for (const e of expensesRaw) {
      const amount = decToNum(e.total_amount);
      items.push({
        id: String(e.id),
        type: "expense",
        number: e.expense_number,
        patient_id: null,
        patient_name: null,
        invoice_id: null,
        invoice_number: null,
        amount,
        reason: `${e.description}${e.vendor ? ` — ${e.vendor.vendor_name}` : ""}${e.category ? ` [${e.category.name}]` : ""}`,
        status: e.status,
        requested_by: null,
        requested_role: null,
        requested_at: new Date(e.created_at).toISOString(),
        required_roles: await getRequiredApproverRolesForType("expense", amount),
        raw: serialize(e),
      });
    }

    // Optional in-memory filters
    let filtered = items;
    if (filter.patient_id) {
      filtered = filtered.filter((i) => i.patient_id === filter.patient_id);
    }
    if (filter.min_amount !== undefined) {
      filtered = filtered.filter((i) => i.amount >= (filter.min_amount as number));
    }
    if (filter.max_amount !== undefined) {
      filtered = filtered.filter((i) => i.amount <= (filter.max_amount as number));
    }

    filtered.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

    return { success: true, data: filtered };
  } catch (error: any) {
    console.error("getApprovalQueue error:", error);
    return { success: false, data: [] as ApprovalItem[], error: error?.message };
  }
}

export async function getApprovalKPIs() {
  try {
    const { db, organizationId } = await requireTenantContext();

    const [refundCount, refundAgg, cnCount, cnAgg, woCount, woAgg, postedCount, postedAgg, expCount, expAgg] =
      await Promise.all([
        db.refunds.count({ where: { organizationId, status: "Pending" } }),
        db.refunds.aggregate({
          where: { organizationId, status: "Pending" },
          _sum: { amount: true },
        }),
        db.creditNote.count({ where: { organizationId, status: "Draft" } }),
        db.creditNote.aggregate({
          where: { organizationId, status: "Draft" },
          _sum: { total_amount: true },
        }),
        db.writeoff.count({ where: { organizationId, status: "Requested" } }),
        db.writeoff.aggregate({
          where: { organizationId, status: "Requested" },
          _sum: { amount: true },
        }),
        db.writeoff.count({ where: { organizationId, status: "Approved" } }),
        db.writeoff.aggregate({
          where: { organizationId, status: "Approved" },
          _sum: { amount: true },
        }),
        db.expense.count({ where: { organizationId, status: "Pending" } }),
        db.expense.aggregate({
          where: { organizationId, status: "Pending" },
          _sum: { total_amount: true },
        }),
      ]);

    return {
      success: true,
      data: serialize({
        refunds: { count: refundCount, total: decToNum(refundAgg._sum.amount) },
        credit_notes: { count: cnCount, total: decToNum(cnAgg._sum.total_amount) },
        writeoffs_pending: { count: woCount, total: decToNum(woAgg._sum.amount) },
        writeoffs_ready_to_post: {
          count: postedCount,
          total: decToNum(postedAgg._sum.amount),
        },
        expenses_pending: { count: expCount, total: decToNum(expAgg._sum.total_amount) },
        total_pending: refundCount + cnCount + woCount + expCount,
        total_pending_amount:
          decToNum(refundAgg._sum.amount) +
          decToNum(cnAgg._sum.total_amount) +
          decToNum(woAgg._sum.amount) +
          decToNum(expAgg._sum.total_amount),
      }),
    };
  } catch (error: any) {
    console.error("getApprovalKPIs error:", error);
    return { success: false, data: null };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Unified approve / reject dispatchers
// ──────────────────────────────────────────────────────────────────────────

export async function approveItem(input: {
  type: ApprovalItemType;
  id: string;
  comment?: string;
}) {
  const { type, id, comment } = input;

  if (type === "writeoff") {
    return approveWriteoff(id, comment);
  }

  if (type === "refund") {
    return approveRefund(Number(id), comment);
  }

  if (type === "credit_note") {
    return approveCreditNote(Number(id), comment);
  }

  if (type === "expense") {
    return approveExpense(Number(id));
  }

  return { success: false, error: "Unknown approval type" };
}

export async function rejectItem(input: {
  type: ApprovalItemType;
  id: string;
  reason: string;
}) {
  const { type, id, reason } = input;
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: "A rejection reason is required" };
  }

  if (type === "writeoff") {
    return rejectWriteoff(id, reason);
  }

  if (type === "refund") {
    return rejectRefund(Number(id), reason);
  }

  if (type === "credit_note") {
    return rejectCreditNote(Number(id), reason);
  }

  if (type === "expense") {
    return rejectExpense(Number(id), reason);
  }

  return { success: false, error: "Unknown approval type" };
}

// ── refund approve/reject (with role gating + audit) ──────────────────────

async function approveRefund(refundId: number, comment?: string) {
  try {
    const { db, session } = await requireTenantContext();
    const refund = await db.refunds.findUnique({ where: { id: refundId } });
    if (!refund) return { success: false, error: "Refund not found" };
    if (refund.status !== "Pending") {
      return { success: false, error: `Cannot approve refund in status ${refund.status}` };
    }

    const required = await getRequiredApproverRolesForType("refund", decToNum(refund.amount));
    if (!required.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot approve this refund. Required: ${required.join(" / ")}`,
      };
    }

    const updated = await db.refunds.update({
      where: { id: refundId },
      data: { status: "Approved", processed_by: session.username ?? refund.processed_by },
    });

    await logAudit({
      action: "REFUND_APPROVED",
      module: "billing",
      entity_type: "Refund",
      entity_id: String(refundId),
      details: `amount=${decToNum(refund.amount)}${comment ? " · " + comment : ""}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/finance/refunds");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

async function rejectRefund(refundId: number, reason: string) {
  try {
    const { db, session } = await requireTenantContext();
    const refund = await db.refunds.findUnique({ where: { id: refundId } });
    if (!refund) return { success: false, error: "Refund not found" };
    if (refund.status !== "Pending") {
      return { success: false, error: `Cannot reject refund in status ${refund.status}` };
    }
    const required = await getRequiredApproverRolesForType("refund", decToNum(refund.amount));
    if (!required.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot reject this refund. Required: ${required.join(" / ")}`,
      };
    }

    const updated = await db.refunds.update({
      where: { id: refundId },
      data: { status: "Rejected" },
    });

    await logAudit({
      action: "REFUND_REJECTED",
      module: "billing",
      entity_type: "Refund",
      entity_id: String(refundId),
      details: `amount=${decToNum(refund.amount)} · reason=${reason}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/finance/refunds");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ── credit-note approve/reject ───────────────────────────────────────────

async function approveCreditNote(creditNoteId: number, comment?: string) {
  try {
    const { db, session } = await requireTenantContext();
    const cn = await db.creditNote.findUnique({ where: { id: creditNoteId } });
    if (!cn) return { success: false, error: "Credit note not found" };
    if (cn.status !== "Draft") {
      return { success: false, error: `Cannot approve credit note in status ${cn.status}` };
    }
    const required = await getRequiredApproverRolesForType(
      "credit_note",
      decToNum(cn.total_amount),
    );
    if (!required.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot approve this credit note. Required: ${required.join(" / ")}`,
      };
    }

    const updated = await db.creditNote.update({
      where: { id: creditNoteId },
      data: { status: "Approved", approved_by: session.username },
    });

    await logAudit({
      action: "CREDIT_NOTE_APPROVED",
      module: "billing",
      entity_type: "CreditNote",
      entity_id: String(creditNoteId),
      details: `${cn.credit_note_number} · amount=${decToNum(cn.total_amount)}${comment ? " · " + comment : ""}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/finance/credit-notes");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

async function rejectCreditNote(creditNoteId: number, reason: string) {
  try {
    const { db, session } = await requireTenantContext();
    const cn = await db.creditNote.findUnique({ where: { id: creditNoteId } });
    if (!cn) return { success: false, error: "Credit note not found" };
    if (cn.status !== "Draft") {
      return { success: false, error: `Cannot reject credit note in status ${cn.status}` };
    }
    const required = await getRequiredApproverRolesForType(
      "credit_note",
      decToNum(cn.total_amount),
    );
    if (!required.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot reject this credit note. Required: ${required.join(" / ")}`,
      };
    }

    // CreditNote schema doesn't have a "Rejected" status — represent rejection
    // as a soft-flag in the notes field while marking the row inactive.
    const existingNotes = cn.notes ?? "";
    const updated = await db.creditNote.update({
      where: { id: creditNoteId },
      data: {
        notes: `${existingNotes}${existingNotes ? "\n" : ""}REJECTED by ${session.username} on ${new Date().toISOString()}: ${reason}`,
        status: "Rejected",
      },
    });

    await logAudit({
      action: "CREDIT_NOTE_REJECTED",
      module: "billing",
      entity_type: "CreditNote",
      entity_id: String(creditNoteId),
      details: `${cn.credit_note_number} · reason=${reason}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/finance/credit-notes");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Post-approval execution (for write-offs that go through GL after approval)
// ──────────────────────────────────────────────────────────────────────────

export async function executeApprovedItem(input: {
  type: ApprovalItemType;
  id: string;
}) {
  if (input.type === "writeoff") {
    return postWriteoff(input.id);
  }
  // refunds + credit-notes are considered "executed" at the moment of approval
  // (refund processing handled by /finance/refunds page; credit-note application
  // is a separate explicit action)
  return { success: false, error: "Execution not applicable for this type" };
}
