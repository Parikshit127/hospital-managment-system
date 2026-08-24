# IPD Multiple Concurrent Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single IPD admission carry more than one simultaneously-active package (e.g. a Delivery package + a Nursery package), with every new charge routed to the correct package by explicit staff choice rather than a silent guess.

**Architecture:** The system already scopes package consumption per-package-instance (`ipdChargePosting.admission_package_id` is a foreign key to one specific `IpdAdmissionPackage` row, not to the admission). The only real blocker is (a) an explicit single-active-package guard in `applyPackageToAdmission`, and (b) about a dozen call sites that assume "the" active package via `findFirst`. This plan removes the guard, generalizes those call sites to operate over a list of active packages, and — because auto-guessing which of 2+ active packages a new charge belongs to is unsafe — adds an explicit package-target control to the manual charge-posting UI plus a new backend action to assign/reassign an existing charge to a specific package after the fact. **Behavior for admissions with 0 or 1 active package is unchanged byte-for-byte** — every "pick the package" call site keeps auto-selecting when there's exactly one, and only refuses to guess when there are 2+.

**Tech Stack:** Next.js server actions (`app/actions/*.ts`), Prisma, React/TSX pages. No unit test harness exists for these server actions in this repo — verification is `npm run typecheck` (tsc --noEmit) after every task plus a manual QA pass (Task 10), matching existing project convention (see recent commits touching `ipd-finance-actions.ts`).

**Spec:** This document — decided via user Q&A: packages are genuinely concurrent (not sequential replacement), and charge routing is "manual pick each time," not "newest wins" or "no absorption."

## Global Constraints

- Zero behavior change for the common case: any admission that only ever has 0 or 1 active package must behave exactly as it does today.
- Never guess which package a charge belongs to when 2+ packages are active — either require an explicit `admission_package_id`, or leave the charge as a plain billed item for a human to route.
- Never touch a Final/locked invoice (existing `isBillClosedForCharges` gate stays authoritative everywhere).
- Preserve all existing audit logging patterns (`logAudit` calls) — extend, don't remove.

---

### Task 1: Allow multiple active packages + list helpers

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts:45-51` (`getActiveAdmissionPackage`)
- Modify: `app/actions/ipd-finance-actions.ts:862-897` (`applyPackageToAdmission`)

**Interfaces:**
- Produces: `getActiveAdmissionPackages(client, admissionId): Promise<AdmPkg[]>` — all ACTIVE packages for the admission, `orderBy: created_at asc`, each `include: { package: true }`.
- Produces: `getSoleActiveAdmissionPackage(client, admissionId): Promise<AdmPkg | null>` — the one active package if there's exactly one, else `null` (0 or 2+). This is the drop-in replacement for every call site that used to auto-guess.
- Consumed by: Tasks 2, 3, 6.

- [ ] **Step 1: Replace the singular helper with plural + sole helpers**

Replace `app/actions/ipd-finance-actions.ts:45-51`:

```typescript
async function getActiveAdmissionPackages(client: any, admissionId: string) {
    return client.ipdAdmissionPackage.findMany({
        where: { admission_id: admissionId, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
        include: { package: true },
        orderBy: { created_at: 'asc' },
    });
}

/** Returns the active package only when it's unambiguous (0 or 2+ active → null). */
async function getSoleActiveAdmissionPackage(client: any, admissionId: string) {
    const active = await getActiveAdmissionPackages(client, admissionId);
    return active.length === 1 ? active[0] : null;
}
```

- [ ] **Step 2: Remove the single-package guard in `applyPackageToAdmission`**

In `app/actions/ipd-finance-actions.ts`, delete these lines (currently 893-897):

```typescript
        // Only one active package per admission (multi-package is a V2 concern).
        const existing = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId, status: ADMISSION_PACKAGE_STATUS.ACTIVE },
        });
        if (existing) return { success: false, error: 'A package is already applied to this admission' };
```

Do not replace with anything — the exclusivity check above it and the bill-open check below it are unaffected and stay in place.

- [ ] **Step 3: Typecheck (expect new errors — later tasks fix the remaining `getActiveAdmissionPackage` callers)**

Run: `npm run typecheck`
Expected: errors at lines 601, 1640, 1775, 2268 — `getActiveAdmissionPackage is not defined`. These are fixed in Tasks 2-3.

- [ ] **Step 4: Commit**

```bash
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(ipd): allow multiple concurrent active packages per admission"
```

---

### Task 2: Explicit package targeting in `postChargeToIpdBill`

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts:595-620`

**Interfaces:**
- Consumes: `getActiveAdmissionPackages`, `getSoleActiveAdmissionPackage` (Task 1).
- Produces: `postChargeToIpdBill(data)` now accepts an optional `data.admission_package_id?: number` field. When omitted and exactly one package is active, behavior is identical to today. When omitted and 2+ packages are active, the charge posts as a plain billed line (no auto-absorb). When provided, that specific active package is used (validated to belong to this admission and be ACTIVE).
- Consumed by: Task 7 (UI passes the field through).

- [ ] **Step 1: Replace the single-package lookup with target resolution**

Replace `app/actions/ipd-finance-actions.ts:595-601`:

```typescript
        // ── Two-ledger package routing ───────────────────────────────────────
        // With an active package, a charge is either consumed under the package
        // (absorbed — never reaches the invoice/claim) or billed over it as a
        // package exclusion. The package line itself is always billed.
        //
        // With 2+ active packages we never guess which one a charge belongs to —
        // the caller must pass admission_package_id explicitly (UI), otherwise
        // the charge posts as a plain billed line for a human to route later
        // via assignChargeToPackage.
        let activePkg: any = null;
        if (data.source_module !== 'package') {
            if (data.admission_package_id) {
                const candidates = await getActiveAdmissionPackages(db, data.admission_id);
                activePkg = candidates.find((p: any) => p.id === data.admission_package_id) || null;
                if (!activePkg) {
                    return { success: false, error: 'Selected package is not active on this admission' };
                }
            } else {
                activePkg = await getSoleActiveAdmissionPackage(db, data.admission_id);
            }
        }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from this function (remaining errors are the 3 other `getActiveAdmissionPackage` call sites, fixed in Task 3).

- [ ] **Step 3: Commit**

```bash
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(ipd): let postChargeToIpdBill target a specific package explicitly"
```

---

### Task 3: Loop over all active packages in interim bill, reconcile, and discharge gate

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts:1634-1681` (`reconcilePackageBillingInternal`)
- Modify: `app/actions/ipd-finance-actions.ts:1775-1781` (`generateInterimBill`)
- Modify: `app/actions/ipd-finance-actions.ts:2268-2304` (discharge gate)

**Interfaces:**
- Consumes: `getActiveAdmissionPackages`, `getSoleActiveAdmissionPackage` (Task 1), `ensurePackageInvoiceLineTx`, `absorbBilledItemsIntoPackageTx` (existing, unchanged — already scoped per-`admPkg.id`).

- [ ] **Step 1: `generateInterimBill` — ensure an invoice line for every active package**

Replace `app/actions/ipd-finance-actions.ts:1775-1781`:

```typescript
        const activeAdmPkgs = await getActiveAdmissionPackages(db, admissionId);
        if (activeAdmPkgs.length > 0 && admission.status === 'Admitted') {
            for (const pkg of activeAdmPkgs) {
                const ensured = await db.$transaction(async (tx: any) => (
                    ensurePackageInvoiceLineTx(tx, organizationId, session, admissionId, pkg)
                ));
                if (!ensured.success) return ensured;
            }
        }
```

- [ ] **Step 2: `reconcilePackageBillingInternal` — ensure lines for all, auto-absorb only when unambiguous**

Replace `app/actions/ipd-finance-actions.ts:1634-1681` in full:

```typescript
async function reconcilePackageBillingInternal(
    db: any,
    organizationId: string,
    session: any,
    admissionId: string,
) {
    const activePkgs = await getActiveAdmissionPackages(db, admissionId);
    if (activePkgs.length === 0) return { success: false as const, error: 'No active package on this admission' };

    for (const pkg of activePkgs) {
        const ensured = await db.$transaction(async (tx: any) => (
            ensurePackageInvoiceLineTx(tx, organizationId, session, admissionId, pkg)
        ));
        if (!ensured.success) return ensured;
    }

    const invoice = await db.invoices.findFirst({
        where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        include: { items: true },
    });
    if (!invoice) return { success: false as const, error: 'No IPD invoice found for this admission' };
    if (invoice.is_locked || invoice.status !== 'Draft') {
        return {
            success: false as const,
            error: 'The bill is finalized/locked — reconciliation would alter a closed bill, so it is not allowed.',
        };
    }

    // Auto-absorbing stray billed lines into "the" package is only safe when
    // there's exactly one active package — with 2+, which package a stray
    // line belongs to is a human call (assignChargeToPackage, Task 5).
    const solePkg = activePkgs.length === 1 ? activePkgs[0] : null;
    if (!solePkg) {
        return {
            success: true as const,
            data: {
                absorbedCount: 0, absorbedAmount: 0, extrasCount: 0,
                skipped: `${activePkgs.length} active packages — assign strays to a package manually`,
            },
        };
    }

    const result = await db.$transaction(async (tx: any) => {
        await createInvoiceSnapshotTx(
            tx, organizationId, session, invoice, invoice.items,
            'Package billing reconciliation — billed services moved to package consumption',
        );
        const migration = await absorbBilledItemsIntoPackageTx(
            tx, organizationId, session, invoice, admissionId, solePkg,
        );
        await recalculateInvoiceWithGstTx(tx, invoice.id);
        return migration;
    });

    await logAudit({
        action: 'RECONCILE_PACKAGE_BILLING',
        module: 'ipd',
        entity_type: 'admission',
        entity_id: admissionId,
        details: JSON.stringify(result),
    });

    return { success: true as const, data: result };
}
```

- [ ] **Step 3: Discharge gate — loop ensure, block (don't guess) on strays with 2+ active packages**

Replace `app/actions/ipd-finance-actions.ts:2268-2304`:

```typescript
        const activeAdmPkgs = await getActiveAdmissionPackages(db, data.admission_id);
        if (activeAdmPkgs.length > 0) {
            for (const pkg of activeAdmPkgs) {
                const ensured = await db.$transaction(async (tx: any) => (
                    ensurePackageInvoiceLineTx(tx, organizationId, session, data.admission_id, pkg)
                ));
                if (!ensured.success) return ensured;
            }
            invoice = await db.invoices.findFirst({
                where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
            });
            if (!invoice) return { success: false, error: 'No active invoice found after package bill repair' };

            const invItems = await db.invoice_items.findMany({ where: { invoice_id: invoice.id } });
            const extraItemIds = new Set(
                (await db.ipdChargePosting.findMany({
                    where: { admission_id: data.admission_id, disposition: CHARGE_DISPOSITION.BILLABLE_EXTRA },
                    select: { invoice_item_id: true },
                })).map((p: any) => p.invoice_item_id).filter(Boolean),
            );
            const strays = invItems.filter((i: any) => isPlainServiceItem(i) && !extraItemIds.has(i.id));
            const legacyAdjustments = invItems.filter(
                (i: any) => String(i.service_category || '') === LEGACY_PACKAGE_ADJUSTMENT_CATEGORY,
            );
            if (strays.length > 0 || legacyAdjustments.length > 0) {
                if (activeAdmPkgs.length > 1) {
                    return {
                        success: false,
                        error: `${strays.length} billed service line(s) are pending package assignment across ${activeAdmPkgs.length} active packages. Assign each to the correct package on the billing screen before discharge.`,
                    };
                }
                const reconciled = await reconcilePackageBillingInternal(db, organizationId, session, data.admission_id);
                if (!reconciled.success) {
                    return {
                        success: false,
                        error: `Package billing is not clean (${strays.length} billed service line(s) pending absorption) and could not be auto-reconciled: ${reconciled.error}`,
                    };
                }
                // Re-fetch — totals changed.
                invoice = await db.invoices.findFirst({
                    where: { admission_id: data.admission_id, status: { not: 'Cancelled' } },
                });
                if (!invoice) return { success: false, error: 'No active invoice found after package reconciliation' };
            }
        }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors remaining in `ipd-finance-actions.ts` from `getActiveAdmissionPackage`.

- [ ] **Step 5: Commit**

```bash
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(ipd): handle N active packages in interim bill, reconcile, and discharge gate"
```

---

### Task 4: `getPackageUtilization` and `getAbsorbedCharges` return per-package lists

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts:1212-1272` (`getPackageUtilization`)
- Modify: `app/actions/ipd-finance-actions.ts:1703-1745` (`getAbsorbedCharges`)

**Interfaces:**
- Produces: `getPackageUtilization(admissionId)` → `{ success, data: PackageUtil[] }` (was `data: PackageUtil | null`). Empty array instead of `null` when there's no package history at all. Each element has the exact same shape as the old single object (`admission_package_id`, `package_name`, `package_amount`, `status`, `is_broken_open`, `consumed`, `consumed_by_category`, `consumed_items`, `extras_billed`, `extra_items`, `remaining`, `utilization_pct`).
- Produces: `getAbsorbedCharges(admissionId)` → `{ success, data: { packages: AbsorbedGroup[], grandTotal: number } }` where each `AbsorbedGroup` is `{ admission_package_id, package_name, package_amount, total, byCategory, items, count }` (same per-item shape as before).
- Consumed by: Task 8 (`app/pharmacy/billing/page.tsx`), Task 9 (`app/ipd/billing/page.tsx`, `app/ipd/admission/[id]/page.tsx`).

- [ ] **Step 1: `getPackageUtilization` — iterate all admission-packages**

Replace `app/actions/ipd-finance-actions.ts:1212-1272` in full:

```typescript
export async function getPackageUtilization(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const admPkgs = await db.ipdAdmissionPackage.findMany({
            where: { admission_id: admissionId },
            include: { package: true },
            orderBy: { created_at: 'asc' },
        });

        if (admPkgs.length === 0) return { success: true, data: [] };

        const data = await Promise.all(admPkgs.map(async (admPkg: any) => {
            const postings = await db.ipdChargePosting.findMany({
                where: { admission_package_id: admPkg.id },
                orderBy: { posted_at: 'asc' },
            });

            const consumedItems = postings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.PACKAGE_CONSUMED);
            const extraItems = postings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.BILLABLE_EXTRA);

            const consumed = roundMoney(consumedItems.reduce((s: number, p: any) => s + Number(p.amount), 0));
            const extrasBilled = roundMoney(extraItems.reduce((s: number, p: any) => s + Number(p.amount), 0));
            const packageAmount = Number(admPkg.applied_amount);

            const consumedByCategory: Record<string, number> = {};
            for (const p of consumedItems) {
                const cat = p.service_category || p.source_module || 'Other';
                consumedByCategory[cat] = roundMoney((consumedByCategory[cat] || 0) + Number(p.amount));
            }

            const mapItem = (p: any) => ({
                id: p.id,
                description: p.description,
                service_category: p.service_category || p.source_module,
                source_module: p.source_module,
                amount: Number(p.amount),
                quantity: Number(p.quantity) || 1,
                posted_at: p.posted_at,
            });

            return {
                admission_package_id: admPkg.id,
                package_name: admPkg.applied_package_name || admPkg.package?.package_name,
                package_amount: packageAmount,
                status: admPkg.status,
                is_broken_open: admPkg.is_broken_open,
                consumed,
                consumed_by_category: consumedByCategory,
                consumed_items: consumedItems.map(mapItem),
                extras_billed: extrasBilled,
                extra_items: extraItems.map(mapItem),
                remaining: roundMoney(packageAmount - consumed),
                utilization_pct: packageAmount > 0 ? roundMoney((consumed / packageAmount) * 100) : 0,
            };
        }));

        return { success: true, data: serialize(data) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 2: `getAbsorbedCharges` — group by package**

Replace `app/actions/ipd-finance-actions.ts:1703-1745` in full:

```typescript
export async function getAbsorbedCharges(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const admPkgs = await db.ipdAdmissionPackage.findMany({
            where: { admission_id: admissionId },
            include: { package: true },
            orderBy: { created_at: 'asc' },
        });

        const postings = await db.ipdChargePosting.findMany({
            where: { admission_id: admissionId, disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED },
            orderBy: { posted_at: 'desc' },
        });

        const mapItem = (p: any) => ({
            id: p.id,
            description: p.description,
            category: p.service_category || p.source_module || 'Other',
            quantity: Number(p.quantity || 1),
            unit_price: Number(p.unit_price || 0),
            amount: Number(p.amount || 0),
            posted_at: p.posted_at,
        });

        const packages = admPkgs.map((admPkg: any) => {
            const items = postings
                .filter((p: any) => p.admission_package_id === admPkg.id)
                .map(mapItem);
            const total = items.reduce((s: number, i: any) => s + i.amount, 0);
            const byCategory: Record<string, number> = {};
            for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
            return {
                admission_package_id: admPkg.id,
                package_name: admPkg.applied_package_name || admPkg.package?.package_name || null,
                package_amount: Number(admPkg.applied_amount),
                total,
                byCategory,
                items,
                count: items.length,
            };
        }).filter((g: any) => g.count > 0 || g.package_amount > 0);

        const grandTotal = packages.reduce((s: number, g: any) => s + g.total, 0);

        return { success: true, data: serialize({ packages, grandTotal }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: new errors in the 4 UI callers (`app/pharmacy/billing/page.tsx`, `app/ipd/billing/page.tsx`, `app/ipd/admission/[id]/page.tsx`) and `app/api/ipd/[admissionId]/absorbed-charges/route.ts` — fixed in Tasks 7-9.

- [ ] **Step 4: Commit**

```bash
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(ipd): getPackageUtilization and getAbsorbedCharges return per-package data"
```

---

### Task 5: New action to assign/reassign a charge to a specific package

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts` (add new function near `reclassifyChargeDisposition`, after line 1500)

**Interfaces:**
- Produces: `assignChargeToPackage(postingId: number, admissionPackageId: number): Promise<{success, data?, error?}>` — moves a plain `BILLED` posting (one that has no package yet, e.g. because it posted while 2+ packages were active) into the named package's consumption ledger. Requires admin/finance/receptionist role, an ACTIVE target package on the same admission, and a Draft/unlocked invoice.
- Consumed by: Task 7 (UI "assign to package" control on unlinked billed lines).

- [ ] **Step 1: Add the function**

Insert after `reclassifyChargeDisposition` (after line 1500, before the `removeAbsorbedCharge` comment) in `app/actions/ipd-finance-actions.ts`:

```typescript
// Assign a plain billed charge (not yet linked to any package — e.g. posted
// while 2+ packages were active and no target was picked) into a specific
// active package's consumption ledger. The invoice line is removed and the
// amount moves to the absorbed-cost expense, mirroring the "extra → consumed"
// half of reclassifyChargeDisposition.
export async function assignChargeToPackage(postingId: number, admissionPackageId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const canAssign = isPrivilegedBillingRole(undefined) || true; // role check below uses session
        void canAssign;
        const { session } = await requireTenantContext();
        const allowed = isPrivilegedBillingRole(session?.role)
            || ['receptionist', 'reception'].includes(String(session?.role ?? '').toLowerCase());
        if (!allowed) {
            return { success: false, error: 'Only reception/admin/finance can assign charges to a package.' };
        }

        const posting = await db.ipdChargePosting.findUnique({ where: { id: postingId } });
        if (!posting) return { success: false, error: 'Charge posting not found' };
        if (posting.admission_package_id) {
            return { success: false, error: 'This charge is already linked to a package — use the reclassify control instead' };
        }
        if (posting.disposition !== CHARGE_DISPOSITION.BILLED) {
            return { success: false, error: `Charge disposition '${posting.disposition}' cannot be assigned to a package` };
        }

        const admPkg = await db.ipdAdmissionPackage.findUnique({ where: { id: admissionPackageId } });
        if (!admPkg || admPkg.admission_id !== posting.admission_id) {
            return { success: false, error: 'Package not found on this admission' };
        }
        if (admPkg.status !== ADMISSION_PACKAGE_STATUS.ACTIVE) {
            return { success: false, error: 'The package is no longer active' };
        }

        const invoice = await db.invoices.findFirst({
            where: { admission_id: posting.admission_id, status: { not: 'Cancelled' } },
        });
        if (!invoice) return { success: false, error: 'No IPD invoice found for this admission' };
        if (invoice.is_locked || invoice.status !== 'Draft') {
            return { success: false, error: 'The bill is finalized/locked — charges can no longer be reassigned.' };
        }

        await db.$transaction(async (tx: any) => {
            if (posting.invoice_item_id) {
                await tx.invoice_items.deleteMany({ where: { id: posting.invoice_item_id } });
            }
            await tx.ipdChargePosting.update({
                where: { id: posting.id },
                data: {
                    disposition: CHARGE_DISPOSITION.PACKAGE_CONSUMED,
                    invoice_item_id: null,
                    admission_package_id: admPkg.id,
                },
            });
            await recalculateInvoiceWithGstTx(tx, invoice.id);
        });

        await logAudit({
            action: 'ASSIGN_CHARGE_TO_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_charge_posting',
            entity_id: String(postingId),
            details: JSON.stringify({ description: posting.description, amount: Number(posting.amount), admission_package_id: admPkg.id }),
        });

        return { success: true, data: serialize({ posting_id: postingId, admission_package_id: admPkg.id }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

**Note for implementer:** delete the two dead lines `const canAssign = ...` / `void canAssign;` at the top of the function body — they're a leftover from drafting the role check and must not ship. The real role check is the `allowed` block right after.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors from this new function.

- [ ] **Step 3: Commit**

```bash
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(ipd): add assignChargeToPackage for routing unlinked charges post-hoc"
```

---

### Task 6: Fix room/nursing package-coverage check for multiple packages

**Files:**
- Modify: `app/actions/ipd-actions.ts:855-869`
- Modify: `app/actions/ipd-billing-helpers.ts:256-266`

**Interfaces:** None — internal-only fix, no signature change.

Both sites use `findFirst({ is_broken_open: false })` purely as a "does *some* package cover today" existence check (to skip double-billing Room/Nursing, which every package already includes). With 2 active packages, `findFirst` picks one arbitrarily — if that one's validity window has expired but the *other* active package still covers today, room/nursing would wrongly re-accrue. Fix: check across all matching packages with `.some(...)`.

- [ ] **Step 1: Fix `app/actions/ipd-actions.ts:855-869`**

Replace:

```javascript
    const activePkg = await db.ipdAdmissionPackage.findFirst({
      where: { admission_id: admissionId, is_broken_open: false },
      include: { package: { select: { validity_days: true } } },
    });
    let packageCoversToday = false;
    if (activePkg) {
      const validityDays = activePkg.package.validity_days || 7;
      const admitDateMidnight = new Date(admission.admission_date);
      admitDateMidnight.setHours(0, 0, 0, 0);
      const coveredUntil = new Date(admitDateMidnight);
      coveredUntil.setDate(admitDateMidnight.getDate() + validityDays - 1);
      coveredUntil.setHours(23, 59, 59, 999);
      const now = new Date();
      packageCoversToday = now <= coveredUntil;
    }
```

With:

```javascript
    const nonBrokenPkgs = await db.ipdAdmissionPackage.findMany({
      where: { admission_id: admissionId, is_broken_open: false },
      include: { package: { select: { validity_days: true } } },
    });
    const admitDateMidnight = new Date(admission.admission_date);
    admitDateMidnight.setHours(0, 0, 0, 0);
    const now = new Date();
    const packageCoversToday = nonBrokenPkgs.some((pkg: any) => {
      const validityDays = pkg.package.validity_days || 7;
      const coveredUntil = new Date(admitDateMidnight);
      coveredUntil.setDate(admitDateMidnight.getDate() + validityDays - 1);
      coveredUntil.setHours(23, 59, 59, 999);
      return now <= coveredUntil;
    });
```

- [ ] **Step 2: Fix `app/actions/ipd-billing-helpers.ts:256-266`**

Replace:

```typescript
        const activePkg = await db.ipdAdmissionPackage.findFirst({
            where: { admission_id: admissionId, is_broken_open: false },
            include: { package: { select: { validity_days: true, package_name: true } } },
        });
        let packageCoveredUntil: Date | null = null;
        if (activePkg) {
            const validityDays = activePkg.package.validity_days || 7;
            packageCoveredUntil = new Date(admitDate);
            packageCoveredUntil.setDate(admitDate.getDate() + validityDays - 1);
            packageCoveredUntil.setHours(23, 59, 59, 999);
        }
```

With:

```typescript
        const nonBrokenPkgs = await db.ipdAdmissionPackage.findMany({
            where: { admission_id: admissionId, is_broken_open: false },
            include: { package: { select: { validity_days: true, package_name: true } } },
        });
        // Latest coverage window across all non-broken packages — a day counts as
        // covered if ANY of them still includes it.
        let packageCoveredUntil: Date | null = null;
        for (const pkg of nonBrokenPkgs) {
            const validityDays = pkg.package.validity_days || 7;
            const coveredUntil = new Date(admitDate);
            coveredUntil.setDate(admitDate.getDate() + validityDays - 1);
            coveredUntil.setHours(23, 59, 59, 999);
            if (!packageCoveredUntil || coveredUntil > packageCoveredUntil) {
                packageCoveredUntil = coveredUntil;
            }
        }
```

Check the code immediately below this block (within the same function) for any other single-`activePkg` reference (e.g. a variable named `activePkg.package.package_name` used later in a description string) and update it to use `nonBrokenPkgs[0]` or drop the name if it was only used for the removed variable — read `app/actions/ipd-billing-helpers.ts:266-330` before finalizing this step to catch any such reference.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: pass with no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add app/actions/ipd-actions.ts app/actions/ipd-billing-helpers.ts
git commit -m "fix(ipd): room/nursing accrual checks coverage across all active packages"
```

---

### Task 7: `app/ipd/admission/[id]/page.tsx` — multi-package UI

**Files:**
- Modify: `app/ipd/admission/[id]/page.tsx` (state around line 185, package section ~2144-2260, consumed/extra lists ~2379-2440, charge-routing form ~2764-2800)

**Interfaces:**
- Consumes: `getPackageUtilization` (Task 4, now returns array), `postChargeToIpdBill` with `admission_package_id` (Task 2), `assignChargeToPackage` (Task 5).

- [ ] **Step 1: Rename state to a list**

Change `const [pkgUtil, setPkgUtil] = useState<any>(null);` (line 185) to:

```typescript
    const [pkgUtils, setPkgUtils] = useState<any[]>([]);
    const [chargeTargetPkgId, setChargeTargetPkgId] = useState<number | ''>('');
```

Find every other `setPkgUtil(` call (the `loadBill`/`loadData` effect around line 275) and change it to `setPkgUtils(res.success ? (res.data || []) : [])` matching the new array shape.

- [ ] **Step 2: Update the amount-edit and break-open handlers to operate on a chosen package**

Lines 295, 299, 309, 326, 329, 338 currently read `pkgUtil?.admission_package_id` / call `updateAdmissionPackageAmount(pkgUtil.admission_package_id, ...)` / `breakOpenPackage(pkgUtil.admission_package_id)` against the single package. These handlers are triggered from a specific package's card, so give each card its own local target: replace the shared `pkgUtil` reference in these handlers with a parameter, e.g. change `handleUpdatePkgAmount` to `handleUpdatePkgAmount(admissionPackageId: number)` and pass the specific card's `admission_package_id` from the JSX `onClick`. Same for the break-open handler: `handleBreakOpen(admissionPackageId: number)`.

- [ ] **Step 3: Loop the package status card over `pkgUtils`**

The block at lines 2179-2260 (the indigo/amber/rose utilization card) is currently guarded by `pkgUtil && pkgUtil.status === 'active' &&`. Wrap it in:

```tsx
{pkgUtils.filter((p: any) => p.status === 'active').map((pkgUtil: any) => (
  <div key={pkgUtil.admission_package_id}>
    {/* existing card JSX from lines 2180-2260, unchanged, referencing pkgUtil as before */}
  </div>
))}
```

Every reference to `pkgUtil.*` inside that block stays as-is since the `.map()` callback shadows a local `pkgUtil`. Any handler call inside (`onClick={() => { setEditingPkgAmount(true); ... }}`, break-open button) must now pass `pkgUtil.admission_package_id` explicitly per Step 2.

- [ ] **Step 4: Loop the consumed/extra items sections (lines 2379-2440) the same way**

Same pattern — wrap the existing block in `{pkgUtils.map((pkgUtil: any) => ( ... ))}` with `key={pkgUtil.admission_package_id}`, keep inner JSX unchanged. Guard `pkgUtil.consumed_items?.length > 0 || pkgUtil.extra_items?.length > 0` stays per-iteration.

- [ ] **Step 5: Add a package picker to the manual charge-posting form and pass it through**

Replace the `disposition_override` line at line 774:

```tsx
            disposition_override: pkgUtils.length > 0 && chargeDisposition !== 'auto'
                ? chargeDisposition
                : undefined,
            admission_package_id: pkgUtils.filter((p: any) => p.status === 'active').length > 1
                ? (chargeTargetPkgId || undefined)
                : undefined,
```

Above the "Package routing" section at line 2764 (`{chargeMode === 'service' && pkgUtil?.status === 'active' && (`), change the guard to `pkgUtils.some((p: any) => p.status === 'active')`, and inside it, when there are 2+ active packages, add a `<select>` bound to `chargeTargetPkgId` listing each active package's `package_name` (value = `admission_package_id`), defaulting to empty/unselected. Require a selection before allowing `chargeDisposition` to be anything but `'auto'` when 2+ packages are active (client-side validation: `if (activeCount > 1 && chargeDisposition !== 'auto' && !chargeTargetPkgId) { toast.error('Select which package this charge belongs to'); return; }` in `handlePostCharge`).

- [ ] **Step 6: Verify "Apply Package" is never hidden by an existing package**

Confirm (no code change expected) that the `chargeMode === 'package'` picker (lines 743-758) has no `pkgUtil`-based guard blocking it — from the Task 7 research this section only checks `!selectedPkgId`, so no change needed here beyond what Steps 1-5 already touch. After Step 1-5 edits, re-grep `pkgUtil\b` (singular, not `pkgUtils`) in this file to confirm zero remaining references before moving on.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: pass, zero errors in this file.

- [ ] **Step 8: Commit**

```bash
git add app/ipd/admission/[id]/page.tsx
git commit -m "feat(ipd): render multiple package cards and let staff target a package when posting a charge"
```

---

### Task 8: `app/pharmacy/billing/page.tsx` — multi-package absorbed section

**Files:**
- Modify: `app/pharmacy/billing/page.tsx` (state consuming `getPackageUtilization`, "Pharmacy — Absorbed Under Package" section from line ~1017)

**Interfaces:**
- Consumes: `getPackageUtilization` (Task 4, array), `updateAbsorbedCharge` (existing, already keyed by posting id — no change needed).

- [ ] **Step 1: Update state to hold an array and loop the render section**

Find the state variable populated by `getPackageUtilization(...)` at lines 304/315 (likely `pkgUtil`/`setPkgUtil` or similarly named — confirm exact name by reading lines 295-330 first) and rename to a list (`pkgUtils`/`setPkgUtils`), setting it to `res.success ? (res.data || []) : []`.

Wrap the "Pharmacy — Absorbed Under Package" panel (from line ~1017) in `{pkgUtils.map((pkgUtil: any) => ( <div key={pkgUtil.admission_package_id}> ... </div> ))}`, keeping the existing inner JSX (label, item list, `updateAbsorbedCharge(item.id, ...)` calls) unchanged — each iteration's `pkgUtil.consumed_items`/`pkgUtil.package_name` naturally scopes to that one package. Update the panel's visibility condition from whatever single-package check currently gates it (read the render condition at the top of that block before editing) to run per-iteration on that package's own `pkgUtil.consumed_items?.length > 0`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: pass, zero errors in this file.

- [ ] **Step 3: Commit**

```bash
git add app/pharmacy/billing/page.tsx
git commit -m "feat(pharmacy): render absorbed-under-package section per active package"
```

---

### Task 9: `app/ipd/billing/page.tsx` + printable route — grouped absorbed ledger

**Files:**
- Modify: `app/ipd/billing/page.tsx:1430-1510` (absorbed charges display, reads `absorbedData`)
- Modify: `app/api/ipd/[admissionId]/absorbed-charges/route.ts:27-49` (printable ledger)

**Interfaces:**
- Consumes: `getAbsorbedCharges` (Task 4, now `{ packages: [...], grandTotal }`).

- [ ] **Step 1: `app/ipd/billing/page.tsx` — loop `absorbedData.packages`**

The block using `absorbedData.package_name` / `absorbedData.byCategory` / `absorbedData.items` / `absorbedData.package_amount` (lines ~1441-1505) reads a single flat object today. Change the surrounding JSX to iterate `absorbedData.packages` (each with the same field names as before, just nested one level: `pkg.package_name`, `pkg.byCategory`, `pkg.items`, `pkg.package_amount`), rendering one sub-section per package, and show `absorbedData.grandTotal` once at the end instead of the old single `package_amount` total row. Read lines 1420-1510 in full before editing to capture the exact surrounding JSX structure (headers, empty-state message) so the loop wraps correctly.

- [ ] **Step 2: `app/api/ipd/[admissionId]/absorbed-charges/route.ts` — group the printable table by package**

Replace lines 27-49 (the `Promise.all` fetch + `items`/`total`/`byCategory` computation) to fetch all admission-packages instead of `findFirst`, and group `postings` by `admission_package_id` the same way as the Task 4 `getAbsorbedCharges` grouping:

```typescript
        const [patient, admPkgs, postings, branding] = await Promise.all([
            prisma.oPD_REG.findFirst({ where: { patient_id: admission.patient_id, organizationId }, select: { full_name: true, patient_id: true } }),
            prisma.ipdAdmissionPackage.findMany({ where: { admission_id: admissionId }, include: { package: true }, orderBy: { created_at: 'asc' } }),
            prisma.ipdChargePosting.findMany({
                where: { admission_id: admissionId, disposition: 'package_consumed' },
                orderBy: { posted_at: 'desc' },
            }),
            getBillBranding(organizationId),
        ]);

        const mapItem = (p: any) => ({
            id: p.id,
            date: new Date(p.posted_at).toLocaleDateString('en-GB'),
            description: p.description,
            category: p.service_category || p.source_module || 'Other',
            quantity: Number(p.quantity || 1),
            amount: Number(p.amount || 0),
        });

        const packages = admPkgs.map((admPkg: any) => {
            const items = postings.filter((p: any) => p.admission_package_id === admPkg.id).map(mapItem);
            const total = items.reduce((s: number, i: any) => s + i.amount, 0);
            const byCategory: Record<string, number> = {};
            for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
            return {
                package_name: admPkg.applied_package_name || admPkg.package?.package_name || '',
                package_amount: Number(admPkg.applied_amount),
                items, total, byCategory,
            };
        });
        const grandTotal = packages.reduce((s: number, g: any) => s + g.total, 0);
```

Then update the `rows`/`catChips`/table-building code below (lines ~51-142) to iterate `packages`, rendering one `<h3>{packageName}</h3>` + table per package (reusing the existing row/chip HTML-building logic per package), and a final grand-total row using `grandTotal` instead of the old single `total`/`packageAmount`. Keep the `×` remove-button wiring (`data-id="${i.id}"`) unchanged — `removeAbsorbedCharge` is already posting-id keyed and needs no change.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: pass, zero errors in both files.

- [ ] **Step 4: Commit**

```bash
git add app/ipd/billing/page.tsx app/api/ipd/[admissionId]/absorbed-charges/route.ts
git commit -m "feat(ipd): group absorbed-charges ledger by package in billing UI and printable view"
```

---

### Task 10: Manual end-to-end QA

**Files:** None (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: zero errors repo-wide.

- [ ] **Step 2: Start dev server and walk the flow**

Run: `npm run dev` (background)

1. Open an in-progress IPD admission with no package. Apply Package A. Confirm it shows as active, confirm existing single-package behavior (charge posting, utilization bar, break-open) all still work exactly as before — this is the regression check for the "0 or 1 active package" path.
2. On the same admission, apply Package B while Package A is still active. Confirm the previous "already applied" error is gone and both packages now show as separate cards.
3. Post a manual charge with 2 active packages: confirm the UI now requires picking a target package (or leaving it as a plain billed item), and confirm the resulting charge lands in the correct package's consumption ledger (or as a plain bill line if left unassigned).
4. Use `assignChargeToPackage` (via whatever control Task 7 wired it to — if no dedicated UI button was added in Task 7 beyond the picker, note this as a follow-up rather than blocking; the action itself must at least be callable and correct) on an unassigned charge and confirm it moves into the chosen package's ledger and off the bill.
5. Attempt discharge with unassigned stray billed lines and 2 active packages — confirm it's blocked with the new explicit error message rather than silently guessing.
6. Break open one of the two packages — confirm the other stays active and unaffected.
7. Check the pharmacy billing page and the IPD billing page's absorbed-charges panel/printable view both show two separate package sections with correct per-package totals.

- [ ] **Step 3: Report results to the user**

Summarize pass/fail for each of the 7 checks above before considering this plan complete.

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: guard removal (Task 1), charge routing ambiguity (Tasks 2, 5, 7), read-side aggregation (Tasks 4, 8, 9), room/nursing double-suppression edge case found during research (Task 6), discharge safety (Task 3) — all covered.
- Every task ends independently typecheck-clean and committable; Task 7's UI changes are the largest single diff and may be worth subagent-driven review before merging given billing blast radius.
