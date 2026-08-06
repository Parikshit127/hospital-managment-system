# Lab Module — Review & Feature Recommendations

> **Scope:** the Lab module only — Admin Lab (`/admin/lab`) and the Lab Technician portal (`/lab/*`).
> **Purpose:** (1) whether the existing features work, and what does not; (2) a focused set of high-impact features worth adding, with an explanation of what each does.
> *Based on a static read of the codebase + reference to standard Laboratory Information System (LIS) practice. No code was changed.*

---

## Part 1 — Is the existing Lab module working?

**Overall:** the **core pipeline works** end to end — order → receive → process → result → complete → report → patient portal. However, several UI features are **non-functional, cosmetic, or incomplete**.

> The all-zero dashboards are **expected** when there is no data — not a bug. Create a lab order (Doctor portal → Labs → **Order Test**) and the counts populate.

### ✅ Working (wired correctly)

| Area | Status |
|---|---|
| Dashboard KPIs (Pending / Processing / Completed Today / Critical) | Works — counts from `lab_orders` |
| Worklist — list, **search**, status filter, balance column | Works |
| **Process Sample** state machine — Mark Received → Start Processing → Verify & Completion | Works |
| Result save → patient notify (email/WhatsApp) + critical doctor alert + IPD charge posting | Works |
| Test Catalog — Add / Edit / Delete / Toggle availability | Works |
| Reagent Inventory — Add / Edit + Low-stock / Expiring badges | Works |
| Reports — TAT trend + top-tests charts | Works |
| Lab order creation from Doctor portal; patient-portal result + PDF report | Works |

### ❌ Not working / incomplete (needs changes)

| # | Issue | Evidence |
|---|---|---|
| 1 | **`/lab/technician` search box does nothing** | Input has no `onChange` / `value` — purely decorative |
| 2 | **`/lab/technician` "Urgent Requests" KPI is fake** | Hard-coded `0`, greyed out, not connected to data |
| 3 | **Reports page has no export / print / download** | No PDF/Excel/print button — yet the dashboard's "Generate Report" links here (dead-ends) |
| 4 | **Turnaround Time (TAT) is misleading** | Approximated as `now − created_at`, so it inflates through the day; a real-timestamp table (`LabSampleTracking`) exists but is ignored |
| 5 | **Result entry is text-only** | Field labelled "Value / File" but there is no real file / attachment upload |
| 6 | **No reagent auto-deduction** | Reagents never decrement when a test is processed — manual only |
| 7 | **"Flag Critical" alone doesn't alert anyone** | Notification only fires on completion, not on flagging |
| 8 | **Catalog form hides fields** | `test_code`, `turnaround_time`, `critical_value_low/high`, `HSN/SAC` exist in the model but have no form field |
| 9 | **"Panels" is cosmetic** | `LabPanel` model exists but there is no UI to build / order panels |
| 10 | **Two overlapping worklists** | `/lab/worklist` and `/lab/technician` duplicate each other; the second carries the dead search (#1) and fake KPI (#2) |

---

## Part 2 — New features to add (6 — impactful & useful)

Each feature below reuses or extends what the module already has, and closes a real gap.

### 1. Structured result entry + auto-flagging (High / Low / Critical)
**What it does:** replaces the single free-text result box with **one field per analyte**. As a value is entered, the system compares it against the test's **reference range** (already stored in the catalog) and automatically marks it **High**, **Low**, or **Critical** (using the catalog's critical-value limits). This removes transcription ambiguity, makes abnormal results obvious at a glance, and feeds accurate flags to the doctor and the report.
**Why it matters:** you already store `normal_range_min/max` and `critical_value_low/high` — they are simply unused at result entry. Highest value-for-effort.
🔴 Impact: Very high · 🟢 Effort: Low–Medium
🔗 [Reference ranges & result flagging (Pathology Outlines)](https://www.pathologyoutlines.com/topic/informaticslisadditionalfeatures.html)

### 2. Test Panels / Profiles
**What it does:** lets a doctor order a **bundle** (e.g. "Liver Function Test", "Lipid Profile") that automatically expands into all its component tests, instead of adding each test one by one. Results for the whole panel are then entered and reported together.
**Why it matters:** the `LabPanel` / `LabPanelTest` models already exist in the schema — only the UI to define and order panels is missing.
🟠 Impact: High · 🟢 Effort: Low
🔗 [LIS features overview (Clinisys)](https://www.clinisys.com/int/en/learn-about-laboratory-information-systems/)

### 3. Formatted, signed lab report
**What it does:** upgrades the current bare-value output into a proper diagnostic report — **all analytes with their reference ranges**, the patient's **previous-result trend** for each analyte, and the **pathologist's digital signature / verified-by stamp**. Printable and shareable to the patient portal.
**Why it matters:** builds directly on the existing lab-report PDF route; makes the output clinically usable and presentable.
🟠 Impact: High · 🟡 Effort: Medium
🔗 [LIS reporting features (Birlamedisoft LIS guide)](https://www.birlamedisoft.com/blogs/laboratory-information-system/)

### 4. Analyzer / machine interfacing (HL7 / ASTM)
**What it does:** connects the LIS **directly to lab analyzers** (chemistry, haematology, etc.). Orders are sent to the machine and results are **pulled back automatically** into the corresponding lab order — no manual typing. Uses the standard **HL7 v2.x** or **ASTM E1394** protocols.
**Why it matters:** eliminates manual transcription entirely (the root of issue #5), and is the single biggest accuracy + speed upgrade for a real lab. Requires hardware/integration effort.
🔴 Impact: Very high · 🔴 Effort: High
🔗 [Analyzer integration (OpenELIS)](https://openelis-global.org/analyzers/) · [HL7 standards](https://www.hl7.org/)

### 5. Sample accessioning + barcode label printing
**What it does:** surfaces the full **sample lifecycle** — collect → accession → process — with **printable barcode labels** at collection and a **sample rejection / recollection** path for haemolysed, clotted, or insufficient samples. Scanning the barcode pulls up the right order at each station.
**Why it matters:** the `LabSampleTracking` table already captures the timestamps but is not surfaced; barcode-driven flow reduces mix-ups and enables accurate TAT (issue #4).
🟠 Impact: High · 🟡 Effort: Medium
🔗 [Lab workflow & barcoding (Pathology Outlines)](https://www.pathologyoutlines.com/topic/informaticslisadditionalfeatures.html)

### 6. Critical-value callback log
**What it does:** whenever a **critical result** is produced, it records **who was notified** (doctor/nurse), **when**, and a **read-back confirmation** — a documented callback trail. Ensures a critical value is never just flagged and forgotten.
**Why it matters:** today a critical is only flagged/notified with no logged callback record; documented critical-value read-back is a patient-safety requirement.
🟠 Impact: High · 🟢 Effort: Low–Medium

---

## Recommended order
1. **Fix the 10 issues in Part 1 first** (quick wins — dead search box, fake KPI, report export, real TAT, etc.).
2. Then build features that reuse existing data/models: **#1 (structured results), #2 (panels), #3 (report)**.
3. Then **#5 (accessioning / barcode), #6 (critical-value log)**.
4. Treat **#4 (analyzer interfacing)** as the higher-effort, strategic upgrade for a production lab.

---

## References
- [Clinisys — LIS software & features](https://www.clinisys.com/int/en/learn-about-laboratory-information-systems/)
- [Pathology Outlines — LIS additional features](https://www.pathologyoutlines.com/topic/informaticslisadditionalfeatures.html)
- [LigoLab — the power of LIS in healthcare](https://www.ligolab.com/post/transforming-patient-care-the-power-of-laboratory-information-systems-lis-in-healthcare)
- [OpenELIS — lab analyzer integration](https://openelis-global.org/analyzers/)
- [HL7 — health data standards](https://www.hl7.org/)
- [Birlamedisoft — LIS/LIMS 2026 buyer's guide](https://www.birlamedisoft.com/blogs/laboratory-information-system/)
