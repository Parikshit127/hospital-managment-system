# IPD Package Billing — Two-Ledger Design

**Date:** 2026-07-02 · **Status:** IMPLEMENTED (2026-07-02) · **Owner:** Billing/IPD team

> Implementation notes: shipped as designed with two deltas. (1) No org-level
> feature flag — the router is inherently scoped to admissions with an ACTIVE
> package, and the migration closes packages on already-discharged admissions,
> so historical data cannot be affected. (2) The discharge gate auto-reconciles
> dirty Draft invoices (deterministic + audited) instead of erroring, to avoid
> blocking discharges on legacy admissions; it still refuses locked bills.
> Migration: `prisma/migrations/20260702090000_package_two_ledger_billing/`.

## 1. Problem

Today a package is posted to the IPD invoice as just another service line (`applyPackageToAdmission` → `postChargeToIpdBill`, category `Package`), while every service consumed during the stay (room, pharmacy, OT, lab) is *also* posted as its own invoice line. The bill double-counts, and the only correction is a **manual** "Settle package" button (`settlePackageBilling`) that appends a negative "Package Adjustment" line and books one lump-sum Expense.

Consequences:

- If nobody clicks settle (or charges are added after settling), the TPA/insurance bill goes out inflated: Package ₹50,000 + Room ₹6,000 + Lab ₹3,200 + Pharmacy ₹4,800 = ₹64,000 claimed instead of ₹50,000.
- Even after settling, the printed bill shows every service line plus a negative adjustment — not a clean package bill a TPA expects.
- The absorbed cost is one lump-sum `Expense` with no breakup (no pharma/room/surgery split).
- Revenue-by-category reports (`getIpdRevenueByCategory`) are polluted by inflated service categories plus a negative "Package Adjustment" category.
- Everything is absorbed — there is no way to bill a legitimately excluded item (extra LOS, non-covered pharmacy, implants) over the package.

## 2. Design decisions (confirmed 2026-07-02)

1. **Absorption is automatic at posting time** — no settle button in the happy path.
2. **Exclusions are supported** — a charge can be marked *billable over the package*.
3. **Model applies to all payer types** (cash / corporate / tpa_insurance) — one consistent billing model.
4. Deliverable: this design first; implementation follows.

## 3. Core concept: two ledgers per package admission

| Ledger | Table | Contains | Who sees it |
|---|---|---|---|
| **Claim ledger** | `invoices` / `invoice_items` | Package line(s) + *billable-extra* lines only | Patient, TPA, insurer, GST, revenue reports |
| **Consumption ledger** | `IpdChargePosting` (extended) | Every service consumed under the package, full detail | Internal: expense breakup, utilization, margin |

The invoice **is** the TPA bill. Because consumed services never enter it, the printed bill is clean by construction — no negative adjustment line, no settle step, no way to send an inflated claim. The consumption ledger is the single source of truth for the breakup (pharma, room, surgery…) and feeds the expense side.

```
Service posted to package admission
        │
        ▼
postChargeToIpdBill (single choke point — pharmacy/lab/OT/room/manual all flow through it)
        │
        ├── no active package ──────────────► invoice_items (billed, as today)
        │
        ├── active package + within package ─► IpdChargePosting only
        │                                      disposition = package_consumed
        │                                      (+ rolling Expense upsert)
        │
        └── active package + excluded item ──► invoice_items (billed over package)
                                               disposition = billable_extra
```

## 4. Schema changes (all additive — no destructive migration)

### 4.1 `IpdChargePosting` — becomes the consumption ledger

```prisma
model IpdChargePosting {
  // existing fields unchanged: id, admission_id, invoice_item_id?, source_module,
  // source_ref_id?, description, amount, posted_by?, posted_at, is_backdated, organizationId

  disposition          String   @default("billed")
  // 'billed'            → normal invoice line (invoice_item_id set)
  // 'package_consumed'  → absorbed under package (invoice_item_id NULL)
  // 'billable_extra'    → excluded item billed over package (invoice_item_id set)

  admission_package_id Int?                  // FK → IpdAdmissionPackage, set for the two package dispositions
  service_category     String?               // denormalized for breakup grouping (Room, Pharmacy, Surgery, Lab…)
  quantity             Float    @default(1)
  unit_price           Decimal  @default(0)
  tax_rate             Decimal  @default(0)  // informational for consumed lines (not claimed)

  admission_package    IpdAdmissionPackage? @relation(fields: [admission_package_id], references: [id])

  @@index([admission_package_id])
  @@index([admission_id, disposition])
}
```

Why extend rather than add a parallel table: every charge already produces exactly one `IpdChargePosting`; the disposition simply decides whether it *also* becomes an invoice item. One posting stream, no duplication of business logic, and `getPackageUtilization` keeps working with a sharper filter.

### 4.2 `IpdAdmissionPackage` — explicit lifecycle

```prisma
model IpdAdmissionPackage {
  // existing fields unchanged
  status           String   @default("active")  // active | broken_open | closed
  closed_at        DateTime?
  expense_id       Int?     // FK → Expense (the rolling absorbed-cost expense)
  consumptions     IpdChargePosting[]
}
```

`is_broken_open` stays for backward compatibility during migration; `status` supersedes it. `closed` is set at bill finalization.

### 4.3 `IpdPackage.exclusions` — define the JSON contract (field already exists)

```json
[
  { "match": "category", "value": "Pharmacy",  "note": "Non-formulary drugs billable" },
  { "match": "service",  "value": "1042",      "note": "Implant — billed at actuals" },
  { "match": "keyword",  "value": "blood",     "note": "Blood products excluded" }
]
```

Matching (in `resolveDisposition`, §5.2) is a *default suggestion*; the user can override at add-time, and a supervisor can reclassify later. `inclusions` stays informational (printed on the package annexure).

### 4.4 No changes to `invoices`, `invoice_items`, `insurance_claims`

The auto-claim path already derives `claimed_amount` from `invoice.net_amount` (`insurance-actions.ts` ~L807), so claims become structurally correct with zero changes to the insurance stack (pre-auth, receipts, PaymentSplit, Zealthix flow all untouched). One hardening item: manual `submitInsuranceClaim` (~L418) accepts a free-typed `claimed_amount` validated only against the policy limit — additionally cap it at `invoice.net_amount` server-side so an inflated claim can't be keyed in by hand.

## 5. Backend changes — all in `app/actions/ipd-finance-actions.ts` unless noted

### 5.1 `applyPackageToAdmission` (modify)

1. Create `IpdAdmissionPackage` (status `active`) — unchanged.
2. Post the package invoice line — unchanged (GST via `getPackageGSTRate`).
3. **New — mid-stay application:** if non-package `invoice_items` already exist on the Draft invoice (services added before the package was applied), atomically migrate them: snapshot the invoice to `invoice_snapshots`, delete those items from the invoice, recreate each as a `package_consumed` posting (they already have matching `IpdChargePosting` rows — update those rows: clear `invoice_item_id`, set disposition + `admission_package_id`), recalc totals via `recalculateInvoiceWithGst`, upsert the rolling Expense. Entire step in one `db.$transaction`.
4. Audit: `APPLY_IPD_PACKAGE` with count/amount of migrated lines.

Locked/Final invoices refuse package application (existing `isBillClosedForCharges` guard already prevents the posting; add an explicit friendly error).

### 5.2 `postChargeToIpdBill` (modify — the router)

New optional param `disposition_override?: 'package_consumed' | 'billable_extra'` (from the UI toggle).

```
resolveDisposition(admission, charge):
  pkg = active IpdAdmissionPackage (status = 'active')        // one query, indexed
  if !pkg                          → 'billed'
  if disposition_override          → override                  // user chose in UI
  if matchesExclusions(pkg.package.exclusions, charge)
                                   → 'billable_extra'
  else                             → 'package_consumed'
```

- `billed` / `billable_extra`: current behavior — create `invoice_items`, recalc invoice, create posting (with disposition + `admission_package_id` for extras).
- `package_consumed`: **skip invoice entirely.** Create the posting with full detail (category, qty, rate, tax fields), then upsert the rolling Expense (§5.4). All inside one transaction — no window where a consumed charge sits on the invoice.
- The pharmacist-role guard, master-service lookup, backdating flag, and discharge/lock guards apply identically to all dispositions.

### 5.3 `reclassifyChargeDisposition` (new)

Moves a posting between `package_consumed` ↔ `billable_extra` after the fact (wrong toggle at add-time happens under ward pressure). Rules: Draft/unlocked invoice only; requires billing-supervisor (or admin) role; transaction creates or deletes the corresponding `invoice_items` row, recalcs invoice, re-upserts the Expense; audit `RECLASSIFY_PACKAGE_CHARGE` with before/after.

### 5.4 Rolling Expense with breakup (replaces lump-sum-at-settle)

Keep **one `Expense` per admission package** (category `Package Absorbed Cost`, `reference_no = PKG-ABSORB-<admissionId>` — both already exist), upserted inside each consumption transaction:

- `amount` / `total_amount` = Σ consumed postings (net + tax).
- `notes` = JSON summary by category `{ "Room": 6000, "Pharmacy": 4800, "Surgery": 3200 }` for quick display.
- The **authoritative breakup is always the consumption ledger** — the expense drill-down screen queries postings by `admission_package_id` grouped by `service_category`. The Expense row exists so P&L and expense reports pick it up with zero changes.
- If total consumption becomes 0 (all lines reclassified), delete the Expense (mirrors current settle behavior).

**Accounting caveat (flag to finance):** absorbed consumption is internal cost absorption, not a cash outflow. Booking it as an Expense matches the current system and Parikshit's requested model, and keeps P&L conservative. Recommendation: map the `Package Absorbed Cost` category to a **contra-revenue GL account** (via existing `createJournalEntry` in `gl-actions.ts`) rather than an operating-expense account, and exclude the category from cash-basis expense reports. This keeps net revenue = package amount without overstating cash expenses.

### 5.5 `settlePackageBilling` → `reconcilePackageBilling` (repurpose)

No longer in the happy path. Keep it (admin-only) as a **repair/migration tool**: for a given admission it (a) migrates any stray non-package invoice lines into consumption (Draft invoices — same routine as §5.1 step 3), (b) removes legacy "Package Adjustment" negative lines, (c) rebuilds the rolling Expense from the ledger. Idempotent, like today.

### 5.6 Finalization gate (in the finalize path, `ipd-finance-actions.ts` ~L1045)

Before setting `status = 'Final'` on a package admission: assert the invoice contains **no** non-package, non-extra service lines and no legacy adjustment lines. If violated → block with "Run package reconciliation first." Also set `IpdAdmissionPackage.status = 'closed'`. This is the server-side guarantee that no inflated bill can ever be finalized or claimed, regardless of UI state.

### 5.7 `breakOpenPackage` (complete the flow)

Break-open = patient exits the package; billing reverts to itemized. In one transaction: set status `broken_open`; convert every `package_consumed` posting back to real `invoice_items` (re-bill at recorded qty/rate/tax); remove the package invoice line; delete the rolling Expense; recalc invoice; audit. Blocked on locked/Final invoices.

### 5.8 `getPackageUtilization` (sharpen)

Consumed = Σ postings where `disposition = 'package_consumed'` (today it approximates with `source_module != 'package'`, which after this change would wrongly include billable extras). Add `consumed_by_category` to the payload for the breakup widget, plus `extras_billed` as a separate figure.

## 6. UI changes

**Admission billing tab** (`app/ipd/admission/[id]/page.tsx`)
- When a package is active: banner `Package: <name> — ₹X · Consumed ₹Y (Z%) · Extras billed ₹E` with over-utilization warning at configurable threshold (default 90%) and red at >100% (prompt: reclassify extras or break open).
- Add-charge form gains a disposition toggle, default pre-resolved from exclusions: `● Within package (absorbed)  ○ Billable over package`, with the matched exclusion note shown when auto-suggested.
- Bill view = invoice = package + extras only. A separate **Consumption** section lists absorbed services grouped by category (reads the ledger), with reclassify action for supervisors.
- Remove the "Settle package" button; keep "Reconcile" under an admin menu for legacy admissions.

**Bill / TPA print** (interim + final + discharge settlement)
- Main bill prints exactly the invoice: `Package: <name> …… ₹50,000`, any extras, GST summary — clean by construction.
- New **Package Utilization Annexure** print (internal; optionally attached for TPAs that demand a breakup): package amount, consumption lines grouped by category with qty/rate, utilization %, extras billed separately. This is the "breakup" document — the claim never needs to change to show it.

**Finance module**
- Expense list: `Package Absorbed Cost` rows drill down to the per-category breakup (consumption ledger query keyed by `reference_no` → admission → package).

## 7. Reports

- `getIpdRevenueByCategory` (~L720): package revenue correctly appears under `Package`; the inflated per-category service revenue and the negative `Package Adjustment` category disappear for new admissions. Add a companion **Package Consumption by Category** report (same shape, sourced from the consumption ledger) so ops still sees departmental activity.
- New **Package Margin report**: per admission/package — package price vs consumption at tariff → profitability per package. This is the report that tells the hospital which packages are priced wrong.
- Claims reports: no change; `claimed_amount` is now structurally correct.

## 8. Migration & rollout

**Phase 0 — schema:** additive Prisma migration (§4). Zero downtime; defaults make existing rows valid (`disposition = 'billed'`).

**Phase 1 — backfill (script, per org):** for each admission with an `IpdAdmissionPackage`:
- Draft/unlocked invoice → run `reconcilePackageBilling`: service lines → consumption postings, drop legacy adjustment lines, rebuild Expense (now with breakup), snapshot invoice first.
- Locked/Final invoice → do **not** touch the invoice; backfill dispositions on postings only (reporting stays truthful) and log to a reconciliation report for finance review.

**Phase 2 — enable router** behind an org-level feature flag (`package_auto_absorption`, default off) → pilot org → all orgs. Rollback = flag off (old posting path resumes; consumption data preserved; no destructive step anywhere).

**Phase 3 — cleanup:** remove settle button from UI, flip flag default on, mark `settlePackageBilling` deprecated.

## 9. Test plan

- **Unit — disposition matrix:** no package / active / broken_open / closed × override / exclusion-match (category, service, keyword) / default → asserts exact ledger + invoice effects.
- **Unit:** mid-stay package application migrates prior lines atomically; reclassify both directions recalcs invoice + expense; rolling Expense equals ledger sum after arbitrary sequences; break-open restores itemized bill exactly; reconcile is idempotent.
- **Integration:** finalization gate blocks dirty invoices; GST totals correct for package + extras; pharmacist guard and lock guards unchanged; concurrent postings (transaction isolation) never leak a consumed charge onto the invoice.
- **E2E (the original bug):** TPA patient → apply package ₹50,000 → post room ₹6,000, pharmacy ₹4,800, lab ₹3,200, implant (excluded) ₹10,000 → interim & final bill show **₹60,000** (package + implant only) → claim `claimed_amount` = 60,000 → annexure shows ₹14,000 breakup by category → Expense = ₹14,000 with same breakup → margin report shows package margin.
- **Migration rehearsal** on a production copy; verify invoice totals unchanged for locked bills.

## 10. Out of scope / V2 (explicitly deferred)

- **Multiple concurrent packages** per admission (schema supports it; router currently assumes one active — V2 needs per-charge package attribution).
- **Room-upgrade differential** (patient upgrades beyond package entitlement → differential billable to patient, not TPA): model as a `billable_extra` with payer-routing — needs the PaymentSplit payer-share design.
- **Extras payer routing** (extra to patient vs TPA over-and-above) — currently extras follow the invoice's existing payer split.
- **AI opportunities (recommend only):** package margin anomaly alerts (consumption > price pattern), exclusion auto-suggestion from historical reclassifications, package price optimization from margin history.

## 11. Effort estimate

| Workstream | Est. |
|---|---|
| Schema + router + expense/reclassify/reconcile backend | 3–4 dev-days |
| UI (billing tab, toggle, consumption panel, prints/annexure) | 2–3 dev-days |
| Reports (utilization, consumption-by-category, margin) | 1–2 dev-days |
| Backfill script + migration rehearsal + tests | 2–3 dev-days |

Key existing code touched: `app/actions/ipd-finance-actions.ts` (`postChargeToIpdBill` L173, `applyPackageToAdmission` L347, `breakOpenPackage` L410, `getPackageUtilization` L432, `settlePackageBilling` L477, finalize ~L1045, `getIpdRevenueByCategory` L720), `app/ipd/admission/[id]/page.tsx`, `prisma/schema.prisma` (`IpdChargePosting` L2932, `IpdAdmissionPackage` L2888).
