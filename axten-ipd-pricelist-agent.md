# 🏥 Axten Hospitals — IPD Price List Integration Agent

> **Instruction for Claude Opus:** You are an autonomous hospital management system integration agent. When this file is uploaded, read it fully, extract all structured data, and execute the checkpoint pipeline below — one checkpoint at a time, with full reasoning at each step. Do not skip checkpoints. Do not assume success — verify it.

---

## 🧠 AGENT CONTEXT

You are being asked to:
1. Parse the IPD (In-Patient Department) price list from this document
2. Insert/seed it into the hospital management system's database or relevant config/data layer
3. Verify the data is being fetched correctly from the frontend or API
4. Debug systematically if anything fails
5. Report status at every checkpoint

The hospital is **Axten Hospitals** (Contact: 81 56 92 92 92).

---

## 📋 PRICE LIST DATA (Structured)

### Category: E.N.T.

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 1 | Tonsillectomy / Adenoidectomy | 40,000 |
| 2 | Tympanoplasty | 45,000 |
| 3 | Cochlear Implant - Unilateral | 8,00,000 |

---

### Category: General & Laparoscopic Surgery

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 4 | Haemorrhoidectomy / Fistulectormy | 48,000 |
| 5 | Appendectomy - Lap. | 48,000 |
| 6 | Cholecystectomy - Lap. | 48,000 |
| 7 | Hernioplasty - Lap. - Unilateral - Inguinal / Femoral / Umblical / Incisional | 48,000 |

---

### Category: Obstetrics & Gynaecology

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 8 | Normal Delivery | 60,000 |
| 9 | Lower Segment Cesarean Section (LSCS) | 80,000 |
| 10 | Laparoscopic Assisted Vaginal Hysterectomy (LAVH) | 1,20,000 |
| 11 | Total Abdominal Hysterectomy (TAH) - Lap. | 1,20,000 |
| 12 | Ovarian Cystectomy - Lap. | 60,000 |
| 13 | Dilatation & Curettage (D&C) - Day Care | 30,000 |
| 14 | Cystoscopy - Day Care | 25,000 |
| 15 | Myomectomy - Lap. | 1,00,000 |

---

### Category: Orthopaedics

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 16 | Total Knee Replacement - Unilateral - With Implant | 2,00,000 |
| 17 | Hip Replacement - Unilateral | 2,00,000 |
| 18 | ACL Reconstruction / Repair | 1,30,000 |

---

### Category: Urology & Nephrology

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 19 | RIRS | 95,000 |
| 20 | PCNL - Unilateral | 80,000 |
| 21 | Circumcision (Day-Care) | 20,000 |
| 22 | Prostate Removal - TURP | 80,000 |
| 23 | Dialysis (All inclusive, Day Care) | 2,800 |
| 24 | DJ Stent Removal (Day Care) | 7,500 |

---

### Category: Vascular Surgery

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 25 | Varicose Veins - Unilateral | 70,000 |
| 26 | AV Fistula (Day Care) | 35,000 |

---

### Category: Cosmetic / Plastic Surgery

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 27 | Bariatric Surgery | 2,80,000 |
| 28 | Liposuction - Per Body Area | 1,35,000 |
| 29 | Breast Implant - Bilateral with Implant | 1,40,000 |
| 30 | Lipoma Removal - Per Lipoma | 5,500 |
| 31 | Gynaecomastia | 45,000 |

---

### Category: Oncology

| S.No | Procedure | Price (INR) |
|------|-----------|-------------|
| 32 | Chemotherapy - Per Chemo - Day Care (Medicine Extra on Actuals) | 18,000 |
| 33 | Breast Cancer Surgery - Unilateral | 1,80,000 |
| 34 | Commando Surgery with Reconstruction - Including ICU Stay | 4,10,000 |

---

### Other Hospital Charges (Non-Surgical / Daily Rates)

| Charge Type | Price (INR) |
|-------------|-------------|
| General Admission - Per Day | 8,000 |
| ICU Admission - Per Day | 20,000 |
| Nursery / NICU Admission - Per Day | 15,000 |
| Doctor Consultation - Basic | 500 |
| Doctor Consultation - Specialist | 1,000 |
| Doctor Consultation - Super Specialist | 1,500 |
| BP Monitoring | 150 |

---

### Laboratory & Diagnostics (Prices not listed — to be filled)

| Test | Price (INR) |
|------|-------------|
| ECG | — |
| X-Ray | — |
| Ultrasound | — |
| CT Scan | — |
| MRI Scan | — |
| Pre Anaesthesia Checkup Package | — |

> ⚠️ **Note:** Lab & Diagnostic prices are not listed in the source document. Agent should flag these as `NULL` or `TBD` and alert the developer to fill them manually.

---

## ✅ INCLUSIONS (What's covered in the package price)

- Room Rent (Day of Surgery)
- Nursing Care
- RMO Charges
- File Charges
- Surgeon Fees
- Medicines & Consumables
- Operation Theatre

---

## ❌ EXCLUSIONS (What's NOT covered)

- Implants (charged as per actuals + patient choice)
- Pre-Surgery Test / Doctor Consultation
- Lab Tests
- Post Discharge Medicines
- Post Discharge Consultations
- If D.O.S. increases → General Admission Per Day will be charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)
- Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance

---

## 🔁 AGENT CHECKPOINT PIPELINE

> Execute these checkpoints sequentially. At each checkpoint: **state what you're doing → do it → verify result → decide next action.**

---

### ✅ CHECKPOINT 1 — Understand the System

**Goal:** Identify how the hospital management system stores procedure/price data.

Actions:
- [ ] Locate the relevant database schema (table names for procedures, pricing, IPD packages)
- [ ] Identify if prices are stored in: SQL DB / NoSQL / JSON config / seed file / admin panel
- [ ] Check if a `procedures` or `ipd_packages` table/collection already exists
- [ ] Note the data types expected: `price` (integer/decimal?), `category` (enum/string?), `name` (varchar?), `is_day_care` (boolean?)

**Decision gate:** If schema found → proceed to Checkpoint 2. If no schema found → create one (Checkpoint 2 will scaffold it).

---

### ✅ CHECKPOINT 2 — Prepare the Data Layer

**Goal:** Structure and insert the price list into the system.

Actions:
- [ ] Map the price list above into the correct schema format
- [ ] Handle Indian number format (e.g., `2,80,000` → `280000`) — convert all prices to plain integers
- [ ] Assign `category` field to each procedure
- [ ] Flag `is_day_care: true` where applicable (Circumcision, DJ Stent Removal, Dialysis, D&C, Cystoscopy, AV Fistula, Chemotherapy)
- [ ] Set `lab_diagnostics` prices as `null` with a `status: "TBD"` flag
- [ ] Write seed script / migration / API call / admin import — whichever matches system architecture
- [ ] Execute the insert

**Expected output:** 34 procedure records + other hospital charges inserted successfully.

---

### ✅ CHECKPOINT 3 — Verify Data Fetch

**Goal:** Confirm the inserted data is correctly retrievable.

Actions:
- [ ] Query the database / call the API endpoint that returns the IPD price list
- [ ] Cross-check: count should be **34 procedures** under correct categories
- [ ] Spot-check at least 3 records across different categories (e.g., Cochlear Implant = 800000, LSCS = 80000, Bariatric = 280000)
- [ ] Check that `category` labels are correct
- [ ] Check that `is_day_care` flags are correct
- [ ] Check that `null` prices for diagnostics are handled gracefully (no crash, shows "TBD" or similar)

**Decision gate:**
- ✅ All checks pass → Checkpoint 4 (frontend/UI verification)
- ❌ Any check fails → Jump to Checkpoint 5 (debug protocol)

---

### ✅ CHECKPOINT 4 — Frontend / UI Verification

**Goal:** Confirm data appears correctly on the UI.

Actions:
- [ ] Navigate to the IPD price list page/module in the HMS
- [ ] Verify all 34 procedures render with correct names and prices
- [ ] Verify category grouping is correct
- [ ] Verify Indian number formatting is displayed properly (e.g., ₹2,80,000 not 280000)
- [ ] Verify day-care badges / flags render where applicable
- [ ] Verify null/TBD diagnostics show a placeholder, not a blank or error
- [ ] Check mobile responsiveness if applicable

**Decision gate:**
- ✅ All visible → Done. Report success summary.
- ❌ Mismatch or missing data → Checkpoint 5

---

### 🔴 CHECKPOINT 5 — Debug Protocol (Run only if Checkpoint 3 or 4 fails)

**Goal:** Systematically identify and fix the root cause.

#### 5A — Data Layer Audit
- [ ] Re-run the raw DB query / API call and inspect raw response
- [ ] Check if insert actually committed (transaction rolled back? silent failure?)
- [ ] Check for encoding issues (special chars in procedure names like `/`, `&`, `-`)
- [ ] Check if price field has type constraints violated (e.g., storing 800000 in a field capped at 99999)
- [ ] Check for duplicate key conflicts if re-running seed

#### 5B — API / Backend Audit
- [ ] Check the fetch endpoint: is it hitting the correct table/collection?
- [ ] Check filters: is there an `is_active`, `department`, or `hospital_id` filter silently excluding records?
- [ ] Check pagination: is the API returning only first N records and cutting off?
- [ ] Check auth: is the endpoint protected and returning 401/403 silently?
- [ ] Check serialization: are integer prices being cast to strings or losing precision?

#### 5C — Frontend Audit
- [ ] Check network tab: what does the raw API response look like?
- [ ] Check if component is mapping the correct field names (e.g., `price` vs `amount` vs `cost`)
- [ ] Check if category filtering logic is accidentally hiding some records
- [ ] Check if there's a hardcoded list anywhere overriding the dynamic fetch

#### 5D — Environment Audit
- [ ] Is the seed running against the correct environment (dev vs staging vs prod)?
- [ ] Are environment variables (DB connection string, API base URL) correctly set?
- [ ] Is there a caching layer (Redis, CDN, browser cache) serving stale data?

**After identifying the issue:**
- [ ] State the exact root cause found
- [ ] Apply the fix
- [ ] Re-run Checkpoint 3 and Checkpoint 4
- [ ] Confirm resolution

---

### ✅ CHECKPOINT 6 — Final Report

**Goal:** Summarize what was done.

Produce a report in this format:

```
## IPD Price List Integration — Status Report

**Date:** [timestamp]
**Total Procedures Added:** [N] / 34
**Categories Seeded:** [list]
**Day-Care Procedures Flagged:** [N]
**Diagnostics (TBD):** [N] items pending price input
**Fetch Verification:** PASS / FAIL
**UI Verification:** PASS / FAIL
**Errors Encountered:** [none / description]
**Fixes Applied:** [none / description]
**Final Status:** ✅ COMPLETE / ⚠️ PARTIAL / ❌ FAILED
```

---

## 📌 AGENT RULES

1. **Never skip a checkpoint.** Even if something looks obviously correct, verify it.
2. **Never assume silence = success.** A silent insert with 0 rows affected is a failure.
3. **Price format:** Always store as plain integers (no commas, no ₹ symbol) in the DB. Format for display only.
4. **Null diagnostics:** Do NOT skip or crash on missing prices. Insert as `null` and surface as "Price on Request" or "TBD" in the UI.
5. **Inclusions/Exclusions:** Store these as metadata on the package, not per procedure. They apply globally to all surgical packages.
6. **If blocked:** State clearly what information you need from the developer (schema access, credentials, codebase path, etc.) and pause.

---

*Generated for Axten Hospitals IPD Price List Integration | Axten HMS Agent v1.0*
