# Referral & Commission — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design), pending implementation plan
**Module:** Reception (registration) + Admin/Finance (management & payouts)

## 1. Problem & Goal

Hospitals receive patients through referrers (staff, affiliates, RMPs, etc.) who earn a
commission on the business those patients generate. Today the app has only a free-text
`OPD_REG.lead_source` field and a doctor-only `DoctorReferralNetwork` CRM model — neither
links a patient to a payable referrer, and there is no commission ledger or payout flow.

Build a complete referral workflow:

- At registration, Reception picks **who referred the patient** (default **Self** = no referrer).
- Admin/Finance manage a roster of referrers, each with a configurable commission setup.
- The system accrues commission on every bill the referred patient generates, lifetime.
- Admin/Finance review accrued commission and pay it out via periodic statements.

## 2. Business Rules (locked)

| Rule | Decision |
|------|----------|
| Commission basis | **Per-referrer, configurable**: each referrer is one of `flat_percent`, `per_service`, or `fixed_per_patient`. |
| Attribution scope | **All bills, lifetime** — every bill the patient ever generates accrues to their referrer. |
| Accrual trigger | **On payment collected** — commission is based on amount actually paid, not billed. |
| Payout workflow | **Periodic statements** — per-referrer statement for a date range; review, finalize, mark paid. |
| Self patients | `referrer_id = null` (no stored "Self" row). "Self" count = patients with null referrer. |
| Per-service granularity | Rates keyed to `invoices.invoice_type` (OPD/IPD/Pharmacy/Lab/Procedure), not item-level. |

## 3. Visibility & Permissions

Referral data is **internal-only**:

- **Reception** — sees only the "Referred By" dropdown + quick-add at registration. No commission figures.
- **Admin / Finance** — full management, ledger, statements, payouts. Pages guarded by
  `requireRoleAndTenant(['admin','finance'])`.
- **Never exposed** on bills, receipts, the patient portal, or any clinical/doctor screen.
- All data scoped by `organizationId` (multi-tenant), consistent with existing models.

## 4. Data Model

Four new tables + one new column. Existing `DoctorReferralNetwork` is left untouched (separate CRM feature; its doctor-only shape does not fit the 5 categories or the ledger).

### 4.1 `Referrer` — the person/entity

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `organizationId` | String | tenant scope |
| `name` | String | required |
| `phone` | String? | |
| `email` | String? | |
| `address` | String? | |
| `notes` | String? | |
| `category` | String | `staff \| affiliate \| interpreter \| rmp \| others` (`self` is implicit/virtual, never stored) |
| `pan_number` | String? | payout/compliance |
| `bank_account` | String? | payout |
| `ifsc` | String? | payout |
| `commission_type` | String | `flat_percent \| per_service \| fixed_per_patient` |
| `flat_percent` | Float? | used when `flat_percent` |
| `fixed_amount_per_patient` | Float? | used when `fixed_per_patient` |
| `is_active` | Boolean | default true |
| `created_by` | String? | username |
| `created_at` | DateTime | default now |
| `updated_at` | DateTime | @updatedAt |

Indexes: `(organizationId)`, `(organizationId, category)`, `(organizationId, is_active)`.

### 4.2 `ReferrerServiceRate` — per-service rates

Only meaningful when `commission_type = per_service`. One row per (referrer, service_type).

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `organizationId` | String | |
| `referrer_id` | String | FK → Referrer |
| `service_type` | String | matches `invoices.invoice_type`: `OPD \| IPD \| Pharmacy \| Lab \| Procedure` |
| `percent` | Float | missing service_type ⇒ 0% |

Constraints: `@@unique([referrer_id, service_type])`, index `(organizationId)`.

### 4.3 `ReferralCommission` — accrual ledger

One row per invoice that earns commission for a referrer. Created/updated by the commission
engine as payments are collected.

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `organizationId` | String | |
| `referrer_id` | String | FK → Referrer |
| `patient_id` | String | FK → OPD_REG.patient_id |
| `invoice_id` | Int | FK → invoices.id |
| `invoice_type` | String | snapshot of bill type |
| `eligible_base` | Decimal | collected amount this commission is computed on |
| `rate_applied` | Float | percent (or 0 for fixed_per_patient rows) |
| `commission_amount` | Decimal | computed payable |
| `status` | String | `accrued \| included_in_statement \| paid \| void` |
| `statement_id` | String? | FK → ReferralPayoutStatement |
| `accrued_at` | DateTime | default now |
| `updated_at` | DateTime | @updatedAt |

Constraints: `@@unique([invoice_id])` (one ledger row per invoice; upserted as payments arrive),
indexes `(organizationId)`, `(referrer_id, status)`, `(patient_id)`, `(statement_id)`.

For `fixed_per_patient` referrers, the fixed amount is credited **once per patient** (on the
patient's first qualifying collected bill), recorded as a single `ReferralCommission` row;
later bills for that patient add no further commission.

### 4.4 `ReferralPayoutStatement` — periodic payout

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `organizationId` | String | |
| `referrer_id` | String | FK → Referrer |
| `period_start` | DateTime | |
| `period_end` | DateTime | |
| `total_commission` | Decimal | sum of included lines at finalize time |
| `status` | String | `draft \| finalized \| paid` |
| `paid_at` | DateTime? | |
| `paid_amount` | Decimal? | |
| `payment_mode` | String? | cash/bank/UPI/etc. |
| `payment_reference` | String? | txn ref |
| `notes` | String? | |
| `created_by` | String? | |
| `created_at` | DateTime | default now |
| `updated_at` | DateTime | @updatedAt |

Lines = `ReferralCommission` rows linked via `statement_id`. Index `(organizationId, referrer_id)`.

### 4.5 `OPD_REG.referrer_id`

New nullable column `referrer_id String?` with index `(organizationId, referrer_id)`.
`null` = Self. Set at registration; editable later by Admin/Finance only.
Add relation `referrer Referrer? @relation(...)`.

## 5. Registration Page Change

File: `app/reception/register/page.tsx` + `app/actions/register-patient.ts`.

- New **first field**: **"Referred By"** — searchable dropdown.
- Options: **Self** (default, pinned top) + all active referrers, each labeled with category
  (e.g. "Dr Mehta — RMP").
- Inline **"+ Add new referrer"** quick-add (name + category + phone) so reception is never
  blocked when a referrer is missing from the roster. Creates a `Referrer` and selects it.
- On submit, persist `referrer_id` to `OPD_REG` (add to the `registerPatient` payload — the
  `rawInput` object and the `db.oPD_REG.create` data block). `null`/empty ⇒ Self.
- Reception-only; nothing about the referrer surfaces anywhere downstream.

## 6. Referrer Management Pages (Admin + Finance)

Shared components, mounted at both `/admin/referrals` and `/finance/referrals`. Add a
"Referrals" nav item to `AdminSidebar` and the Finance nav. Both guarded for admin/finance.

### 6.1 List view
Table of referrers: name, category, commission-setup summary, **# patients referred**,
**# bills**, **total business (collected)**, **commission accrued**, **commission paid**,
**outstanding**. A top **Self** summary row shows count of self/walk-in patients (referrer_id
null). Filters: category + search. Actions: add referrer.

### 6.2 Detail view (click a referrer) — three tabs
1. **Patients** — patients this referrer sent; each row links to that patient's bills/receipts
   and shows per-patient commission earned.
2. **Commission ledger** — every accruing bill line: invoice #, type, eligible base, rate,
   commission, status.
3. **Payout statements** — list of statements + "Create statement" for a date range. Creating
   pulls all `accrued` commissions in range into a `draft` statement → review → **finalize**
   (locks lines, sets `included_in_statement`) → **mark paid** (mode/reference/amount). Statement
   is printable/exportable.

### 6.3 Add/Edit referrer form
Name, category, contact, payout details (PAN/bank/IFSC), and commission setup:
- choose `commission_type`;
- if `flat_percent` → one percent;
- if `fixed_per_patient` → one amount;
- if `per_service` → a small grid of service_type → percent (`ReferrerServiceRate` rows).

## 7. Commission Engine

A server-side function `recomputeInvoiceCommission(invoiceId)`:

1. Load invoice → patient → `referrer_id`. If null (Self) ⇒ delete any existing commission row
   for the invoice and return (no accrual).
2. Resolve rate from the referrer's `commission_type`:
   - `flat_percent` ⇒ `referrer.flat_percent`.
   - `per_service` ⇒ `ReferrerServiceRate.percent` for `invoice.invoice_type` (else 0).
   - `fixed_per_patient` ⇒ flat amount, credited **once per patient** (only if no prior
     fixed-commission row exists for that patient); else 0 for this invoice.
3. Compute base = invoice `paid_amount` (collected). `commission_amount = base × rate` for
   percent types; for fixed-per-patient the fixed amount.
4. **Upsert** the `ReferralCommission` row keyed by `invoice_id`, but only while it is still
   `accrued` (never mutate rows already `included_in_statement`/`paid` — those are locked;
   adjustments to locked periods are out of scope for v1 and handled manually).
5. Cancellations/refunds lower `paid_amount` ⇒ recompute downward; zero ⇒ set `void` (if still
   accrued).

**Hook point:** call `recomputeInvoiceCommission` from the existing payment-recording flow
(wherever `invoices.paid_amount`/`balance_due` are updated after a payment, refund, or
cancellation). Wrap in try/catch so commission errors never block billing.

**Backfill:** a one-off admin action to walk existing paid invoices and create commission rows
for patients that already have a `referrer_id` (relevant after go-live if referrers are
back-filled).

## 8. Build Phases

1. **Schema + migration** — 4 tables + `OPD_REG.referrer_id`; generate Prisma client.
2. **Referrer CRUD** — server actions + management list/detail/form pages (admin + finance),
   nav links, role guards.
3. **Registration** — "Referred By" dropdown + quick-add; persist `referrer_id`.
4. **Commission engine** — `recomputeInvoiceCommission` + wire into payment flow; backfill action.
5. **Payout statements** — create/finalize/mark-paid/export.
6. **Reporting** — list-view aggregates (counts, self vs referred, totals).

## 9. Out of Scope (v1)

- Editing/recomputing commission already locked into a finalized/paid statement (manual only).
- Item-level (per service line) commission rates — only `invoice_type`-level.
- Referrer self-service portal / login.
- Tax/TDS computation on payouts (capture PAN only).
- Migrating data from the existing `DoctorReferralNetwork` model.
