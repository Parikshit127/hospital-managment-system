# Deployment note — nursing module hardening

**Branch:** `fix/nursing-module-hardening` · **27 commits** · 44 files, +5,468 / −703
**Migrations:** 3 (all additive) · **Crontab:** changed · **Prepared:** 25 Jul 2026

---

## 1. What this release does

Closes 44 audit findings in the nursing/IPD module and adds eight nursing records
the system had no place to store. The changes that matter operationally:

| Area | Change |
|---|---|
| **Beds** | Discharge now stamps `cleaning_started_at`, so vacated beds return to the pool. On the demo database this released **18 of 40 beds** that had been stranded in "Cleaning" indefinitely. |
| **Tenancy** | `update` / `delete` / `upsert` are now tenant-scoped (they were not), and 49 further models registered. |
| **Access** | The route guard no longer widens every role. Nurses lose `/doctor` and `/discharge`; they keep `/ipd`, `/lab`, `/pharmacy`. |
| **Medication** | Allergy check, controlled-drug second signature, mandatory reason for a dose not given, formulary search, and the chart no longer runs dry after 3 days. |
| **Deterioration** | NEWS2 corrected and now escalates to people (notification + task) instead of drawing a banner. |
| **Orders** | Doctors can place clinical and physician orders; they raise nursing tasks and reach the lab worklist. |
| **Discharge** | One implementation behind all four entrances, with a clinical gate and a recorded override. |
| **New records** | Care plans (ADPIE), fluid balance, wound care, lines/devices, transfusion, incidents, patient education, shift assignment. |

---

## 2. Deploy order — migrate BEFORE the new code serves traffic

This release adds columns and tables the new code reads. Prisma selects every
column declared in the schema, so deploying the code without the migration will
break the nursing and eMAR screens with a missing-column error.

`EOD_2026-06-09.md` records this exact failure happening before: *"live server was
serving a stale .next build and the RDS DB was missing migrations the code
required."*

```bash
git pull origin main
npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate status      # expect the 3 below as pending
npx prisma migrate deploy      # MUST succeed before the reload
npm run build                  # see §6 on build load
pm2 reload ecosystem.config.js --update-env
curl -sf http://localhost:3000/api/health
```

---

## 3. The three migrations

All additive. **Nothing is dropped, renamed, backfilled or modified.** Every
statement uses `IF NOT EXISTS`, so all three are safe to re-run.

### `20260725000000_nursing_safety_fields` — 10 statements

Columns only, all nullable or defaulted. On Postgres 11+ adding a nullable column
with no default is a metadata-only change: no table rewrite, no row scan.

| Table | Columns |
|---|---|
| `ipd_vitals` | `on_supplemental_oxygen`, `news_max_single_param` |
| `medication_administrations` | `not_given_reason`, `witness_id`, `allergy_override_reason` |
| `nursing_tasks` | `completed_by`, `source_type`, `source_id`, `priority` + index on `admission_id` |

### `20260725010000_nursing_admission_fks` — 8 statements

Foreign keys from `clinical_orders`, `physician_orders`, `active_medications`,
`medication_administrations` and `nursing_notes` to `admissions`, plus three
indexes.

**Added `NOT VALID` on purpose.** That enforces the constraint on every new and
updated row immediately, *without scanning the existing table* — so the deploy
cannot fail partway through on legacy rows, and the lock is brief.

The demo database has **zero orphans** in all five tables. Production may differ.
Validate separately, when convenient, after checking what would block it:

```sql
-- find rows that would fail validation (run per table)
SELECT t.* FROM "medication_administrations" t
LEFT JOIN "admissions" a ON a."admission_id" = t."admission_id"
WHERE a."admission_id" IS NULL;

-- then, once clean:
ALTER TABLE "clinical_orders"            VALIDATE CONSTRAINT "clinical_orders_admission_id_fkey";
ALTER TABLE "physician_orders"           VALIDATE CONSTRAINT "physician_orders_admission_id_fkey";
ALTER TABLE "active_medications"         VALIDATE CONSTRAINT "active_medications_admission_id_fkey";
ALTER TABLE "medication_administrations" VALIDATE CONSTRAINT "medication_administrations_admission_id_fkey";
ALTER TABLE "nursing_notes"              VALIDATE CONSTRAINT "nursing_notes_admission_id_fkey";
```

`ON DELETE RESTRICT`, not `CASCADE` — a medication administration record is a
legal document and deleting an admission must not silently take the drug chart
with it. Anything that currently deletes an admission with clinical records
attached will now fail; that is intended, but worth knowing.

### `20260725020000_nursing_care_records` — 31 statements

Eight new tables, their indexes, and foreign keys (also `NOT VALID`):
`nursing_care_plans`, `fluid_balance_entries`, `wound_care_records`,
`patient_devices`, `transfusion_records`, `clinical_incidents`,
`patient_education_records`, `nurse_shift_assignments`.

New tables only — no existing table is touched.

**If a migration fails partway.** I hit this during development (a wrong table
name in the FK block). Prisma then refuses all further migrations with `P3009`.
Recover with:

```bash
npx prisma migrate resolve --rolled-back 20260725020000_nursing_care_records
# fix, then:
npx prisma migrate deploy
```

The `CREATE TABLE IF NOT EXISTS` statements make the re-run safe.

---

## 4. Crontab — must be reinstalled

Three inpatient jobs live under `/api/ipd/` rather than `/api/cron/`, which is
why the earlier sweep of "the 13 cron routes" missed them. All three were
implemented and **nothing was calling them**.

```bash
bash aws/cron/install-cron.sh --dry-run   # preview, secret masked
bash aws/cron/install-cron.sh             # install
bash aws/cron/install-cron.sh --verify    # every endpoint should answer 200
```

Newly scheduled:

| Schedule | Endpoint | What it does |
|---|---|---|
| hourly | `/api/ipd/bed-cleaning-sla` | Returns beds left in "Cleaning" past the 24h backstop to the pool, across all orgs. |
| every 4h | `/api/ipd/deposit-alerts` | Notifies finance and the IPD manager while an advance is running out. |
| daily 06:30 | `/api/ipd/interim-billing` | Flags long-staying admissions due an interim bill. Does **not** raise the bill — that needs an accountable user. |

**Order matters:** these depend on a `proxy.ts` change that lets the scheduler
reach them (they previously answered `307` to a redirect and never ran). Install
the crontab *after* the app is deployed, or the first few runs will 307.

`/api/ipd/daily-accrual` remains deliberately unscheduled — it returns early by
design ("Auto-accrual disabled. Room/nursing charges are added manually").

---

## 5. Changes staff will notice — please brief the wards before deploy

These are intentional, but they change daily routine and will generate questions
at the nurses' station if nobody has been told.

**Nursing**
- Giving a drug the patient is recorded as allergic to is now **refused**. A modal
  explains why; proceeding needs a typed justification of 10+ characters, which
  is stored on the record.
- **Controlled drugs require a second nurse to co-sign** before the dose is given.
- Marking a dose **Held / Refused / Missed now requires a reason** (picker plus
  free text). It can no longer be a bare click.
- Recording vitals now returns a **NEWS score**, and a score of 5+ (or any single
  parameter at 3) **notifies ward staff and opens a task** that must be closed.
- The **"Recorded By" free-text box is gone** from the vitals form — the recorder
  is the signed-in user. Anyone sharing a login will now be recording under that
  login's name.

**Discharge**
- A patient with a NEWS of 7 or above **cannot be discharged** without a typed
  reason. Discharge-against-advice is still possible; it is recorded.
- Outstanding items (open nursing tasks, overdue doses, pending labs, no charges
  posted) are now **shown before discharge** as warnings.

**Access**
- Nurses can no longer open `/doctor` or `/discharge`. If a nurse currently uses
  the doctor dashboard for anything, find out what before deploying.
- **Idle timeout raised from 15 to 60 minutes.** Staff will be logged out far less
  often. The JWT lifetime (8h) is unchanged.

**Navigation**
- Two new screens: **Care Record** and **Incidents** (nurse and IPD portals).
- Ten screens renamed so one page has one name everywhere — e.g. "IPD Settlement"
  is now "Discharge Settlement" in Reception, matching IPD.
- "Case Sheet" in the sidebar now opens a patient picker instead of an empty page.

**Ward scoping (opt-in, no effect today)**
`User.assigned_ward_id` is `NULL` for every user, so nurses still see all wards.
Populating it narrows a nurse's patient list and eMAR to their own ward. Do this
deliberately, ward by ward — it is a real change to what staff can see.

---

## 6. Expect a visible jump in bed availability

The first `/api/ipd/bed-cleaning-sla` run releases every bed sitting in
"Cleaning" past 24 hours. On the demo database that was **18 of 40 beds**.

Before deploying, check how many are affected on live so nobody is surprised:

```sql
SELECT status, COUNT(*) FROM beds GROUP BY status;
SELECT COUNT(*) FROM beds WHERE status = 'Cleaning' AND cleaning_started_at IS NULL;
```

The second figure is the backlog that will be released. It is a correction, not a
data change — those beds were physically free all along.

---

## 7. Build load on the production box

Unchanged from the existing guidance, repeated because it bites: `npm run build`
runs **on the production server** with a 4 GB heap and spawns a worker per core,
competing with the PM2 cluster serving patients.

1. Deploy in a low-traffic window (simplest and most effective).
2. `nice -n 19 npm run build` so PM2 keeps the CPU it needs.
3. Better: build off-box in CI and ship the artifact (`deploy-aws.yml` already
   builds a Docker image).

---

## 8. Verification after deploy

```bash
npx prisma migrate status          # all 3 applied
curl -sf localhost:3000/api/health
bash aws/cron/install-cron.sh --verify   # 13 endpoints, all 200
```

Then, in the app:

- [ ] Nurse eMAR shows a **dose** on each row (it used to read "N/A" everywhere).
- [ ] Record vitals on a test patient → NEWS appears, and the notification bell
      fires for ward staff.
- [ ] Log in as a nurse → `/doctor/dashboard` redirects away.
- [ ] `/ipd/care-record` and `/ipd/incidents` load.
- [ ] Discharge a stable patient normally; check the bed shows "Cleaning" **with**
      a `cleaning_started_at` timestamp.
- [ ] Bed availability after the first hourly cron run matches §6.

---

## 9. Rollback

Nothing in this release migrates or rewrites existing data, so rollback is a
**code rollback only**:

```bash
git checkout <previous-commit> && npm ci && npm run build
pm2 reload ecosystem.config.js
```

The added columns and tables can stay — the previous build ignores them. Remove
the three new crontab lines if rolling back, since the old code answers 307 to
them.

---

## 10. Known limitations — not fixed in this release

Stated plainly so they are not discovered as surprises.

- **IPD dashboard is ~3.95s** on a production build (down from ~8s). What remains
  is dominated by per-round-trip latency to the database (~126ms measured against
  the demo Supabase pooler). Co-located production infrastructure (EC2 + RDS, same
  region) has far less to absorb, so this should be materially faster on live —
  but that has **not** been measured on production hardware.
- **`/ipd/bed-matrix` has a React hydration warning.** Pre-existing, reproduces
  with this branch reverted, not investigated here.
- **Migration drift:** `20260720000000_add_voice_call_assistant_fields` exists on
  the demo database but **not in this repo**. Pre-existing, not introduced here,
  but the branches should be reconciled before the next production deploy.
- **`/api/cron/pill-reminders` and `/api/cron/depreciation`** remain unscheduled
  for the reasons documented in `aws/cron/hospitalos-crontab`.
- **Phase 2 screens are new and unused.** The eight nursing records work and are
  tested, but no ward has entered real data into them yet. Expect field feedback.

---

## 11. Testing evidence

Everything below was run against the demo database and all test data reverted.

| Suite | Result |
|---|---|
| NEWS2 scoring (unit, vs RCP chart) | 42 / 42 |
| Transfusion bedside checks (unit) | 4 / 4 |
| Allergy block + override (end to end) | 6 / 6 |
| Controlled-drug co-signature | 4 / 4 |
| Doctor → nurse → lab order loop | 10 / 10 |
| Discharge gating + override audit | 7 / 7 |
| MAR horizon + discharge closure | 5 / 5 |
| 2-hour assessment loop + handover | 7 / 7 |
| Phase 2 capabilities (end to end) | 16 / 16 |
| IPD dashboard correctness vs database | 7 / 7 |
| Page smoke test | 70 pages, 0 crashes |
| `npx tsc --noEmit` / `next build` | clean |

`npm run check:server-actions` was added this release: a sync export from a
`'use server'` module 500s every page that imports it, including `/api/session`,
which breaks login app-wide. It caught that mistake twice during development.
Worth adding to CI.
