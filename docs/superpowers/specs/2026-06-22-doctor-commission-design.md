# Doctor Invoicing & Commission — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design), implementing
**Module:** Admin/Finance (doctor commission management & payouts)
**Sibling:** Mirrors `2026-06-22-referral-commission-design.md` (separate parallel module).

## 1. Key finding — doctor is assigned PER BILL

- `invoices.doctor_id` + `doctor_name` hold the bill's doctor. Editable per-bill via
  `updateInvoiceDoctor()` (`finance-actions.ts`).
- `invoice_items` has **no** doctor field → bill-level, not line-level.
- `OPD_REG` (patient) has **no** persistent doctor; only `department`. The header
  "treating doctor" is derived (active admission, else latest), not a stored link.
- Doctors are `User` records (role `doctor`); `invoice.doctor_id` = `User.id`.

So doctor commission = per-bill, on the bill's `doctor_id`, on collected amount.

## 2. Business rules (locked)

| Rule | Decision |
|------|----------|
| Rate model | Per-doctor configurable: `flat_percent`, `per_service`, or `fixed_per_bill`. |
| Earning basis | Bill's `doctor_id`, on **collected** amount (`paid_amount`). |
| IPD consultants | v1 = attending doctor (`invoice.doctor_id`) only; consultant splits deferred. |
| Architecture | Separate parallel module (own tables + pages), mirroring referrals. |
| Doctor list | All `User`s with role `doctor`; those without a config show as "not configured". |
| Payout | Periodic statements: draft → finalize → mark paid. |

## 3. Visibility & permissions

Admin/Finance only (`requireRoleAndTenant(['admin','finance'])`). Not shown on bills,
receipts, or patient portal. All `organizationId`-scoped.

## 4. Data model (4 new tables; no change to User/invoices)

### 4.1 `DoctorCommissionConfig`
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `organizationId` | String | |
| `doctor_id` | String | User.id; `@@unique([organizationId, doctor_id])` |
| `commission_type` | String | `flat_percent \| per_service \| fixed_per_bill` |
| `flat_percent` | Float? | when flat_percent |
| `fixed_amount_per_bill` | Float? | when fixed_per_bill |
| `pan_number` | String? | payout |
| `bank_account` | String? | payout |
| `ifsc` | String? | payout |
| `is_active` | Boolean | default true |
| `created_by` | String? | |
| `created_at` / `updated_at` | DateTime | |

Index `(organizationId)`.

### 4.2 `DoctorServiceRate`
`id`, `organizationId`, `doctor_id`, `service_type` (OPD/IPD/Pharmacy/Lab/Procedure),
`percent`. `@@unique([doctor_id, service_type])`. Used when `per_service`.

### 4.3 `DoctorCommission` — accrual ledger
`id`, `organizationId`, `doctor_id`, `patient_id`, `invoice_id` (`@@unique`), `invoice_type`,
`eligible_base` (Decimal, collected), `rate_applied` (Float), `commission_amount` (Decimal),
`status` (`accrued | included_in_statement | paid | void`), `statement_id?`, `accrued_at`,
`updated_at`. Indexes `(organizationId)`, `(doctor_id, status)`, `(patient_id)`, `(statement_id)`.

### 4.4 `DoctorPayoutStatement`
`id`, `organizationId`, `doctor_id`, `period_start`, `period_end`, `total_commission` (Decimal),
`status` (`draft | finalized | paid`), `paid_at?`, `paid_amount?`, `payment_mode?`,
`payment_reference?`, `notes?`, `created_by?`, timestamps. Index `(organizationId, doctor_id)`.

## 5. Commission engine

`recomputeInvoiceDoctorCommission(db, organizationId, invoiceId)` — same shape as the referral
engine (`app/lib/doctor-commission.ts`):
1. Load invoice → `doctor_id`. Null ⇒ delete accrued row, return.
2. Load `DoctorCommissionConfig` for that doctor. None/inactive ⇒ delete accrued row, return.
3. Rate: `flat_percent` → percent; `per_service` → rate for `invoice.invoice_type` (else 0);
   `fixed_per_bill` → flat amount per bill (credited when collected > 0).
4. base = collected (`paid_amount`); cancelled bill ⇒ 0. `commission = base × rate%`
   (or fixed amount). Upsert ledger row by `invoice_id`; never mutate locked rows
   (`included_in_statement` / `paid`). Zero ⇒ drop accrued row.

**Hook sites** (alongside the referral recompute, best-effort try/catch):
`finance-actions` recordPayment / recordSplitPayment / reversePayment / cancelInvoice /
revertInvoice / processRefund; `pharmacy-actions` invoice generate; `ipd-finance-actions`
settleAndDischarge. Plus `backfillDoctorCommissions(db, orgId)`.

## 6. Pages — `/admin/doctor-invoicing` and `/finance/doctor-invoicing`

Shared components (`app/components/doctor-commission/*`), both portals.

- **List**: all role=`doctor` users + their config summary, # bills, business (collected),
  accrued / paid / outstanding. Add/Edit config modal (3 modes + per-service grid + payout
  details). Unconfigured doctors flagged.
- **Detail (per doctor)**: tabs — **Bills** (invoices assigned to them: #, type, collected,
  commission, status), **Commission ledger**, **Payout statements** (create draft for range →
  finalize → mark paid → print).
- Nav: Admin sidebar (Modules) + Finance sidebar. Guarded `['admin','finance']`.

## 7. Build phases
1. Schema + migration (4 tables).
2. `doctor-commission.ts` engine + wire into existing payment hook sites + backfill.
3. Server actions (`doctor-commission-actions.ts`) + constants.
4. Management list/detail/statement UI + nav links.

## 8. Out of scope (v1)
- IPD consultant commission splits (attending doctor only).
- Per-line-item doctor attribution (schema is bill-level).
- TDS/tax computation on payouts (capture PAN only).
- Doctor self-service portal.
