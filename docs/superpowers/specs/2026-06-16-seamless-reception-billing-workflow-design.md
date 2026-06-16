# Seamless Reception → Patient Profile → Billing Workflow

**Date:** 2026-06-16
**Author:** Product / Eng (Parikshit + Claude)
**Status:** Draft for review

---

## 1. Problem

Current reception flow forces page hopping for what should be one continuous task:

1. `/reception/register` — fill form, submit
2. Success screen shows UHID + setup link (no action shortcuts)
3. Staff must search again or navigate to `/reception/patient/[id]`
4. Profile Billing tab is **read-only** — to create a bill, staff leave the profile
5. Options to create: `/opd/billing` (Master Dashboard) OR `/billing/new`
6. Service master picker buried inside those pages, not reusable
7. After payment, staff navigate back to profile (or don't, and lose context)

This produces 4–5 navigations for a single walk-in patient encounter. Three billing entry points exist (`/opd/billing`, `/billing/new`, `BillingMasterDashboard`); staff drift between them and miss each other's drafts.

## 2. Vision

**One context per patient.** From the moment a UHID exists, every reception action — billing, appointment, queue, document upload — happens inside `/reception/patient/[id]`. Master Billing keeps the ability to create bills (for finance/cross-patient use), but the **primary path** is the patient profile.

## 3. Target user flow

```
Register → auto-redirect → Patient Profile (?welcome=1&tab=billing)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
 [Print UHID Slip]      [+ Create Bill]              [Book / Queue]
                                  │
                  Bill Builder (inline, top of Billing tab)
                                  │
                          ┌───────┴───────────┐
                          │ Doctor pre-filled │  ← getSuggestedOpdDoctor
                          │ Service picker    │  ← typeahead + recents
                          │ Line items + disc │
                          │ Patient type gate │  ← Cash / Corporate / TPA
                          │ Payment splits    │  ← existing PAN compliance
                          └───────┬───────────┘
                                  │
                          processPatientPayment
                                  │
                       Auto-print receipt + panel collapses
                                  │
                       New row appears in "Recent Bills" below
```

Zero navigation between register and paid receipt.

## 4. Architecture changes — 5 phases (ship as one PR)

### Phase 1 — Post-registration redirect into profile

**Change:**
- `registerPatient` already returns `patient_id`. After success, redirect: `router.push('/reception/patient/' + id + '?welcome=1&tab=billing')`
- Current success screen content (UHID, setup link) becomes a dismissable welcome banner on the profile
- Welcome banner CTAs: **Create Bill · Book Appointment · Add to Queue · Print UHID Slip**

**Files:** `app/reception/register/page.tsx`, `app/reception/patient/[id]/page.tsx`

### Phase 2 — Embed bill builder in profile Billing tab

**Change:**
- Profile Billing tab gets a `+ New Bill` button at top
- Click → inline expandable panel (no overlay, page stays put)
- Panel mounts `<InlineBillBuilder>` component
- On save: panel collapses + success toast + Recent Bills list refreshes

**New component:** `app/components/billing/InlineBillBuilder.tsx`
```ts
type Props = {
  patient: PatientDetail;
  onCreated?: (invoiceId: number) => void;
  onCancel?: () => void;
  defaultDoctorId?: string;     // from welcome banner / appointment context
}
```

Internal flow:
1. Doctor row (pre-filled from `getSuggestedOpdDoctor`, editable)
2. Service picker (Phase 3 component)
3. Line items grid with qty + line discount
4. Bill-level % discount (5%+ requires approver name)
5. Patient-type branch (Phase 4)
6. Payment splits with PAN compliance UI (reused from existing code)
7. Submit → `createInvoice` → loop `addInvoiceItem` → `processPatientPayment`

Code-split: `dynamic(() => import('@/app/components/billing/InlineBillBuilder'), { ssr: false })` so the profile bundle stays small.

**Files modified:** `app/reception/patient/[id]/page.tsx` (Billing tab section)

### Phase 3 — Reusable Service Picker

**New component:** `app/components/billing/ServicePicker.tsx`
- 300 ms debounced typeahead over service master
- Groups results: Consultation · Procedures · Investigations · Pharmacy · Misc
- Recently-used services pinned at top (per user, last 5 — stored in `userPreferences` or localStorage)
- One-click "Add" → appends to line items
- "+ Misc Charge" escape hatch for one-off lines

**New server action:** `searchServiceCatalog(query, limit)` in `app/actions/finance-actions.ts`
- Cached via `unstable_cache` tagged by `services:org-${orgId}`
- Invalidated when service master mutated

Master Billing dashboard's existing service picker also switches to this component → single source of truth.

### Phase 4 — Patient-type branches inside the builder

Today TPA/Corporate logic is scattered. Consolidate inside the builder:

| Patient type | Builder behavior |
|---|---|
| **Cash** | Standard bill, payment splits, PAN compliance |
| **Corporate** | Flag invoice `corporate_id`, auto-apply discount %, no immediate payment (posts to `current_balance`), no PAN UI |
| **TPA** | Block builder. Surface "Pre-Auth required — Create Pre-Auth Request" CTA linking to TPA workflow. If pre-auth already approved, allow bill but flag as `tpa_authorized: true` |

Patient type detected from `patient.patient_type` / `insurance_policy` lookup.

### Phase 5 — Master Billing rename + entry consolidation

**Decision (user choice):** Master Billing **keeps create capability**.

Changes:
- `/opd/billing` page header rename: "Today's Billing" (clearer scope)
- Add filter chips: Status · Doctor · Payment Method · Date Range
- "Create Bill" button on Master Dashboard: opens a patient search modal first → on select, redirects to that patient's profile with `?tab=billing&action=new` (auto-opens the inline builder)
- `/billing/new` stays for now but adds a soft banner: "Tip: you can also create bills directly from the patient profile"

This preserves the dual entry user requested while nudging staff toward the profile path.

## 5. Cross-cutting / quality

**Deep links:**
Profile supports `?welcome=1&tab=X&action=Y`.
- `?tab=billing&action=new` — auto-opens inline builder
- `?tab=billing&invoice=123` — scrolls/highlights an invoice

**Audit:**
Existing `CREATE_INVOICE` audit retained. Add `details.source: 'profile' | 'master' | 'billing_new'` so we can measure adoption.

**Concurrency:**
Two staff opening same profile could create duplicate bills. Existing 5-min draft guard catches most. Add a soft warning banner inside the builder: "A draft was created for this patient 2 min ago. Continue?" → action: open existing draft or proceed.

**Performance:**
- Code-split builder (only loads when tab=billing)
- Code-split each profile tab (Appointments / Triage / Vitals / Billing / External Records)
- Cache service catalog with `unstable_cache`
- Recent Bills capped at 10 with "View all" link to `/opd/billing?patient_id=X`

**Concurrency-safe doctor pre-fill:**
- If patient has today's appointment → use that doctor
- If walked in cold → `getSuggestedOpdDoctor` from recent history
- If neither → builder requires explicit pick before service picker activates

**Receipt auto-print:**
User preference toggle: "Auto-print receipt on payment success" (default ON). Uses existing `fetchBillBranding` template. Opens print preview in new tab after successful payment.

**Backward compat:**
- `/billing/new` remains functional, no redirects
- All deep links from emails / WhatsApp / external systems unaffected
- Existing keyboard shortcuts preserved

**Mobile / tablet:**
- Inline panel (no modal) works on tablets where overlays clip
- Doctor + service rows stack vertically below 768 px
- Payment splits use vertical card layout on small screens

## 6. Data model

**No schema changes.** All needed fields already exist:
- `invoices.corporate_id`, `invoices.tpa_authorized`
- `invoice_items.*` all needed columns
- `payments.payer_pan_number`, `payments.payer_pan_name`
- `appointments.doctor_id` (for pre-fill)

Optional addition (Phase 3 recents): `userPreferences.recent_service_ids: number[]` — defer; can use localStorage in v1.

## 7. Files touched (estimate)

| File | Type | Estimate |
|---|---|---|
| `app/reception/register/page.tsx` | edit | ~30 LOC |
| `app/reception/patient/[id]/page.tsx` | edit | ~150 LOC (welcome banner, tab wiring, builder mount) |
| `app/components/billing/InlineBillBuilder.tsx` | **new** | ~450 LOC |
| `app/components/billing/ServicePicker.tsx` | **new** | ~180 LOC |
| `app/actions/finance-actions.ts` | edit | +`searchServiceCatalog` ~60 LOC |
| `app/opd/billing/page.tsx` | edit | header rename, search modal CTA ~80 LOC |
| `app/billing/new/page.tsx` | edit | tip banner ~10 LOC |
| `app/reception/dashboard/page.tsx` | optional | "Recent bills" widget ~60 LOC |

Total: **~8 files modified + 2 new**, net ~1000 LOC.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Profile page bundle bloat | Code-split builder + each tab; lazy data fetch per tab |
| Double bill creation across tabs | Existing 5-min draft guard + soft warning banner |
| TPA misuse (Cash bill on TPA patient) | Hard gate in builder; can't submit |
| Doctor missing for OPD bill | Forced select before service picker enables |
| Master Billing users confused by demoted prominence | Master keeps create capability per user decision; only rename + filter chips |
| Audit trail discontinuity | Source tagging in details JSON |
| Staff muscle memory | Keep `/billing/new` working; add tip banner not redirect |

## 9. Out of scope (explicitly deferred)

- Pharmacy / Lab billing integration (their own workflows; show as line items in profile timeline only)
- IPD billing flows (separate plan; admission detail already has its own bill view)
- Insurance pre-auth UI rework (only the gating signal in the builder)
- Recent-services personalization in DB (localStorage v1)
- Cmd+K command palette (nice-to-have)

## 10. Acceptance criteria

- After `registerPatient` succeeds, staff lands on `/reception/patient/[id]?welcome=1&tab=billing` within 1 second
- Welcome banner shows 4 CTAs; can be dismissed
- From profile Billing tab, `+ New Bill` opens inline builder without leaving the page
- Builder can create a complete OPD bill (services, discount, payment) for a Cash patient in one screen
- Corporate patient: builder skips payment, posts to corporate balance
- TPA patient with no pre-auth: builder blocked, shows pre-auth CTA
- Receipt auto-prints on payment success (when pref ON)
- Master Billing `+ Create Bill` opens patient search → redirects to profile builder
- All existing audit logs continue to fire; new `source` tag present

## 11. Decisions (locked)

1. **Welcome banner** — auto-hides after the first action is taken (Create Bill / Book Appt / Add to Queue / Print Slip). No manual dismiss needed. Reappears on a fresh `?welcome=1` deep link.
2. **First-time experience** — banner only, no tour overlay in v1. Tour overlay can be added later if onboarding feedback warrants it.
3. **Service Picker rewrite** — **shipped in v1**. Phase 3 lands together with Phases 1, 2, 4, 5 as part of the same PR. Master Billing and the new InlineBillBuilder both consume the same `<ServicePicker>` component from day one.
4. **TPA gate** — **hard-block** at the builder. TPA patients without an approved pre-auth cannot have a Cash bill generated. Override path is the existing pre-auth workflow (admin approves pre-auth → builder unblocks). This avoids accidental cash collection from TPA patients and keeps a single source of truth for TPA settlement.

---

*Next step: writing-plans skill produces an implementation plan from this spec.*
