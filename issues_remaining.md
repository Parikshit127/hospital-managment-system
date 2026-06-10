# Issues Remaining

_Last verified: 2026-06-10 (against live code on `main`)_

Excluded per request: pharmacy OPD/IPD charge details in bill/report, and cash total not appearing in report.

---

## Genuinely open

### 5. Roles & permissions fully editable by Super Admin — 🟡 PARTIAL
- **Done (on branch `feat/roles-enforcement`, NOT yet merged/deployed):**
  - Login embeds the role's permissions in the JWT; `proxy.ts` now honours them (custom roles + permission grants take effect); admin baseline protected; old sessions fall back safely.
  - System roles are editable (name/slug fixed; permissions editable).
- **Still to do:** expose role/permission editing in the **Super Admin portal** (`app/superadmin/` has no roles page); merge + deploy the branch after a login test.
- **Effort:** Medium (branch ready; superadmin UI is extra).

### 3. IPD patient report — 🟡 MOSTLY ADDRESSED
- **Now available:** `ipd/census` (live bed census), `ipd/admissions-hub` (admissions list **+ date filter**), finance **Daily Activity** (IPD admissions/discharges per day, expandable to patient names), and finance **Bill Type** filter (IPD / Admit / Discharge).
- **Remaining (optional):** a dedicated **analytical IPD report** (length-of-stay, admissions trend). The original "can't see IPD data" complaint is resolved.
- **Effort:** Medium, only if a formal report is wanted.

---

## Done / resolved

### 2. 'Add patient' option in nursing module — ✅ RESOLVED
- New `app/nurse/admit/page.tsx` — full admit flow (patient search, ward/bed, doctor, admission type, optional deposit) reusing the role-agnostic `admitPatientIPD` action. Linked in the nurse sidebar as "Admit Patient".

### 4. TPA / corporate — ✅ RESOLVED
- Insurance management at `/insurance` (now in **admin nav**, manual add works).
- Corporate management UI already exists at `app/reception/finance/corporates/page.tsx` (view / **Add Corporate** / edit) — now also linked in the **admin sidebar** ("Corporates").
- Corporate payer can also be **typed on the patient page** (auto-creates the corporate via find-or-create).

---

## Needs clarification

### 6. Bill issue in Pharmacy Module (EOK)
- **Status:** No active bug found in code; recent commits fixed invoice-number collisions and OPD invoice visibility.
- **Needed:** Exact symptom / steps to reproduce.

---

## Note
The live server `13.234.242.13` is now redeployed and current with `main` (older-build false-bugs no longer apply). Roles enforcement is the one piece intentionally held on a branch pending a login test.
