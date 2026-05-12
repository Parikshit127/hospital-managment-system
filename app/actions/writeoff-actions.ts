"use server";

/**
 * Write-off Engine (Master Billing Phase 2)
 * ------------------------------------------
 * Strictly additive. Does not modify any existing finance flow.
 *
 * Lifecycle: Requested → Approved | Rejected → Posted → (optional) Reversed
 *
 * Posting strategy (when status moves to Posted):
 *   - Create a GL_JournalEntry (entry_type = "Adjustment",
 *     reference_type = "Writeoff", reference_id = writeoff.id)
 *   - Two journal lines:
 *       DR  Bad Debt / Charity / Waiver Expense (by writeoff_type)
 *       CR  Accounts Receivable
 *   - The actual chart-of-accounts mapping is configurable; if no specific
 *     accounts are configured, the writeoff is still saved as Posted but
 *     gl_journal_id is left null with a flag in audit_trail.
 *   - Soft-update on the linked invoice: reduce balance_due by the
 *     written-off amount (invoice retains historical net_amount).
 *
 * Approval routing (amount tiers):
 *   amount <  5,000   → manager / finance / admin can approve
 *   amount <  50,000  → finance / admin only
 *   amount >= 50,000  → admin only
 */

import { requireTenantContext } from "@/backend/tenant";
import { logAudit } from "@/app/lib/audit";
import { revalidatePath } from "next/cache";

// ── shared types ──────────────────────────────────────────────────────────

export type WriteoffType =
  | "charity"
  | "bad_debt"
  | "management_waiver"
  | "settlement_adjustment"
  | "employee_waiver";

export type WriteoffStatus =
  | "Requested"
  | "Approved"
  | "Rejected"
  | "Posted"
  | "Reversed";

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

async function nextWriteoffNumber(db: any, organizationId: string): Promise<string> {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `WO-${yyyymmdd}-`;
  const count = await db.writeoff.count({
    where: { organizationId, writeoff_number: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

/**
 * Amount-tier approval matrix.
 * Returns the list of roles allowed to approve a write-off of this amount.
 */
export async function getRequiredApproverRoles(amount: number): Promise<string[]> {
  if (amount < 5000) return ["admin", "finance", "ipd_manager"];
  if (amount < 50000) return ["admin", "finance"];
  return ["admin"];
}

function appendChain(
  existing: unknown,
  entry: { action: string; by: string | null; role: string | null; at: string; comment?: string },
) {
  const arr = Array.isArray(existing) ? [...existing] : [];
  arr.push(entry);
  return arr;
}

// ──────────────────────────────────────────────────────────────────────────
// REQUEST
// ──────────────────────────────────────────────────────────────────────────

export async function requestWriteoff(input: {
  patient_id: string;
  invoice_id?: number | null;
  writeoff_type: WriteoffType;
  amount: number;
  reason: string;
  notes?: string | null;
}) {
  try {
    const { db, organizationId, session } = await requireTenantContext();

    if (input.amount <= 0) {
      return { success: false, error: "Amount must be greater than zero" };
    }
    if (!input.reason || input.reason.trim().length < 5) {
      return { success: false, error: "A reason of at least 5 characters is required" };
    }

    // Sanity: if linked to invoice, amount cannot exceed outstanding balance
    if (input.invoice_id) {
      const inv = await db.invoices.findUnique({ where: { id: input.invoice_id } });
      if (!inv) return { success: false, error: "Linked invoice not found" };
      const balance = decToNum(inv.balance_due);
      if (input.amount > balance + 0.01) {
        return {
          success: false,
          error: `Write-off (${input.amount}) exceeds invoice outstanding (${balance})`,
        };
      }
    }

    const writeoff_number = await nextWriteoffNumber(db, organizationId);

    const created = await db.writeoff.create({
      data: {
        organizationId,
        writeoff_number,
        patient_id: input.patient_id,
        invoice_id: input.invoice_id ?? null,
        writeoff_type: input.writeoff_type,
        amount: input.amount,
        reason: input.reason,
        notes: input.notes ?? null,
        requested_by: session.username ?? session.id ?? "system",
        requested_role: session.role ?? null,
        status: "Requested",
        approval_chain: appendChain([], {
          action: "Requested",
          by: session.username ?? null,
          role: session.role ?? null,
          at: new Date().toISOString(),
          comment: input.reason,
        }),
      },
    });

    await logAudit({
      action: "WRITEOFF_REQUESTED",
      module: "billing",
      entity_type: "Writeoff",
      entity_id: created.id,
      details: `${writeoff_number} · ${input.writeoff_type} · amount=${input.amount} · patient=${input.patient_id}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/billing/writeoffs");
    return { success: true, data: serialize(created) };
  } catch (error: any) {
    console.error("requestWriteoff error:", error);
    return { success: false, error: error?.message ?? "Failed to request write-off" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// APPROVE / REJECT
// ──────────────────────────────────────────────────────────────────────────

export async function approveWriteoff(writeoffId: string, comment?: string) {
  try {
    const { db, session } = await requireTenantContext();
    const wo = await db.writeoff.findUnique({ where: { id: writeoffId } });
    if (!wo) return { success: false, error: "Write-off not found" };
    if (wo.status !== "Requested") {
      return { success: false, error: `Cannot approve write-off in status ${wo.status}` };
    }

    const requiredRoles = await getRequiredApproverRoles(decToNum(wo.amount));
    if (!requiredRoles.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot approve this write-off. Required: ${requiredRoles.join(" / ")}`,
      };
    }

    const now = new Date();
    const updated = await db.writeoff.update({
      where: { id: writeoffId },
      data: {
        status: "Approved",
        approved_by: session.username ?? session.id ?? null,
        approved_at: now,
        approval_chain: appendChain(wo.approval_chain, {
          action: "Approved",
          by: session.username ?? null,
          role: session.role ?? null,
          at: now.toISOString(),
          comment,
        }),
      },
    });

    await logAudit({
      action: "WRITEOFF_APPROVED",
      module: "billing",
      entity_type: "Writeoff",
      entity_id: writeoffId,
      details: `${wo.writeoff_number} · amount=${decToNum(wo.amount)} · approver=${session.username}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/billing/writeoffs");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error("approveWriteoff error:", error);
    return { success: false, error: error?.message };
  }
}

export async function rejectWriteoff(writeoffId: string, rejection_reason: string) {
  try {
    if (!rejection_reason || rejection_reason.trim().length < 3) {
      return { success: false, error: "A rejection reason is required" };
    }
    const { db, session } = await requireTenantContext();
    const wo = await db.writeoff.findUnique({ where: { id: writeoffId } });
    if (!wo) return { success: false, error: "Write-off not found" };
    if (wo.status !== "Requested") {
      return { success: false, error: `Cannot reject write-off in status ${wo.status}` };
    }

    const requiredRoles = await getRequiredApproverRoles(decToNum(wo.amount));
    if (!requiredRoles.includes(session.role ?? "")) {
      return {
        success: false,
        error: `Your role (${session.role}) cannot reject this write-off. Required: ${requiredRoles.join(" / ")}`,
      };
    }

    const now = new Date();
    const updated = await db.writeoff.update({
      where: { id: writeoffId },
      data: {
        status: "Rejected",
        rejected_by: session.username ?? session.id ?? null,
        rejected_at: now,
        rejection_reason,
        approval_chain: appendChain(wo.approval_chain, {
          action: "Rejected",
          by: session.username ?? null,
          role: session.role ?? null,
          at: now.toISOString(),
          comment: rejection_reason,
        }),
      },
    });

    await logAudit({
      action: "WRITEOFF_REJECTED",
      module: "billing",
      entity_type: "Writeoff",
      entity_id: writeoffId,
      details: `${wo.writeoff_number} · rejected by ${session.username} · ${rejection_reason}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/billing/writeoffs");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error("rejectWriteoff error:", error);
    return { success: false, error: error?.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST (commit to GL + reduce invoice balance)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Choose the expense account for a write-off type.
 * Tries (in order): GL account named per writeoff type, "Bad Debt Expense",
 * "Other Expense". Returns null if none found — caller will record the
 * writeoff as Posted without a journal entry and log the skip in audit.
 */
async function findExpenseAccountId(
  db: any,
  organizationId: string,
  writeoffType: WriteoffType,
): Promise<string | null> {
  const typeNames: Record<WriteoffType, string[]> = {
    charity: ["Charity Expense", "Charitable Donations", "Bad Debt Expense"],
    bad_debt: ["Bad Debt Expense", "Doubtful Accounts"],
    management_waiver: ["Management Waiver", "Discount Expense", "Bad Debt Expense"],
    settlement_adjustment: ["Settlement Adjustment", "Bad Debt Expense"],
    employee_waiver: ["Employee Discount", "Staff Welfare", "Bad Debt Expense"],
  };
  const candidates = typeNames[writeoffType];
  for (const name of candidates) {
    const acc = await db.gL_Account.findFirst({
      where: { organizationId, account_name: name, is_active: true },
      select: { id: true },
    });
    if (acc) return acc.id;
  }
  // Last-ditch: any Expense account
  const any = await db.gL_Account.findFirst({
    where: { organizationId, account_type: "Expense", is_active: true },
    select: { id: true },
    orderBy: { account_code: "asc" },
  });
  return any?.id ?? null;
}

async function findReceivableAccountId(
  db: any,
  organizationId: string,
): Promise<string | null> {
  const acc = await db.gL_Account.findFirst({
    where: {
      organizationId,
      OR: [
        { account_name: "Accounts Receivable" },
        { account_name: "Sundry Debtors" },
        { account_name: "Trade Receivables" },
      ],
      is_active: true,
    },
    select: { id: true },
  });
  if (acc) return acc.id;
  // Fallback: any Asset account
  const any = await db.gL_Account.findFirst({
    where: { organizationId, account_type: "Asset", is_active: true },
    select: { id: true },
    orderBy: { account_code: "asc" },
  });
  return any?.id ?? null;
}

async function nextJournalNumber(db: any, organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JV-${year}-`;
  const count = await db.gL_JournalEntry.count({
    where: { organizationId, journal_number: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function postWriteoff(writeoffId: string) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    const wo = await db.writeoff.findUnique({ where: { id: writeoffId } });
    if (!wo) return { success: false, error: "Write-off not found" };
    if (wo.status !== "Approved") {
      return { success: false, error: `Cannot post write-off in status ${wo.status}` };
    }

    const amount = decToNum(wo.amount);

    // Try to build GL journal. If accounts are missing, post softly with a warning.
    const [expenseAccountId, receivableAccountId, journalNumber] = await Promise.all([
      findExpenseAccountId(db, organizationId, wo.writeoff_type as WriteoffType),
      findReceivableAccountId(db, organizationId),
      nextJournalNumber(db, organizationId),
    ]);

    let glJournalId: string | null = null;
    const warnings: string[] = [];

    if (expenseAccountId && receivableAccountId) {
      const entry = await db.gL_JournalEntry.create({
        data: {
          organizationId,
          journal_number: journalNumber,
          entry_date: new Date(),
          entry_type: "Adjustment",
          reference_type: "Writeoff",
          reference_id: wo.id,
          reference_number: wo.writeoff_number,
          narration: `Write-off ${wo.writeoff_number} (${wo.writeoff_type}) — ${wo.reason}`,
          total_debit: amount,
          total_credit: amount,
          status: "Posted",
          created_by: session.username ?? session.id ?? null,
          lines: {
            create: [
              {
                organizationId,
                line_number: 1,
                account_id: expenseAccountId,
                debit_amount: amount,
                credit_amount: 0,
                description: `Write-off — ${wo.writeoff_type}`,
              },
              {
                organizationId,
                line_number: 2,
                account_id: receivableAccountId,
                debit_amount: 0,
                credit_amount: amount,
                description: `Receivable cleared via ${wo.writeoff_number}`,
              },
            ],
          },
        },
      });
      glJournalId = entry.id;
    } else {
      warnings.push(
        "GL accounts for write-off posting not configured — write-off saved but no journal entry created. Configure 'Bad Debt Expense' and 'Accounts Receivable' in /finance/chart-of-accounts.",
      );
    }

    // Reduce linked invoice balance by the written-off amount (additive — paid stays unchanged).
    if (wo.invoice_id) {
      const inv = await db.invoices.findUnique({ where: { id: wo.invoice_id } });
      if (inv) {
        const newBalance = Math.max(0, decToNum(inv.balance_due) - amount);
        await db.invoices.update({
          where: { id: wo.invoice_id },
          data: { balance_due: newBalance },
        });
      }
    }

    const now = new Date();
    const updated = await db.writeoff.update({
      where: { id: writeoffId },
      data: {
        status: "Posted",
        posted_at: now,
        gl_journal_id: glJournalId,
        approval_chain: appendChain(wo.approval_chain, {
          action: "Posted",
          by: session.username ?? null,
          role: session.role ?? null,
          at: now.toISOString(),
          comment: warnings.length ? warnings.join(" | ") : `GL journal ${journalNumber}`,
        }),
      },
    });

    await logAudit({
      action: "WRITEOFF_POSTED",
      module: "billing",
      entity_type: "Writeoff",
      entity_id: writeoffId,
      details: `${wo.writeoff_number} · GL ${journalNumber} · amount=${amount}${warnings.length ? " · " + warnings.join(" | ") : ""}`,
    });

    revalidatePath("/billing/approvals");
    revalidatePath("/billing/writeoffs");
    return { success: true, data: serialize(updated), warnings };
  } catch (error: any) {
    console.error("postWriteoff error:", error);
    return { success: false, error: error?.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// REVERSE (creates a reversing GL entry; restores invoice balance)
// ──────────────────────────────────────────────────────────────────────────

export async function reverseWriteoff(writeoffId: string, reason: string) {
  try {
    if (!reason || reason.trim().length < 3) {
      return { success: false, error: "Reversal reason is required" };
    }
    const { db, organizationId, session } = await requireTenantContext();
    const wo = await db.writeoff.findUnique({ where: { id: writeoffId } });
    if (!wo) return { success: false, error: "Write-off not found" };
    if (wo.status !== "Posted") {
      return { success: false, error: `Cannot reverse write-off in status ${wo.status}` };
    }

    // Only admin can reverse posted write-offs
    if (session.role !== "admin") {
      return { success: false, error: "Only admin can reverse a posted write-off" };
    }

    const amount = decToNum(wo.amount);

    // Reverse journal if one exists
    if (wo.gl_journal_id) {
      const original = await db.gL_JournalEntry.findUnique({
        where: { id: wo.gl_journal_id },
        include: { lines: true },
      });
      if (original && original.status === "Posted") {
        const reversalNum = await nextJournalNumber(db, organizationId);
        const reversal = await db.gL_JournalEntry.create({
          data: {
            organizationId,
            journal_number: reversalNum,
            entry_date: new Date(),
            entry_type: "Adjustment",
            reference_type: "WriteoffReversal",
            reference_id: wo.id,
            reference_number: wo.writeoff_number,
            narration: `Reversal of ${original.journal_number} — ${reason}`,
            total_debit: decToNum(original.total_debit),
            total_credit: decToNum(original.total_credit),
            status: "Posted",
            created_by: session.username ?? session.id ?? null,
            lines: {
              create: original.lines.map((l: any) => ({
                organizationId,
                line_number: l.line_number,
                account_id: l.account_id,
                // swap debit/credit
                debit_amount: decToNum(l.credit_amount),
                credit_amount: decToNum(l.debit_amount),
                description: `Reversal: ${l.description ?? ""}`,
              })),
            },
          },
        });
        await db.gL_JournalEntry.update({
          where: { id: original.id },
          data: { status: "Reversed", reversal_entry_id: reversal.id },
        });
      }
    }

    // Restore invoice balance
    if (wo.invoice_id) {
      const inv = await db.invoices.findUnique({ where: { id: wo.invoice_id } });
      if (inv) {
        await db.invoices.update({
          where: { id: wo.invoice_id },
          data: { balance_due: decToNum(inv.balance_due) + amount },
        });
      }
    }

    const now = new Date();
    const updated = await db.writeoff.update({
      where: { id: writeoffId },
      data: {
        status: "Reversed",
        reversed_at: now,
        reversed_by: session.username ?? session.id ?? null,
        reversal_reason: reason,
        approval_chain: appendChain(wo.approval_chain, {
          action: "Reversed",
          by: session.username ?? null,
          role: session.role ?? null,
          at: now.toISOString(),
          comment: reason,
        }),
      },
    });

    await logAudit({
      action: "WRITEOFF_REVERSED",
      module: "billing",
      entity_type: "Writeoff",
      entity_id: writeoffId,
      details: `${wo.writeoff_number} · reversed by ${session.username} · ${reason}`,
    });

    revalidatePath("/billing/writeoffs");
    return { success: true, data: serialize(updated) };
  } catch (error: any) {
    console.error("reverseWriteoff error:", error);
    return { success: false, error: error?.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

export async function listWriteoffs(filter?: {
  status?: WriteoffStatus;
  patient_id?: string;
  writeoff_type?: WriteoffType;
  page?: number;
  limit?: number;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const page = Math.max(1, filter?.page || 1);
    const limit = Math.min(200, filter?.limit || 50);
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (filter?.status) where.status = filter.status;
    if (filter?.patient_id) where.patient_id = filter.patient_id;
    if (filter?.writeoff_type) where.writeoff_type = filter.writeoff_type;

    const [total, items] = await Promise.all([
      db.writeoff.count({ where }),
      db.writeoff.findMany({
        where,
        include: {
          invoice: { select: { invoice_number: true, net_amount: true, balance_due: true } },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      success: true,
      data: serialize(items),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  } catch (error: any) {
    console.error("listWriteoffs error:", error);
    return { success: false, data: [], meta: null };
  }
}

export async function getWriteoff(id: string) {
  try {
    const { db } = await requireTenantContext();
    const wo = await db.writeoff.findUnique({
      where: { id },
      include: {
        invoice: { select: { invoice_number: true, patient_id: true, net_amount: true } },
      },
    });
    if (!wo) return { success: false, error: "Not found" };
    return { success: true, data: serialize(wo) };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export async function getWriteoffStats(days = 90) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [byStatus, byType, postedAgg, requestedAgg] = await Promise.all([
      db.writeoff.groupBy({
        by: ["status"],
        where: { organizationId, created_at: { gte: since } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      db.writeoff.groupBy({
        by: ["writeoff_type"],
        where: { organizationId, status: "Posted", posted_at: { gte: since } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      db.writeoff.aggregate({
        where: { organizationId, status: "Posted", posted_at: { gte: since } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.writeoff.aggregate({
        where: { organizationId, status: "Requested" },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      success: true,
      data: serialize({
        days,
        posted_total: decToNum(postedAgg._sum.amount),
        posted_count: postedAgg._count.id,
        pending_total: decToNum(requestedAgg._sum.amount),
        pending_count: requestedAgg._count.id,
        by_status: byStatus.map((b: any) => ({
          status: b.status,
          count: b._count.id,
          total: decToNum(b._sum.amount),
        })),
        by_type: byType.map((b: any) => ({
          writeoff_type: b.writeoff_type,
          count: b._count.id,
          total: decToNum(b._sum.amount),
        })),
      }),
    };
  } catch (error: any) {
    console.error("getWriteoffStats error:", error);
    return { success: false, data: null };
  }
}
