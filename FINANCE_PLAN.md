# Finance & Billing Production Plan — Hospital OS

## Context

The finance system has a solid foundation (invoices, payments, deposits, expenses, GST fields, charge catalog, bank recon, dunning) but has critical gaps that block production use: no split payments, no discharge settlement workflow, missing master data admin pages, and incomplete billing print/PDF. This plan makes the entire finance module production-ready across ALL hospital modules (IPD, OPD, Lab, Pharmacy).

---

## Part A: Split Payment System

### Problem
`recordPayment()` accepts one `payment_method` per call. Hospitals need cash+card+UPI in one transaction, especially at discharge.

### Solution

**Schema Change** — Add `transaction_group_id` to `payments` model:
```
transaction_group_id  String?   // groups multiple payments into one transaction
```

**New Action: `recordSplitPayment()`** in `app/actions/finance-actions.ts`:
```typescript
recordSplitPayment(data: {
  invoice_id: number;
  splits: Array<{
    amount: number;
    payment_method: string; // Cash, Card, UPI, BankTransfer, Deposit
    reference?: string;     // card approval code, UPI txn ID, etc.
  }>;
  notes?: string;
})
```
- Validates: sum of splits == intended payment amount
- Creates one `payments` row per split, all sharing same `transaction_group_id`
- Recalculates invoice balance once after all splits
- Returns grouped receipt

**UI: Split Payment Modal** — Replace single payment modal in `app/ipd/billing/page.tsx` and `app/finance/payments/page.tsx`:
- Dynamic rows: [Amount] [Method] [Reference] [+ Add Row]
- Running total vs balance due (green when matched)
- Single "Confirm & Print Receipt" button

### Files
- MODIFY: `prisma/schema.prisma` (add field to payments)
- MODIFY: `app/actions/finance-actions.ts` (new `recordSplitPayment`)
- MODIFY: `app/ipd/billing/page.tsx` (split payment UI)
- MODIFY: `app/finance/payments/page.tsx` (split payment UI)

---

## Part B: Discharge Settlement Screen

### Problem
No unified screen for: review final bill → apply deposits → apply insurance → collect balance → print bill → discharge.

### Solution

**New Page: `app/ipd/discharge-settlement/[admissionId]/page.tsx`**

Layout (single full-width page):
```
┌─────────────────────────────────────────────────────────────┐
│ PATIENT HEADER: Name, UHID, Admission ID, Doctor, Ward/Bed  │
│ Admitted: DD/MM/YYYY  |  Days: X  |  Diagnosis: ...         │
├─────────────────────────────────────────────────────────────┤
│ CHARGE SUMMARY (grouped by category with subtotals)         │
│   Room & Bed (6d × ₹1,200)              ₹7,200             │
│   Nursing                                ₹3,600             │
│   Doctor Visits (8 × ₹500)              ₹4,000             │
│   Lab & Radiology                        ₹2,800             │
│   Pharmacy                               ₹5,400             │
│   ─────────────────────────────────────────────             │
│   Sub-Total                             ₹23,000             │
│   GST (5% on room >₹5000)               ₹360               │
│   Discount                              -₹0                 │
│   ─────────────────────────────────────────────             │
│   NET BILL                              ₹23,360             │
├─────────────────────────────────────────────────────────────┤
│ ADJUSTMENTS                                                  │
│   Deposits Held:    ₹10,000    [Apply ₹10,000]              │
│   Insurance Approved: ₹8,000   [Apply ₹8,000]               │
│   Prior Payments:    ₹0                                      │
│   ─────────────────────────────────────────────             │
│   BALANCE DUE:       ₹5,360                                 │
├─────────────────────────────────────────────────────────────┤
│ FINAL PAYMENT (Split Payment Component)                      │
│   Cash:  [₹3,000]   Card: [₹2,360] Ref: [____]            │
│   Total: ₹5,360  ✓ Balanced                                 │
├─────────────────────────────────────────────────────────────┤
│ [Apply Discount]  [Finalize & Discharge]  [Print Final Bill] │
└─────────────────────────────────────────────────────────────┘
```

**New Action: `settleAndDischarge()`** in `app/actions/ipd-finance-actions.ts`:
1. Accrue any remaining daily charges
2. Apply deposits (auto-apply all active deposits)
3. Apply insurance pre-auth amount (if available)
4. Record split payment for remaining balance
5. Finalize invoice (status → Final/Paid)
6. Discharge patient (status → Discharged, bed → Cleaning)
7. Generate discharge summary
8. Send WhatsApp notification
9. Return settlement data for printing

**Discount Entry with Approval**:
- Inline discount entry on settlement screen
- If discount > configured threshold (e.g., 5%), require approver selection
- Store `approved_by` on invoice

### Files
- CREATE: `app/ipd/discharge-settlement/[admissionId]/page.tsx`
- MODIFY: `app/actions/ipd-finance-actions.ts` (add `settleAndDischarge`)
- MODIFY: `app/actions/finance-actions.ts` (add discount approval logic)
- Reuse: `generateInterimBill()` for bill data, `applyDepositToInvoice()` for deposits

---

## Part C: GST-Compliant Bill Print/PDF

### Problem
Current invoice PDF at `app/api/invoice/[id]/pdf/route.ts` has hardcoded hospital name, no GSTIN, no SAC codes in print, no proper IPD final bill format.

### Solution

**Modify: `app/api/invoice/[id]/pdf/route.ts`**:
- Pull hospital name, address, GSTIN, PAN from `Organization` + `OrganizationBranding`
- Add patient details: UHID, admission ID, doctor, ward/bed, dates
- Items grouped by service_category with subtotals
- Per-item: Description | SAC/HSN | Qty | Rate | Discount | Taxable | GST% | GST Amt | Total
- GST summary table: Taxable Value | CGST | SGST | Total Tax — per rate slab
- Payment summary: deposits applied, payments made, balance
- Grand total in words (use number-to-words library)
- Footer: Terms, authorized signatory

**New: Discharge Bill PDF route** — `app/api/discharge/[admissionId]/bill/route.ts`:
- Uses `generateInterimBill()` data
- Adds discharge-specific fields (discharge date, LOS, final diagnosis)
- Adds "FINAL BILL" watermark vs "INTERIM"

### Files
- MODIFY: `app/api/invoice/[id]/pdf/route.ts` (dynamic org data, GST format)
- CREATE: `app/api/discharge/[admissionId]/bill/route.ts` (final bill PDF)
- Reuse: `getGstSummary()` from `ipd-finance-actions.ts`

---

## Part D: Master Data Admin Pages

### Problem
Models and CRUD actions exist for most master data, but specialized admin UIs are missing. Users configure pricing through generic interfaces or directly in DB.

### Solution — Create a unified **Finance Master Data Hub** at `/app/admin/finance-master/page.tsx`

**Tabbed layout with 8 tabs:**

### Tab 1: Service Catalog (Charge Catalog)
- CRUD for `charge_catalog` with: code, name, category, department, rate, HSN/SAC, GST%, active
- Categories: Room, Nursing, Consultation, Procedure, Consumable, Lab, Pharmacy, Diet, Misc
- Reuse: `getChargeCatalog()`, `addCatalogItem()`, `updateCatalogItem()` from `finance-actions.ts`

### Tab 2: IPD Services & Tariffs
- Already exists at `/app/admin/ipd-finance/page.tsx` — LINK here or embed
- Service master + multi-tariff rates (General, CGHS, ECHS, Insurance, Corporate)
- Reuse: `getIpdServices()`, `addIpdService()`, `getTariffRates()`, `addTariffRate()` from `ipd-master-actions.ts`

### Tab 3: IPD Packages
- Already exists in admin/ipd-finance — LINK or embed
- Package CRUD with inclusions/exclusions
- Reuse: `getIpdPackages()`, `addIpdPackage()`, `updateIpdPackage()` from `ipd-master-actions.ts`

### Tab 4: Lab Test Pricing
- Table: Test Name | Category | Sample Type | Price | HSN/SAC | GST% | Active
- Reuse: data from `lab_test_inventory` model
- New action: `updateLabTestPrice(id, price, hsn_sac_code, tax_rate)` in new `app/actions/master-data-actions.ts`

### Tab 5: Pharmacy Pricing
- Table: Brand Name | Generic | Category | Unit Price | HSN/SAC | GST% | Min Stock
- Reuse: data from `pharmacy_medicine_master` model
- New action: `updateMedicinePrice(id, price, hsn_sac_code, tax_rate)` in `master-data-actions.ts`

### Tab 6: Doctor Consultation Fees
- Table: Doctor Name | Specialty | Department | First Visit Fee | Follow-up Fee | HSN/SAC
- Reuse: `User` model (role=doctor) with `consultation_fee`
- New action: `updateDoctorFee(userId, firstVisitFee, followUpFee)` in `master-data-actions.ts`
- Add `follow_up_fee` field to User model

### Tab 7: Ward & Room Charges
- Table: Ward Name | Type | Room Rate/Day | Nursing Rate/Day | Floor | Active
- Reuse: `wards` model with `cost_per_day`, `nursing_charge`
- New action: `updateWardPricing(wardId, costPerDay, nursingCharge)` in `master-data-actions.ts`

### Tab 8: Tax/GST Configuration
- Table: Tax Name | Code | Rate% | Default | Applicable To | Active
- Add/Edit form
- Reuse: `getTaxConfigs()`, `addTaxConfig()`, `updateTaxConfig()` from `tax-actions.ts`

### Schema Changes for Master Data
```prisma
# Add to User model:
follow_up_fee    Float    @default(300)

# Add to lab_test_inventory:
hsn_sac_code     String?
tax_rate         Float?   @default(0)

# Add to pharmacy_medicine_master:
hsn_sac_code     String?
tax_rate         Float?   @default(0)
```

### Files
- CREATE: `app/admin/finance-master/page.tsx` (unified 8-tab master data hub)
- CREATE: `app/actions/master-data-actions.ts` (lab pricing, pharmacy pricing, doctor fees, ward pricing updates)
- MODIFY: `prisma/schema.prisma` (add follow_up_fee, hsn_sac_code, tax_rate to lab/pharmacy)

---

## Part E: Expense & Income Management

### Problem
Expense CRUD actions exist but no dedicated UI page. No P&L integration. No budget tracking. Income categorization is implicit via invoice_items.department.

### Solution

**New Page: `app/finance/expense-manager/page.tsx`**:
- Top KPI cards: Total Expenses (MTD), Pending Approvals, Today's Expenses
- Category-wise breakdown chart
- Expense table with filters (status, category, vendor, date range)
- Add Expense form (inline or modal)
- Approval workflow buttons (Approve/Reject for pending)
- Reuse ALL existing actions from `app/actions/expense-actions.ts`

**New Page: `app/finance/income-expense/page.tsx`** (P&L Dashboard):
- Revenue section: income from invoices grouped by department + type (OPD/IPD/Lab/Pharmacy)
- Expense section: expenses grouped by category
- Net income calculation
- Monthly/quarterly/yearly view
- Chart: Revenue vs Expenses trend
- Reuse: `getFinanceDashboardStats()`, `getExpenseDashboardStats()`, `getRevenueByDepartment()`

**Enhance Cash Closure**:
- Show expense total alongside collections
- Net cash position = collections - expenses (cash only)

### Files
- CREATE: `app/finance/expense-manager/page.tsx`
- CREATE: `app/finance/income-expense/page.tsx`
- MODIFY: `app/finance/cash-closure/page.tsx` (add expense total)
- Reuse: ALL existing expense-actions.ts, finance-actions.ts report functions

---

## Part F: Pharmacy-to-IPD Billing Integration

### Problem
Pharmacy generates standalone invoices. For IPD patients, pharmacy charges should post to the IPD bill.

### Solution

**Modify `dispenseMedicine()` in `app/actions/pharmacy-actions.ts`**:
- Check if order has `admission_id` and `is_ipd_linked = true`
- If yes: call `postChargeToIpdBill()` per medicine item (with HSN code + GST)
- If yes: do NOT create separate pharmacy invoice
- If no (OPD): continue with current standalone invoice flow

**Modify pharmacy UI** to show IPD-linked orders differently:
- Tag: "Charges posted to IPD Bill" instead of "Generate Invoice"

### Files
- MODIFY: `app/actions/pharmacy-actions.ts` (add IPD charge posting in dispenseMedicine)
- MODIFY: `app/pharmacy/billing/page.tsx` (UI differentiation for IPD orders)
- Reuse: `postChargeToIpdBill()` from `ipd-finance-actions.ts`

---

## Part G: Lab-to-IPD Billing Integration

### Problem
Lab orders for IPD patients are not auto-posted to IPD bill.

### Solution

**Modify lab result verification** in `app/actions/lab-actions.ts`:
- When a lab result is uploaded/verified, check if the patient has an active admission
- If yes: call `postChargeToIpdBill()` with lab test price, HSN code `998931`, GST rate from `lab_test_inventory.tax_rate`
- Lookup price from `lab_test_inventory`

### Files
- MODIFY: `app/actions/lab-actions.ts` (add IPD charge posting on result verification)
- Reuse: `postChargeToIpdBill()` from `ipd-finance-actions.ts`

---

## Implementation Order

```
Step 1: Schema changes (Part D schema + Part A schema)     → prisma migrate
Step 2: Master Data Hub (Part D)                            → admin can configure pricing
Step 3: Split Payment (Part A)                              → foundation for settlement
Step 4: Pharmacy-IPD Integration (Part F)                   → charges auto-post
Step 5: Lab-IPD Integration (Part G)                        → charges auto-post
Step 6: Discharge Settlement (Part B)                       → unified discharge billing
Step 7: Bill Print/PDF (Part C)                             → GST-compliant printing
Step 8: Expense & Income Management (Part E)                → complete P&L visibility
```

Steps 4-5 can run in parallel. Steps 6-8 can run in parallel after Step 3.

---

## Verification

1. **Master Data**: Create a service, set tariff rates, add lab test price with GST → verify data persists
2. **Split Payment**: Pay ₹5000 (₹3000 cash + ₹2000 UPI) → verify both payment records created, invoice balance updated, single receipt
3. **Pharmacy-IPD**: Dispense medicine for IPD patient → verify charge auto-posts to IPD bill with GST
4. **Lab-IPD**: Complete lab test for IPD patient → verify charge auto-posts to IPD bill
5. **Discharge Settlement**: Full flow — review charges, apply deposit, apply discount, split payment, finalize, print → verify bill PDF, patient discharged, bed freed
6. **Bill PDF**: Open generated PDF → verify hospital GSTIN, SAC codes per item, CGST/SGST split, total in words
7. **Expense**: Create expense → approve → mark paid → verify in P&L dashboard
8. **Cash Closure**: Perform closure → verify collections + expenses + net position
