# HospitalOS — IPD Module & TPA/Corporate Deep-Dive Report

**Prepared:** 2026-06-10
**Scope:** (A) Full IPD module — what's built, what's missing, UX & improvement guide, benchmarked against the KareXpert IP/ER/DC Billing list (features 130-152). (B) How TPA & corporate billing work in production-grade HIMS, the workflow, and our gaps. Read-only analysis; nothing was changed.

---

# PART A — IPD MODULE

## A1. Actual current state (corrected)

Your `IPD_MODULE_BLUEPRINT.md` is an excellent spec, but it predates the current code — it lists 13 pages / 4 action files / 16 models. **Reality today is much further along:**

- **25 IPD pages**, **13 IPD/discharge/admission API routes**, **~6,640 lines** across 12 IPD action files, on top of the shared 176-model schema.
- **Many P0/P1 gaps the blueprint flagged are now BUILT:** medication-admin UI, shift handover, nursing assessment, IPD vitals charting, consent per-admission, deposit alerts (`/api/ipd/deposit-alerts`), daily accrual (`/api/ipd/daily-accrual`), bed-cleaning SLA, GL posting (`postToGL`/`postChargeToGL`), assessment alerts, audit trail.

So the IPD core is **production-functional**, not placeholder. The remaining work is **depth, billing-state precision, and UX** — not foundational build.

**What's solidly working (audited in code):**
admission (atomic: bed + admission + invoice + deposit), bed matrix & transfer, ward rounds (SOAP), diet plans, nursing tasks/notes/assessment, medication administration, shift handover, daily charge accrual with GST tiers, multi-source charge posting with audit (`IpdChargePosting`), interim billing, package apply / break-open / utilization, pre-admission estimates, discharge settlement with split payment + discount approval, discharge & bill PDFs, census, AI discharge summary.

## A2. Feature map vs KareXpert IP/ER/DC Billing (130-152)

Legend: ✅ Have · 🟡 Partial · ❌ Lack

| # | KareXpert feature | Status | Evidence / gap |
|---|---|---|---|
| 130 | Billing Dashboard | 🟡 | `/ipd/billing` + interim bill exist; needs the **running-bill dashboard** UX from your own blueprint §4.7 |
| 131 | In-Patient Status | ✅ | census, admissions-hub, movement pages |
| 132 | View / Update Payer | 🟡 | Payer exists via insurance policies; **switching payer mid-stay isn't first-class** |
| 133 | Assign one or more Packages | ✅ | `applyPackageToAdmission`, `IpdAdmissionPackage` (multi-package) |
| 134 | Package Inclusion / Exclusion | 🟡 | `breakOpenPackage` + utilization exist; **explicit inclusion/exclusion item list config is thin** |
| 135 | IP Advance | ✅ | `deposit-actions.ts` (486 lines), deposit alerts at threshold |
| 136 | Co-Payment | ❌ | **Not implemented** — no payer/patient % split on the IPD bill |
| 137 | Payer Authorisation | 🟡 | `InsurancePreAuth` + `createPreAuthAction`; not gating IPD admission flow |
| 138 | Update Payer | 🟡 | Same as 132 — no clean mid-stay payer-change workflow |
| 139 | Update Billing Category | 🟡 | Billing-category refs in 5 files; **class/category change mid-stay not a clean workflow** |
| 140 | View Pending Services | 🟡 | Charge-posting log exists; **no "ordered-but-not-billed" pending view** |
| 141 | View Pending Equipment Services | ❌ | Equipment/biomedical services not modelled as a distinct billable stream |
| 142 | Interim Bill with History | ✅ | `generateInterimBill`, `/api/ipd/interim-billing` |
| 143 | Patient Documents View / Upload | 🟡 | `/api/upload/patient-record` + consent docs; not a unified IPD document tab |
| 144 | Remarks | ✅ | present across admission/billing |
| 145 | Bed/Ward/Doctor Transfer History | ✅ | `BedTransfer`, `PatientMovement`, movement page |
| 146 | Track Patient Current Status | ✅ | movement + census |
| 147 | Scheme-Based / Direct Discount | 🟡 | `requestDiscount`/`applyApprovedDiscount` + `DiscountScheme`; **scheme automation thin** |
| 148 | Bill-wise / Group-wise / Item-wise Discount | 🟡 | Bill-level discount with approval works; **group/item-level granularity missing** |
| 149 | Bill Ready | ❌ | **No "Bill Ready" status state** in the billing lifecycle |
| 150 | Billing Discharge | 🟡 | Collapsed into `settleAndDischarge`; **not a distinct gated step** |
| 151 | Billing Settlement | ✅ | `settleAndDischarge`, discharge-settlement pages |
| 152 | Addendum Billing | ❌ | **No post-finalization addendum** (add charges after bill closed) |

**Score:** ~8 Have, ~9 Partial, ~4 Lack of the 23 billing features.

## A3. What IPD genuinely lacks (the real gaps)

Grouped by theme, highest impact first.

**Billing lifecycle precision (the cluster that matters most for a multispecialty + insurance hospital):**
1. **Explicit billing states**: `Provisional → Bill Ready → Billing Discharge → Settled → Closed`, with an **Addendum** path for post-discharge charges. Today it jumps to settle-and-discharge, which hides the controls TPAs/auditors expect.
2. **Co-payment & multi-payer split**: one bill split across Insurance + Patient (+ Corporate), with per-payer caps, co-pay %, and room-rent capping. This is mandatory for cashless and is currently absent.
3. **First-class payer management**: change payer / billing category mid-stay (cash→insurance, class upgrade) with automatic re-tariffing and audit.
4. **Item/group-level discounts** and **scheme automation** (not just bill-level).
5. **Pending-services & equipment view**: ordered-but-not-yet-billed items, and biomedical-equipment charges as a stream.

**Clinical & safety depth (multispecialty-grade):**
6. **NEWS/MEWS early-warning scoring** from vitals (you capture vitals; add the score + escalation).
7. **Expected Discharge Date (EDD)** on Day 1 + discharge-planning checklist.
8. **Implant/consumable serial-level tracking** per patient (critical for ortho/cardiac).
9. **Fall-risk / pressure-ulcer / aspiration-risk** scoring.

**Operational robustness:**
10. **Concurrent-edit protection** (optimistic locking) on admissions/bills — multiple desks edit the same patient.
11. **Verify auto-posting wiring** end-to-end (lab/pharmacy/OT/radiology → running bill) per blueprint §4.4; charge-posting infra exists but confirm every source fires.
12. **Daily-accrual cron** actually scheduled (the action exists; ensure a scheduler calls it nightly).

## A4. Making IPD more user-friendly (UX guide)

The single highest-leverage UX upgrade is the **Running Bill Dashboard** your blueprint already designed (§4.7) — one screen per admission showing charges, deposits, insurance utilization, and a live "balance + deposit %" with a ⚠️ at 80/100%. Build that to replace the current billing page.

Beyond that, concrete, role-based wins:

**For the billing/front-desk user:**
- A **single admission "command center"** tab layout: Status · Running Bill · Deposits · Insurance/TPA · Documents · Timeline — no page-hopping.
- **Deposit gauge** always visible (color-coded), with one-click "collect advance."
- **Pending-services tray**: ordered items not yet billed, so nothing leaks revenue.
- **Inline discount request** with the approval chain shown (who must approve, current state).

**For the doctor:**
- Fast ward-round entry (minimal clicks), EDD field, and "order set" buttons per specialty.
- Discharge-summary AI draft (you have it) surfaced at the top of the discharge flow.

**For the nurse:**
- Task-oriented worklist (MAR due, vitals due, assessments due) with NEWS score badges; big touch targets for tablet use.

**Cross-cutting:**
- **Real-time updates** (the bill changes as lab/pharmacy post) via polling/websocket — you already use 30s refresh on beds; extend to the bill.
- **Status chips & timeline** so any user can see "where is this patient" at a glance.
- **Optimistic locking banners** ("Dr. X is editing") to prevent collisions.

## A5. IPD improvement roadmap

- **Phase 1 (billing precision):** billing-state machine (Bill Ready/Discharge/Addendum), co-pay & multi-payer split, payer/category change workflow, running-bill dashboard. *Unblocks insurance + audit.*
- **Phase 2 (clinical depth):** NEWS/MEWS, EDD + discharge planning, implant/consumable tracking, risk scores.
- **Phase 3 (robustness):** concurrent-edit locking, confirm auto-posting pipeline + accrual cron, pending-services/equipment views, tests on the billing math.

---

# PART B — TPA & CORPORATE (how it works in production, and our gaps)

## B1. How cashless TPA billing actually works (production workflow)

This is the standard Indian-hospital cashless lifecycle, confirmed against current practice and 2024-25 regulation:

**1. Identification & verification (at/ before admission)**
Patient presents an insurance/TPA card. Desk verifies policy validity, sum insured, room-rent eligibility, and exclusions. A **pre-authorization form** (patient + policy + diagnosis + estimated cost + LOS) is filled, **submitted within 24h of admission** (planned cases ideally before admission).

**2. Pre-authorization**
Hospital submits to the TPA/insurer (portal or, increasingly, NHCX). Insurer responds: **Approved / Partially Approved / Query Raised / Denied**. Under IRDAI's **Cashless Everywhere (Jan 2024)** the target turnaround is **~1 hour (planned) / 3 hours (emergency)**. A **security deposit (~₹10,000)** is typically collected to cover non-payables.

**3. During stay — enhancement**
As actual charges approach the approved amount, the hospital files an **enhancement request** with updated projection + clinical justification. Tracked separately from the original pre-auth.

**4. Discharge — final claim**
Final bill + discharge summary + investigation reports go to the TPA for **final approval (≈2-4 hours)**. The patient pays only the **non-payables: non-medical items, room-rent capping, co-pay, disallowances**. NHCX now mandates cashless processing **within 3 hours of discharge authorization** (IRDAI deadline 31 July 2025).

**5. Settlement (post-discharge)**
Original documents to TPA **within ~7 days**. TPA pays the hospital (often weeks later, frequently with **deductions/disallowances**). Hospital reconciles: records payment against the claim, books shortfall as disallowance/bad-debt, and **refunds the patient's security deposit** net of their share. Aging is tracked on TPA receivables.

**Key control points a HIMS must enforce:** room-rent capping (proportionate deduction clause), co-pay %, sum-insured tracking, sub-limits, pre-auth-vs-actual variance, disallowance capture, and **TPA AR aging**.

## B2. How corporate (panel) billing works

Different from TPA: a **corporate/PSU empanelment** is a credit arrangement under an MOU.

1. **Empanelment & tariff**: corporate signs an MOU with a negotiated tariff (often a discount % or a custom rate card), credit limit, and eligible employee/dependant list.
2. **Eligibility check at registration**: patient identified as corporate-covered; entitlement (room class, covered services, co-pay) applied.
3. **Credit billing**: services billed to the **corporate ledger**, not collected from the patient (except their co-pay / non-covered items).
4. **Periodic invoicing & settlement**: hospital raises a consolidated **monthly invoice** to the corporate; corporate pays; hospital reconciles against the ledger. **Outstanding & aging** tracked per corporate.

## B3. What we have in code (TPA/corporate)

Stronger than the blueprint implies — there's a real foundation:

- **Models:** `insurance_providers`, `insurance_policies`, `insurance_claims`, `InsurancePreAuth` (with status, enhancement_history, queries, documents, approved_amount), `CorporateMaster`.
- **Insurance actions (746 lines):** provider CRUD, patient-policy CRUD, `submitInsuranceClaim`, `updateClaimStatus`, `getInsuranceClaims`, `disputeClaim`, `autoSubmitClaim`, `getRevenueLeakage`, `getProviderPerformance`, `getInsuranceStats`, `getAllPreAuths`.
- **Corporate/TPA actions (314 lines):** `getCorporateOutstandingFull`, `receiveCorporatePayment`, `getTpaClaimsFullTracker`, `submitTpaClaimAction`, `updateTpaClaimAction`, `getAllPreAuthorizations`, `createPreAuthAction`, `updatePreAuthAction`.
- **UI:** `/reception/finance/tpa-insurance`, `/reception/finance/corporates`, `/insurance`.
- Your blueprint §4.3 already specifies the full intended pre-auth → enhancement → claim → settlement flow and the GL journal entries (TPA AR, disallowance expense, etc.).

## B4. What we lack (TPA/corporate gaps)

**Workflow completeness:**
1. **Pre-auth not wired into the IPD admission flow** — should be initiated at admission, gate cashless status, and show approved/remaining on the running bill.
2. **Enhancement automation** — auto-prompt when charges approach the approved cap; today enhancement_history exists as a field but no triggered workflow.
3. **Co-pay / room-rent capping / sub-limit engine** — the bill must auto-split payer vs patient and apply proportionate deductions. This is the **biggest functional gap** and overlaps with IPD A3 #2.
4. **Disallowance / shortfall handling at settlement** — capture deductions, post to disallowance expense, bill/refund the patient balance, reconcile deposit.
5. **TPA AR aging + dunning** — you have `DunningRule`/`DunningLog` for patients; extend to TPA & corporate receivables with aging buckets.
6. **Corporate tariff/rate-card engine** — per-corporate negotiated rates auto-applied at billing; monthly consolidated invoicing run.

**Documents & compliance:**
7. **Claim document pack assembly** — auto-bundle final bill + discharge summary + reports + investigations into the claim submission.
8. **Audit trail on every payer decision** (who approved/disallowed, when) for NABH/insurer audits.

**Interoperability (the strategic gap):**
9. **NHCX / digital exchange integration.** Production-grade Indian HIMS are moving from TPA-portal uploads to the **National Health Claims Exchange** — a single, consent-based, FHIR-based digital channel for coverage check → pre-auth → claim → settlement, with a regulatory 3-hour discharge mandate. We currently have no NHCX adapter. Building toward an **FHIR claims façade** now positions HospitalOS for this; it's also a strong sales differentiator.
10. **ABDM/ABHA linkage** (partial via Zealthix today) complements NHCX for record portability.

## B5. TPA/corporate recommendations (priority order)

1. **Build the payer-split / co-pay / room-cap engine** (shared with IPD billing) — without it, true cashless billing isn't possible.
2. **Wire pre-auth into IPD admission** + surface approved/remaining on the running-bill dashboard; add the **enhancement auto-prompt**.
3. **Complete the settlement loop**: disallowance capture → patient balance/refund → deposit reconciliation → **TPA & corporate AR aging + dunning**.
4. **Corporate rate-card + monthly consolidated invoicing**.
5. **Claim document-pack auto-assembly** + full audit trail on payer decisions.
6. **Plan the NHCX/FHIR adapter** as a forward-looking integration (Phase 2) — align the claims data model to FHIR now.

---

## Caveats

- Module status is inferred from code structure + your own docs, not from exercising every screen at runtime; "Have" means implemented, not certified bug-free (see `SMOKE_TEST_FINDINGS.md`, `HIMS_PENDING_OBSERVATIONS.md`).
- Regulatory timelines (NHCX 3-hour mandate, IRDAI deadlines) evolve; verify current dates against IRDAI/NHA before committing them to a roadmap or contract.
- I could not access the live DB/insurer portals, so claim-data accuracy and integration behavior are out of scope here.

---

## Sources

**Internal:** `IPD_MODULE_BLUEPRINT.md` (§1, §4.3, §4.4, §4.7), `prisma/schema.prisma`, `app/actions/ipd-finance-actions.ts`, `app/actions/insurance-actions.ts`, `app/actions/insurance-corporate-actions.ts`, `app/actions/deposit-actions.ts`, `KareXpert_Product_Features.md`.

**External (web research):**
- [National Health Claims Exchange — Nathealth](https://nathealthindia.org/wp-content/uploads/2025/06/National-Health-Claims-Exchange_Latest.pdf)
- [NHCX overview — Bajaj Finserv](https://www.bajajfinserv.in/insurance/national-health-claims-exchange)
- [Cashless hospitalization: how it works — PB Partners](https://www.pbpartners.com/articles/health-insurance/cashless-hospitalization-how-it-works)
- [Mediclaim, Insurance & TPA Cashless — Bombay Hospital](https://bombayhospital.com/mediclaim.php)
- [IRDAI 100% cashless by July 2024 — Business Today](https://www.businesstoday.in/magazine/money-today/story/irdai-is-targeting-100-cashless-hospital-treatment-by-july-2024-but-is-it-viable-438921-2024-07-26)
- [Cashless Everywhere scheme — Ditto](https://joinditto.in/articles/health-insurance/health-insurance-cashless-everywhere-scheme-in-india/)
