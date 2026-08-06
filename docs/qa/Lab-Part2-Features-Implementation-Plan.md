# Implementation Plan — Lab Module (Part 2: New Features)

> **Goal:** build the 6 new features from [`Lab-Module-Review-and-Feature-Recommendations.md`](./Lab-Module-Review-and-Feature-Recommendations.md) (Part 2).
> **Verified against code** — every model, route, library, and flow below was read, not assumed.
> **Working approach:** all work is done **directly on `main`**, left **uncommitted** for your review. **Nothing is committed or pushed until you approve.** Reminder: `main` is `ahead 6, behind 48` of origin — the diff sits on top of that.

---

## Verified facts (the plan relies only on these)

| Fact | Detail (from the code) |
|---|---|
| `lab_orders` | One row = **one test** (`test_type` free string), single `result_value String?`. **No** `result_flag`, `result_numeric`, `panel_id`, or `verified_by` column. `barcode` is unique. |
| `lab_test_inventory` (catalog) | Stores per-test `normal_range_min/max`, `critical_value_low/high`, `unit`, `test_name`, `price`, `test_code`, `turnaround_time`, `hsn_sac_code`. |
| `LabPanel` + `LabPanelTest` | **Models exist** (panel_name, panel_code, panel_price, is_active; panel→tests with sort_order) **but ZERO code uses them** — fully greenfield UI + actions. |
| `orderLabTest` (`app/actions/doctor-actions.ts:390`) | Creates **one** `lab_orders` row per `test_type`; barcode = `LAB-<yyyymmdd>-<seq>`, `seq = lab_orders.count()+1`. |
| Doctor Labs dropdown (`app/doctor/dashboard/page.tsx:2178`) | **4 hard-coded options** ("Complete Blood Count (CBC)", "Lipid Profile", "Dengue NS1 Antigen", "Liver Function Test") — **not** sourced from the catalog. |
| `LabSampleTracking` | `barcode` (unique), `status` (default "Collected"), `collected_at/received_at/processed_at/completed_at`, `notes`. **No** `rejection_reason`. |
| Lab report route (`app/api/reports/lab/pdf/route.ts`, 180 lines) | `renderLabReport(order, patient, barcode, branding)` → HTML showing only `test_type` + `result_value`, footer "No signature required." `getBillBranding` available. |
| Libraries present | `@react-pdf/renderer`, **`qrcode`**, `xlsx`. **No** linear-barcode lib (Code128/jsbarcode), **no** HL7/ASTM lib. |

---

## Phase 0 — Prerequisite (small, unblocks Features 1–3)

**Source the doctor's lab ordering from the catalog.**
- **Why:** Features 1 (auto-flag) and 3 (report ranges) look up a test's reference range by matching `lab_orders.test_type` → `lab_test_inventory.test_name`. Today the doctor picks from 4 hard-coded strings that generally won't match catalog `test_name`s, so ranges won't resolve. Panels (Feature 2) also need the catalog as the source of orderable tests.
- **Change:** in `app/doctor/dashboard/page.tsx` (Labs tab) load the available tests via `getTestCatalog()` (already exists) and render them as the dropdown options (value = `test_name`), replacing the 4 hard-coded `<option>`s. `orderLabTest` already takes `test_type` — no change there.
- **Effort:** 🟢 Low · **Risk:** low · **Migration:** none.
- **Test:** the catalog tests you added appear in the doctor's dropdown; ordering one creates a `lab_orders` row whose `test_type` exactly matches a catalog `test_name`.

---

## Phase A — Reuse existing data/models (Features 1, 2, 3)

### Feature 1 — Structured result entry + auto-flagging (High / Low / Critical)
- **What exists:** result entry is a single free-text box (`/lab/sample/[barcode]` and the `/lab/technician` modal); the catalog already stores ranges + critical limits per test.
- **What to build:**
  1. **Result-entry server action** (in `app/actions/lab-actions.ts`): given a barcode + numeric value, look up the order's test in the catalog (by `test_type = test_name`), compute a **flag** — `Critical` if ≤ `critical_value_low` or ≥ `critical_value_high`; else `High`/`Low` vs `normal_range_min/max`; else `Normal`. Auto-set `is_critical` when the flag is Critical (replaces the current keyword-guess in `uploadResult`).
  2. **UI** on `app/lab/sample/[barcode]/page.tsx`: show the test's **reference range + unit** beside the input; after entry, show the computed **flag badge** (green/amber/red). Keep the free-text notes field for qualitative tests.
- **Scope decision (important):** each `lab_orders` row is a **single test/analyte** in the current model, so this is **per-test** auto-flagging (not multi-analyte-within-one-order). The "many analytes at once" experience is delivered by **Feature 2 (panels)** = several single-analyte orders entered together. *(True multi-analyte-per-order would need a new `lab_order_results` table — not recommended now; panels cover it.)*
- **Files:** `app/actions/lab-actions.ts`, `app/lab/sample/[barcode]/page.tsx`.
- **Migration:** **Optional.** Flag can be **computed on display** (no migration). If you want the flag stored/searchable, add nullable `result_flag String?` (+ optionally `result_numeric Float?`) to `lab_orders` — a migration; **coordinate first**.
- **Depends on:** Phase 0 (so `test_type` matches a catalog `test_name`; if it doesn't, the range simply isn't shown and it falls back to free-text — no crash).
- **Effort:** 🟢 Low–Medium · **Risk:** low.
- **Test:** enter a value inside range → "Normal"; outside normal → High/Low; beyond critical → "Critical" + `is_critical` set + the Feature-6 callback prompt (below) fires.

### Feature 2 — Test Panels / Profiles
- **What exists:** `LabPanel` / `LabPanelTest` models, unused. Catalog CRUD exists on `/lab/tests`.
- **What to build:**
  1. **Server actions** (new, in `app/actions/lab-actions.ts` or a new `lab-panel-actions.ts`): `getLabPanels`, `createLabPanel(name, code, price, testIds[])`, `updateLabPanel`, `deleteLabPanel`, `orderLabPanel(patientId, doctorId, panelId)`.
  2. **`orderLabPanel`**: loads the panel's `panel_tests`, then creates **one `lab_orders` row per test**. ⚠️ **Barcode sequencing:** the existing `seq = count()+1` collides if used in a tight loop — generate sequential barcodes correctly (compute base count once, then `+i`, or add a suffix per line). Must handle this to avoid a unique-constraint error on `barcode`.
  3. **Panels admin UI:** a "Panels" section (new tab on `/lab/tests`, or a new `/lab/panels` page) to create a panel and pick its tests from the catalog.
  4. **Ordering UI:** on the doctor Labs tab, add a "Panels" option so a doctor can order a whole panel (calls `orderLabPanel`).
- **Files:** new actions; `app/lab/tests/page.tsx` (or new `app/lab/panels/page.tsx`); `app/doctor/dashboard/page.tsx`.
- **Migration:** **none** (models already exist).
- **Effort:** 🟠 Medium · **Risk:** medium (the barcode-sequence loop is the main correctness risk — test it).
- **Test:** create an "LFT" panel with 3 tests → order it for a patient → **3** lab orders appear with distinct barcodes; each can be processed/flagged individually.

### Feature 3 — Formatted, signed lab report
- **What exists:** `renderLabReport()` in `app/api/reports/lab/pdf/route.ts` prints only `test_type` + `result_value`; branding via `getBillBranding`.
- **What to build (enhance `renderLabReport`):**
  1. **Reference range column:** look up the test in `lab_test_inventory` (by `test_type = test_name`) → show `normal_range_min–max unit` and the computed **flag** (reuse Feature 1's logic).
  2. **Trend:** fetch the patient's prior **completed** `lab_orders` for the same `test_type` → show the last few values (simple table or inline sparkline text).
  3. **Verified-by / signature line:** replace "No signature required." with a "Verified by / Reported by" block.
  4. (If a panel was ordered) optionally group the panel's tests into one report.
- **Files:** `app/api/reports/lab/pdf/route.ts` (+ a query helper for prior results/ranges).
- **Migration:** **Optional** — for a real captured signature, add `verified_by String?` / `verified_at DateTime?` to `lab_orders` and set them at completion; otherwise show the completing technician/branding. Start **without** the migration.
- **Depends on:** Feature 1's flag logic (share the helper).
- **Effort:** 🟠 Medium · **Risk:** low (one route).
- **Test:** open a completed order's report → shows value + reference range + flag + prior trend + a verified-by line.

---

## Phase B — Workflow completeness (Features 5, 6)

### Feature 5 — Sample accessioning + barcode label printing
- **What exists:** `LabSampleTracking` (timestamps), each order has a `barcode`. `qrcode` library is available; **no linear-barcode library**.
- **What to build:**
  1. **Accessioning UI** (new `/lab/collect` or a panel on the worklist): scan/enter a barcode → mark **Collected** (writes `LabSampleTracking.collected_at`), then the existing Received → Processing → Completed steps show a full lifecycle.
  2. **Barcode label printing:** render a printable label (patient, test, barcode, date) with a scannable code. Use **`qrcode`** (already installed) for a QR label; **note:** for a *linear Code128* barcode you'd add a lib (e.g. `jsbarcode`) — call out as a small dependency decision.
  3. **Sample rejection / recollection:** add a "Reject sample" action (haemolysed / clotted / insufficient) that sets a rejected state + reason and flags for recollection.
- **Files:** new page(s) under `app/lab/`; `app/actions/lab-actions.ts` (extend `updateSampleStatus` / add `rejectSample`).
- **Migration:** `LabSampleTracking.status` is a free string, so **new status values need no migration**. Add nullable **`rejection_reason String?`** to `LabSampleTracking` → a **small migration** (coordinate); or store the reason in the existing `notes` field to avoid a migration.
- **Effort:** 🟠 Medium · **Risk:** low–medium.
- **Test:** collect a sample → label prints with a scannable code; reject a sample → it's marked for recollection with a reason.

### Feature 6 — Critical-value callback log
- **What exists:** critical results are flagged + notified (Feature 7 fix), but there is **no logged callback record** and **no table** for it.
- **What to build:**
  1. **New model `LabCriticalCallback`** (migration): `id`, `barcode`/order ref, `notified_role`, `notified_name`, `notified_by` (user id), `notified_at`, `read_back_confirmed Boolean`, `remarks`, `organizationId`, `created_at`.
  2. **Prompt on critical:** when a result is flagged/entered as Critical (Features 1 & 7), open a small "Log critical callback" dialog on `/lab/sample/[barcode]` → who was informed + read-back confirmation → `createCriticalCallback(...)`.
  3. **Log view:** a list of critical callbacks (filter by date/patient) for audit — a new small page or a section on the dashboard.
- **Files:** `prisma/schema.prisma` (new model + migration), new actions, `app/lab/sample/[barcode]/page.tsx`, a log page.
- **Migration:** **Required** (new table) — **coordinate before running `prisma migrate`.**
- **Effort:** 🟠 Low–Medium · **Risk:** medium (schema change on shared DB).
- **Test:** flag a result critical → prompted to log the callback → the entry appears in the callback log with read-back confirmation.

---

## Phase C — Strategic / high-effort (Feature 4)

### Feature 4 — Analyzer / machine interfacing (HL7 / ASTM)
- **Reality (verified):** no HL7/ASTM library is installed, and lab analyzers speak **serial / TCP (ASTM E1394 or HL7 v2 ORU)**, not HTTP — so a real integration needs a **small on-prem bridge** (outside this repo) that reads the analyzer and forwards messages to HIMS.
- **What to build (phased):**
  1. **Inbound result endpoint** (new `app/api/lab/analyzer/result/route.ts`): accepts an HL7 v2 `ORU^R01` (or ASTM) message, **parses** it (custom parser — no lib present), maps to a `lab_orders` row by **barcode / order id** in the message, writes `result_value` + auto-flag (reuse Feature 1), sets status Completed. Secure with a shared key (like the voice API).
  2. **Simulation first:** a small "paste/upload an HL7 message" tester (or the endpoint accepting a sample ORU) so it can be validated **without hardware**.
  3. **Bridge (later, out of repo):** the on-prem service that connects the physical analyzer to the endpoint. Optionally an **outbound** order message (LIS→analyzer) so the machine knows what to run.
- **Files:** new API route + a parser module (`app/lib/lab/hl7.ts`); reuse Feature 1's flagging.
- **Migration:** optional (e.g. `analyzer_id`/`device` on `lab_orders`) — not required to start.
- **Dependency decision:** custom minimal ORU parser vs. adding an HL7 library — call out before building.
- **Effort:** 🔴 High · **Risk:** high (hardware/protocol; do the simulated path first).
- **Test:** POST a sample ORU message → the matching order is auto-filled + flagged + completed, with no manual typing.

---

## Migrations summary (coordinate before applying — shared DB)
| Feature | Migration | Needed? |
|---|---|---|
| 0, 2 | — | No |
| 1 | `result_flag` / `result_numeric` on `lab_orders` | **Optional** (compute-on-display works without) |
| 3 | `verified_by` / `verified_at` on `lab_orders` | **Optional** |
| 5 | `rejection_reason` on `LabSampleTracking` | **Optional** (can reuse `notes`) |
| 6 | **New `LabCriticalCallback` table** | **Required** |
| 4 | `analyzer_id` on `lab_orders` | Optional |

Only **Feature 6** strictly needs a migration. Everything else can ship without one (or with a small optional column). Migrations touch the shared database — confirm before `prisma migrate`.

---

## Suggested sequencing
1. **Phase 0** (catalog-sourced ordering) — unblocks 1–3.
2. **Phase A** — **Feature 1** (auto-flag) → **Feature 2** (panels) → **Feature 3** (report). Highest value, mostly no migration.
3. **Phase B** — **Feature 5** (accessioning/labels) → **Feature 6** (critical callback log, +1 table).
4. **Phase C** — **Feature 4** (analyzer interfacing) — simulated path first, then the on-prem bridge.

## Testing (per feature)
- Seed: catalog tests with ranges (`/lab/tests`), then order via the doctor Labs tab.
- Verify each feature against its **Test** line above; `npm run build` + typecheck clean before hand-off.
- **No commit / push until you approve.**

---

*Plan only — no code changes made yet. Tell me which phase/feature(s) to implement (e.g. "Phase 0 + Feature 1", or "all of Phase A") and I'll build it on `main`, leaving everything uncommitted for your review.*
