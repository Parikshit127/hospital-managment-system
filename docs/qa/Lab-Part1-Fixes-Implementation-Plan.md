# Implementation Plan — Lab Module (Part 1 Fixes)

> **Goal:** fix the 10 "not working / incomplete" items from [`Lab-Module-Review-and-Feature-Recommendations.md`](./Lab-Module-Review-and-Feature-Recommendations.md) (Part 1).
> **Verified against code** — every file/function/line below was read, not assumed.
> **Constraints:** work is done **directly on `main`** (per your instruction). All changes are made and left **uncommitted** for your review — **nothing is committed or pushed until you explicitly approve.**

---

## Working approach
- Implement **all** the changes below on `main`, in one continuous pass.
- **Do not commit or push anything** — leave everything staged in the working tree so you can review the full diff first. After your review you'll decide whether to commit + push.
- ⚠️ Reminder: `main` currently has 6 unpushed local commits and is behind `origin/main` (48). Working here means the diff will sit on top of that state — keep that in mind when reviewing/committing later.

**Key files touched by this plan**
- `app/lab/technician/page.tsx` — Lab Orders screen (#1, #2, #10)
- `app/lab/reports/page.tsx` — Reports (#3)
- `app/lab/tests/page.tsx` — Test Catalog modal (#8)
- `app/lab/sample/[barcode]/page.tsx` — Process Sample (#5, #7)
- `app/actions/lab-actions.ts` — server actions (#2, #4, #7, #8)
- `app/lab/dashboard/page.tsx`, `app/admin/lab/page.tsx` — TAT display (#4)
- `app/components/layout/Sidebar.tsx` — lab nav (#10)
- `prisma/schema.prisma` — only if #4 uses a new column (needs migration)

---

## Phase 1 — Quick fixes (low risk, **no schema change**)

Ship these first; they're self-contained UI/logic fixes.

### Fix #1 — `/lab/technician` search box does nothing
- **File:** `app/lab/technician/page.tsx` (input ~line 166).
- **Now:** `<input placeholder="Search orders..." />` with no `value` / `onChange`.
- **Change:** add a `search` state; bind `value`+`onChange`; filter the loaded orders list by barcode / patient name / test type before rendering (mirror the working filter already in `app/lab/worklist/page.tsx`).
- **Effort:** 🟢 Low · **Risk:** none.
- **Test:** type a barcode/name → list narrows live.

### Fix #2 — `/lab/technician` "Urgent Requests" KPI is fake
- **Files:** `app/lab/technician/page.tsx` (card ~line 134–145, hard-coded `0`) + `app/actions/lab-actions.ts` → `getLabStats()` (line 85).
- **Now:** `getLabStats` returns only `pendingCount`, `completedToday`; the card prints a literal `0` and is greyed (`opacity-60`).
- **Change:** add `criticalCount` to `getLabStats` (`db.lab_orders.count({ where: { is_critical: true, status: { not: 'Completed' } } })` — same query already used in `getLabDashboardStats` line 244); bind the card to it and remove the `opacity-60`. (Rename to "Urgent / Critical" for clarity.)
- **Effort:** 🟢 Low · **Risk:** none.
- **Test:** flag an order critical → count increments.

### Fix #3 — Reports page has no export / print
- **File:** `app/lab/reports/page.tsx` (data already loaded as `report.testCounts` + `report.dailyStats`).
- **Change:** add two header buttons — **Export CSV** (client-side: build a CSV blob from `testCounts`/`dailyStats` and download) and **Print** (`window.print()` with a print-friendly CSS block). No backend change needed.
- **Effort:** 🟢 Low · **Risk:** none.
- **Test:** click Export → CSV downloads with the table data; Print → clean printout.

### Fix #7 — "Flag Critical" doesn't alert anyone
- **File:** `app/actions/lab-actions.ts` → `flagCriticalResult()` (line 312) vs the notification block already in `uploadResult()` (lines 149–191).
- **Now:** `flagCriticalResult` only sets `is_critical` + writes an audit row — no doctor/patient alert.
- **Change:** extract the "notify ordering doctor" block from `uploadResult` (lines 150–191) into a shared helper `notifyCriticalResult(db, order)` and call it from **both** `uploadResult` and `flagCriticalResult`. (Load the order's `doctor_id`/`patient_id` inside `flagCriticalResult` first.)
- **Effort:** 🟢 Low–Med · **Risk:** low (reuses proven code).
- **Test:** flag critical → doctor gets in-app + WhatsApp alert immediately (not only on completion).

### Fix #8 — Catalog form hides fields
- **Files:** `app/lab/tests/page.tsx` (Add/Edit modal) — actions `addTestTocatalog` (lab-actions line 469) / `updateTestInCatalog` (line 515) **already accept** `test_code`, `turnaround_time`, `critical_value_low`, `critical_value_high`, `hsn_sac_code`.
- **Change:** add these inputs to the modal form and pass them through on submit. No server change (the args already exist) — confirm the exact param names when implementing.
- **Effort:** 🟢 Low–Med · **Risk:** low.
- **Test:** add a test with a code + turnaround + critical values + HSN → values persist and show on edit.

### Fix #10 — Two overlapping worklists (`/lab/worklist` vs `/lab/technician`)
- **Files:** `app/lab/technician/page.tsx`, `app/components/layout/Sidebar.tsx` (lab nav).
- **Decision needed (product):** `/lab/worklist` + `/lab/sample/[barcode]` already cover the full processing flow. Recommend making **`/lab/worklist` canonical** and either (a) remove the "Lab Orders" (`/lab/technician`) sidebar entry and redirect that route to `/lab/worklist`, or (b) keep it only if its upload-modal is still wanted. Once #1/#2 fix that page, (a) is cleaner.
- **Effort:** 🟢 Low · **Risk:** low (but confirm no unique flow is lost).
- **Test:** sidebar has one worklist; old URL redirects.

> **Phase 1 exit:** all six fixes verified locally; `npm run build` / typecheck clean. **Left uncommitted for your review.**

---

## Phase 2 — Accurate TAT (needs a small schema change)

### Fix #4 — TAT is misleading
- **File:** `app/actions/lab-actions.ts` → `getLabDashboardStats()` (avgTAT calc, lines 254–259) uses `Date.now() − created_at` because **there is no completion timestamp on `lab_orders`**.
- **Note:** `updateSampleStatus` (line 285) *does* stamp `labSampleTracking.completed_at`, **but** `uploadResult` (the "Verify & Completion" path, line 119) sets the order to `Completed` **without** stamping any completion time — so neither source is reliable today.
- **Recommended change:** add a nullable **`completed_at DateTime?`** column to `lab_orders` (Prisma migration), set it wherever status → `Completed` (`uploadResult` line 121–126 **and** `updateSampleStatus` line 298–301), then compute `avgTAT` from `completed_at − created_at` for today's completed orders. Update the TAT display cards (`/lab/dashboard`, `/admin/lab`) if wording needs it.
- **No-migration alternative:** also stamp `labSampleTracking.completed_at` inside `uploadResult`, then compute TAT by joining `labSampleTracking` — avoids a schema change but relies on a tracking row always existing.
- **Effort:** 🟡 Medium · **Risk:** medium — **a migration touches the shared DB; coordinate before running `prisma migrate`.**
- **Test:** complete an order → TAT reflects the real elapsed minutes, and does not grow for already-completed orders.

> **Phase 2 exit:** TAT stable + accurate; migration reviewed. **Left uncommitted for your review.**

---

## Phase 3 — Larger items (these are really features — scope/confirm separately)

These three are listed as "issues" but each needs more than a quick fix. Recommend deciding on each before starting.

### Fix #5 — Result entry is text-only ("Value / File" is misleading)
- **Two options:**
  - **Quick (now):** relabel the field to "Result Value" (drop "/ File") so it stops implying an upload. 🟢 Low.
  - **Full (feature):** add a real file upload — file input on `app/lab/sample/[barcode]/page.tsx`, an upload API route using the existing storage util (`uploadToS3`, used by the MIS worker; local `/public/…` or S3), store the URL in the existing `lab_orders.report_url`, and surface a download in the report / patient portal. 🟡–🔴 Medium–High.
- **Recommendation:** do the quick relabel in Phase 1; treat the full upload as a scoped feature.

### Fix #6 — No reagent auto-deduction
- **Reality:** there is **no mapping** of which reagents (and quantities) a test consumes — so this is a **new feature**, not a bug fix. It needs a test↔reagent "recipe" table, then deduction on completion + guardrails for negative stock.
- **Recommendation:** **defer.** (This is the reagent item already de-prioritized from Part 2.) Track separately; not part of the quick-fix pass.

### Fix #9 — "Panels" is cosmetic
- **Reality:** the `LabPanel` / `LabPanelTest` models exist but there's no UI — building it is **Part 2 feature #2 (Test Panels / Profiles)**, not a quick fix.
- **Recommendation:** handle under the Part-2 feature work. As a stop-gap now, remove the misleading "Panels" wording where it implies functionality that isn't there. 🟢 Low.

---

## Suggested sequencing
1. **Phase 1** (fixes #1, #2, #3, #7, #8, #10 + the #5 relabel) — fast, low-risk, visibly improves the module.
2. **Phase 2** (fix #4 — accurate TAT) — **coordinate the migration** before it's applied.
3. **Phase 3** — decide per item: #5 full upload (feature), #6 reagent deduction (defer), #9 panels (do as Part-2 feature).

All of the above is implemented on `main` and left **uncommitted** — you review the complete diff, then tell me whether to commit + push.

## Testing (per phase)
- Seed data first (create a patient → order a lab test) so screens populate.
- Run through the relevant sections of the manual guide ([`Lab-and-Doctor-Portal-Manual-Test-Guide.md`](./Lab-and-Doctor-Portal-Manual-Test-Guide.md), Part A) after each phase.
- `npm run build` + typecheck clean before I hand it back. **No commit/push until you approve.**

---

*Plan only — no code changes made yet. Tell me which phase/items to implement and I'll do it on `main`, leaving everything uncommitted for your review.*
