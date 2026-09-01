# Background Activity Generator — Architecture Plan

> **Status:** Phases 0 and 2 built and verified · **Owner:** production tooling · **Last updated:** 2026-08-31
> **Target org:** Meridian General Hospital · `SIM_ORG_ID=fa970176-4b2b-4018-9a71-4814be7ec87f`
> **Scope:** staging only. Generates synthetic hospital activity (registrations, OPD flow,
> lab orders, pharmacy indents) so screens are populated and moving for on-camera use.

---

## 0. Non-negotiables

| Rule | Where enforced |
|---|---|
| Nothing identifying the data as synthetic reaches a staff/patient portal or a printed document | Design rule — no prefixes, banners, watermarks, or name conventions |
| Generated identity numbers can never collide with a real person's | `scripts/sim/cast.ts` — checksum-invalid Aadhaar/ABHA |
| The engine can only write to one designated organization | `scripts/sim/guard.ts` + `getTenantPrisma(orgId)` |
| The engine cannot run unless the environment explicitly permits it | `SIM_ENABLED=1` + `SIM_ORG_ID` |

**Marker placement.** "No markers" is a constraint on *rendered output* — the actors' screens and
the props. Code identifiers, file paths, environment variables, database column names and the
**Superadmin** control surface use plain, honest names. Superadmin sits behind its own
`superadmin_session` cookie in a separate portal and is never on camera; an unlabelled or
euphemistic toggle there is how someone eventually enables this against the wrong data.

---

## 1. Deployment context

- Runs on a **dedicated staging deploy** against a **cloned RDS instance**.
- The clone carries real organizations with it — including `org-axten-production`. A snapshot
  restore does not sanitise ids, so org identity is the primary safety boundary, not the hostname.
- Consequence: the guard does **not** test the database hostname (that would block the legitimate
  staging deploy). It asserts positively on `SIM_ORG_ID` and denies the known real org ids.

---

## 2. What already exists (do not rebuild)

| Need | Existing implementation |
|---|---|
| Per-org write isolation | `getTenantPrisma(orgId)` — `backend/db.ts`, auto-injects `organizationId` on reads *and* writes |
| Authentic document numbers | `app/lib/sequence-generator.ts` — `{ORG}-{TYPE}-{FY}-{seq}`, `createWithUniqueRetry()` |
| Scheduling, auth, route bypass | `app/api/cron/*` + `CRON_SECRET` + `proxy.ts` |
| Correct day boundaries per org timezone | `app/lib/timezone.ts` — `getTodayRange(tz)`, `getOrgTimezone()` |
| Name/address/diagnosis pools | `scripts/seed-demo-org.ts` |
| Isolated-org create + `--reset` | `scripts/seed-demo-org.ts` (insert-only, idempotent) |

The engine is a handful of files, not a framework.

---

## 3. File layout

```
scripts/sim/guard.ts              environment + org lock              [done]
scripts/sim/cast.ts               identity generation                 [done]
scripts/sim/bootstrap-org.ts      creates the target org + stage      [done]
prisma/migrations/20260831000000_add_activity_generator_config/
                                  organization_configs columns        [applied]
app/superadmin/…/tabs/ConfigTab.tsx
                                  operator toggle + intensity         [done]
app/lib/sim-tick.ts               the state machine                   [done]
app/lib/sim-staff.ts              duty roster, sessions, audit        [done]
app/api/cron/sim-tick/route.ts    route wrapper, 404 unless enabled   [done]
scratch/t-tick.ts                 regression harness (gitignored)     [done]
```

`guard.ts` and `cast.ts` live under `scripts/`; the `@/*` alias maps to the repo root, so the cron
route and `app/lib/sim-tick.ts` import them directly.

`bootstrap-org.ts` creates the *stage* — organization, staff, departments, wards, beds, lab menu,
formulary — and nothing else. Patients and visits come only from the ticker, so they accumulate at
a believable rate. `--reset` clears generated activity and leaves the stage standing.

**No new Prisma model.** Run state lives in the domain status columns that already exist —
`appointments.status`, `lab_orders.status`, `pharmacy_orders.status`. No migration, no
`TENANT_SCOPED_MODELS` entry, and nothing that could ever surface in a query result on screen.
The only schema change is the operator config on `organization_configs`.

---

## 4. Three-key control

All three must agree. Any one of them failing stops the engine.

| Key | Set by | Purpose |
|---|---|---|
| `SIM_ENABLED=1` | Deploy environment | Master switch. Absent in every real deploy, so the engine cannot run there whatever the database says. |
| `organization_configs.simulation_enabled` | Superadmin → Add Hospital | Classifies the org as a simulation environment. Lets several exist without pinning a UUID into the deploy. |
| `activity_generator_enabled` + `_intensity` | Superadmin → Organization → Config | Operator control. Start/stop and volume, no redeploy. |

`SIM_ORG_ID` is now an **optional pin**: set it and the engine is restricted to that one org even
if others carry the flag; leave it unset and every flagged org is eligible. The cron route advances
all eligible environments in one pass, sequentially — parallel ticks against the shared pooler
would let one slow environment starve the rest.

`PROTECTED_ORG_IDS` is checked **before and independently of** the flag. A restored production
snapshot carries both the organization and its config row, so a flag alone must never be able to
authorise writes to a real hospital's tenant.

The Config tab reads all three back, so an operator can tell "switched off" from "switched on but
this deploy will not run it".

## 4a. Running it

The engine has no internal loop — it advances only when something calls it. `scripts/aws-cron-setup.sh`
registers `*/5 * * * * /api/cron/sim-tick`, so a server that has run that script pokes it every five
minutes for as long as the instance lives. Re-run the setup script only when the instance is
rebuilt.

Cron calls unconditionally; the tick itself decides whether to do anything. With the toggle off it
returns `{ ran: false, reason: 'disabled…' }`. **Start and stop from Superadmin → Config, never by
editing the crontab.**

Manual poke, for testing:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<server>/api/cron/sim-tick
```

Roughly 9 arrivals/hour at the busiest hour on `moderate`, near zero overnight, ±30% by day.
First completed consultation ~50 min after switch-on; first discharge with a final bill ~2.5 h.
There is no historical backfill, so aged reports stay thin until the engine has been running for a
while — switch it on well before a shoot.

## 4b. Provisioning a simulation environment

**Superadmin → Add Hospital → step 4 (Admin Account) → "Create as Simulation Environment"**, then
pick a hospital under "Clone Staff From". On submit, `createOrganization()`:

1. creates the org, config (`simulation_enabled: true`, generation **off**) and branding;
2. clones every active user from the source hospital.

| Field | Cloned as |
|---|---|
| `username` | `sim.` + original — usernames are globally unique |
| `password` | **one generated hash shared by all clones** (`user@123`) |
| `role`, `name`, `specialty`, `designation`, `department`, `gender`, `qualifications` | copied |
| `working_hours`, `working_days`, `slot_duration`, `max_patients_per_day` | copied — drives the engine's shift timing |
| `consultation_fee`, `follow_up_fee` | copied — drives generated OPD billing |
| `email`, `phone` | **null** — nothing the engine does can reach real staff |
| `branch_id`, `assigned_ward_id`, `supervisor_id`, `doctor_group_id` | **null** — FKs into the *source* org's rows |
| `employee_code`, `doctor_registration_no` | **null** — identifiers belonging to a real person |

**Source password hashes are deliberately not copied.** Cloning them would hand a film crew working
credentials for real employees, whose accounts carry the same password on the production database
this staging DB was cloned from. The shared generated credential serves the same purpose — the
wizard shows it once, after provisioning.

Existing clone usernames are skipped rather than aborting the batch, so re-cloning from a source
already used does not lose everything.

Intensity maps to an arrivals multiplier applied to the hourly curve:
`low ×0.4 · moderate ×1.0 · high ×2.5`.

---

## 5. Realism model

What breaks the illusion, ranked by how likely a camera catches it:

1. **Empty screens.** "No records found" kills a shot. Addressed by run duration and intensity
   rather than a historical dump — see §6.
2. **Incoherence in close-up.** A lab order whose `patient_id` resolves to nothing; an
   `indent_number` in a format no other document uses; a bill total that disagrees with its line
   items. Addressed by routing every write through the real generators — `generateSequentialNumber()`
   for numbers, `billing-engine.ts` for totals. Never hand-format an identifier.
3. **Uniform timestamps.** Everything on the hour, evenly spaced. Real arrivals are bursty —
   jitter every `created_at`, cluster 2–4 arrivals then leave a gap.
4. **Static screens during a take.** The only part that actually needs the ticker.
5. **Date boundaries.** A "Today's OPD" list that renders empty because of a UTC/IST mismatch.

### Tick shape

```
tick(now) →
  0. roster      reconcile shift windows against the audit log → LOGIN / LOGOUT rows
  1. arrivals    sample hourly curve × intensity → register N patients
  2. transitions rows older than dwell(status) advance one step
                   OPD:      Scheduled → Checked In → In Progress → Completed
                   lab:      Pending → Processing → Completed (+ result value)
                   pharmacy: Pending → Verified → Completed
                   IPD:      Admitted → Discharged
                   beds:     Available → Occupied → Cleaning → Available
  3. branches    p(lab|consult) 0.40 · p(pharmacy|consult) 0.55 · p(admit|consult) 0.09
```

`dwell()` returns a jittered duration per status so nothing transitions in lockstep.

### Module coverage

| Module | What the engine creates |
|---|---|
| Reception / OPD | `OPD_REG`, `appointments`, queue tokens |
| Billing | OPD fee invoice + `invoice_items` + `payments`, collected at check-in |
| Lab | `lab_orders` → result value, critical flagging, technician attribution |
| Pharmacy | `pharmacy_orders` + `pharmacy_order_items` → verified → dispensed |
| IPD | `admissions` (`{ORG}-ADM-{FY}-{seq}`), bed occupancy |
| Discharge | `discharge_summaries` (NABH-style prose, `prepared_by`) |
| Finance | IPD final bill — bed-days, nursing, consultant lines + matching payment |
| Beds | Occupied → Cleaning (`cleaning_started_at` stamped) → Available |
| Auth / audit | `system_audit_logs` LOGIN/LOGOUT per shift + one row per clinical action |
| Ward care | `IPDVitals` + `vital_signs` mirror, NEWS scoring, `NursingNote` |
| eMAR | `ActiveMedication` prescriptions + `MedicationAdministration` (given / refused / omitted) |
| Deposits | `PatientDeposit` admission advances, `collected_by` set |
| Insurance / TPA | `insurance_policies` at registration, `insurance_claims` → approved / short-paid / rejected |
| General Ledger | `GL_JournalEntry` + `GL_JournalLine` — receipts and revenue, always balanced |
| ER | `triage_results` with Red/Orange/Yellow/Green levels |

### Realism rules

| Rule | Where |
|---|---|
| Shifts follow the person, not the role | `isOnDuty()` parses `User.working_hours` ("09:00-17:00"), honours `working_days`, falls back to the role table when blank or malformed — this is what makes cloned staff inherit the source hospital's real roster |
| One workstation per person, forever | `workstationIp()` — FNV-1a over the username, `10.20.{vlan}.{host}` |
| Shift start/end jitter, different each day | `shiftOffsetMinutes(username, dayKey)` — fixed part + per-day part |
| Busy days and quiet days | `dailyVolumeMultiplier()` — 0.72–1.28, keyed on the date |
| Plausible role substitution | `ROLE_FALLBACKS` — finance falls back to ipd_manager/reception/admin, never to a pharmacist |
| Insured patients admit more readily | `P_ADMIT_AFTER_CONSULT × 2.6` for `tpa_insurance` |

**All per-day randomness is derived from `hash(key + dateString)`, never `Math.random()`.** This is
load-bearing, not neatness: staff session state is read back out of the audit log, so an offset that
moved between ticks would make users flap between logged-in and logged-out on every tick and write a
nonsense trail. Stable within a day, different across days.

### Attribution

The brief asked for `created_by` on every generated record. **That column does not exist on
`invoices` or `admissions`** — attribution lives in specific fields instead, and the engine fills
every one that exists:

| Field | Filled with |
|---|---|
| `payments.received_by` | on-duty `receptionist` (OPD) or `finance` (IPD) username |
| `discharge_summaries.prepared_by` | attending doctor's username |
| `admissions.doctor_name` / `attending_doctor_id` | consulting doctor |
| `admissions.fit_for_discharge_by` | attending doctor's username |
| `invoices.doctor_id` / `doctor_name` / `approved_by` | doctor + finance username |
| `lab_orders.assigned_technician_id` | on-duty `lab_technician` username |
| `beds.last_occupied_by` | patient UHID |
| `system_audit_logs.user_id` / `username` / `role` | the acting staff member |

**Actions are only ever attributed to staff currently on shift.** `actorFor()` picks from the
on-duty set, so the log never shows a receptionist registering a patient at 03:00, or an action by
an account with no preceding LOGIN. Session state is derived from the audit log itself — the most
recent LOGIN/LOGOUT row per user — keeping the no-run-state-table rule intact.

---

## 6. Historical backfill — deferred

A 60–90 day backfill was considered and **dropped for now** at the production's request: the engine
should be observed generating naturally first, without a large historical dump obscuring what it
is actually doing.

Consequence to revisit: aged reports (TPA aging, MIS rollups, income & expense trends, month-on-month
comparisons) will be thin or empty until the engine has run for a meaningful period. If any of those
screens are needed on camera, either run the engine well ahead of the shoot or reinstate the backfill.

---

## 7. Identity generation rules

Generated identities must be *unclaimable*, not merely plausible. All of this is invisible at any
resolution a camera can resolve.

- **Aadhaar** (`OPD_REG.aadhar_card`) — 12 digits, leading digit 2–9, **deliberately failing the
  Verhoeff checksum**. A checksum-valid Aadhaar on a cinema screen is potentially a real citizen's
  national ID; an invalid one is visually identical and cannot collide.
- **ABHA** (`OPD_REG.abha_number`) — 14 digits, same Verhoeff treatment, `xx-xxxx-xxxx-xxxx` display.
- **Phone** — 10 digits, leading 6–9, so every validation regex in the app passes.
- **Names** — pooled from `scripts/seed-demo-org.ts`, combined so as not to reproduce a real person.

### Open item: phone number clearance

India has **no reserved fictional range** equivalent to the North American `555` block, and no
public register that lets this repo certify a given prefix as permanently unallocated. Numbers are
therefore drawn from a **single named constant block** (`PHONE_BLOCK` in `scripts/sim/cast.ts`),
overridable via `SIM_PHONE_BLOCK`, so that when legal clears a range it is a one-line change.

**This is not a legal clearance.** Any number shown legibly on screen should be cleared by the
production's legal team before the shoot.

---

## 8. Codebase traps that apply to this build

From `LLM_INDEX.md` §14–15 and `CLAUDE.local.md`, filtered to what the generator actually touches:

- **Timezone.** Two traps, both hit during the build:
  - `getOrgTimezone()` calls `requireTenantContext()`, which needs a **session**. A cron route has
    none, so it always falls through to the default. The tick reads `timezone` from
    `OrganizationConfig` directly instead.
  - The hourly curve needs the *current hour in org time*, which `getTodayRange()` does not give.
    `Date#getHours()` would read the host clock — UTC on staging, IST for the org — putting the
    morning OPD peak in the middle of the night. `sim-tick.ts` derives hour and weekday via
    `Intl.DateTimeFormat` with an explicit `timeZone`.
- **`getTodayRange()` is wrong on a non-UTC host** (`app/lib/timezone.ts:38-40`). It builds
  `new Date(\`${dateStr}T00:00:00\`)` with no `Z`, so the string parses in the *host's* zone before
  the offset is subtracted. Correct on the UTC deploy box, 5.5h off on an IST dev machine. Fix is
  one character in two places — append `Z` to both literals. Not applied: it is shared code with
  many callers and wants its own change. The daily arrival cap is the only thing here that uses it.
- **`'use server'`.** `app/lib/activity-tick.ts` is a plain lib and must stay one. If it ever gains
  `'use server'`, exporting the hourly-weight constant crashes `/api/session` and breaks login
  app-wide.
- **Sequence races.** The engine creates numbered records while a human clicks the same UI. Wrap
  every `generateSequentialNumber` + `create` pair in `createWithUniqueRetry()` or expect P2002s
  mid-take.
- **Audit `module`.** `logAudit()` without `module` silently drops the insert.
- **Prisma `include` fan-out.** ~126 ms per round trip on the pooler; a nested include over a few
  hundred patients turns one tick into minutes. Fetch lookup tables once, stitch in JS.
- **Beds.** No `bed_type` column — `bed_name` + `bed_category`. Selecting a column that does not
  exist renders an *empty list*, not an error, so a bed board silently goes blank on camera.
- **Bed cleaning.** Stamp `cleaning_started_at` on entry to Cleaning or beds strand permanently.
- **`proxy.ts`.** The Phase 3 cron route needs an explicit bypass entry; `CRON_SECRET` is quoted in
  `.env` and the quotes must be stripped.

---

## 9. Phases

- **Phase 0 — safety rails + operator control.** ✅ Done. `guard.ts` self-check covers the refusal
  cases including `SIM_ORG_ID=org-axten-production`.
- **Phase 2 — the ticker.** ✅ Built and verified against the DB, now covering OPD, billing, lab,
  pharmacy, IPD, discharge, bed turnaround and the staff audit trail. See **Verification** below.
- **Phase 1 — casting review.** ⬜ Outstanding, and now the critical path: legal sign-off on
  `SIM_PHONE_BLOCK`, and the name pool cleared for broadcast.
- **Phase 3 — shot list.** ⬜ A JSON file of scripted beats ("14:32 — trauma arrival, ward 3").
  File, not table. Build only if the director asks.

### Verification

`npx tsx scratch/t-tick.ts` drives 12 ticks across ~12 simulated hours and asserts **25 invariants —
all passing** as of 2026-08-31 (104 patients, 10 admit→discharge cycles, 114 invoices/payments,
70 observation sets, 38 nursing notes, 120 journal entries, 745 audit rows).

`npx tsx app/lib/sim-staff.ts` self-checks the deterministic pieces with no DB: workstation
stability and uniqueness, shift offsets constant within a day but moving across days, and the daily
volume multiplier's range and spread.

Invariants asserted:

- every stage advances; lab results populate; beds complete Available → Occupied → Cleaning →
  Available
- every discharge has both a summary and an IPD bill
- invoice headers reconcile with their line items; payments equal invoice net amounts
- every payment names a cashier
- **every non-Auth audit row is attributed to a user with a LOGIN on record**
- no bed sits Occupied without a live admission
- no record anywhere carries marker text
- **every GL journal entry balances**, and its header totals equal its own lines
- every NEWS score recomputes to the value stored on the observation
- every claim references a policy that exists
- each staff member's workstation IP never drifts across sessions

### Still not generated

**OT (Operation Theatre) — deliberately excluded.** OT is mid-rebuild on branch `fix/ot-phase0`,
and `OT_CONTEXT.md` requires reading it before touching anything under `app/ot`,
`app/actions/ot-actions.ts` or the OT models. Generating against main's OT schema risks writing
rows the rebuild then has to migrate or discard. Do this once that branch lands, or on that branch.

Also untouched, and not a short list: HR/payroll, asset register, CRM, call centre, counselling,
radiology, help centre, feedback, budgets, expenses, purchase orders/GRN, doctor commission
payouts, Tally export, GST returns. "Every module" is a much larger surface than the eight named in
the brief — those eight are done; the rest are individually small but each needs its own schema
pass to stay coherent.

### Documentation drift found while building this

`CLAUDE.local.md` §2 and `LLM_INDEX.md` §12 both instruct that clinical logic lives in shared libs
and must be called rather than duplicated. **Six of those files do not exist on main:**
`vitals-recording.ts`, `news2.ts`, `medication-safety.ts`, `escalation-policy.ts`,
`discharge-readiness.ts`, `drug-classes.ts`. They exist only on the unmerged
`fix/nursing-module-hardening` branch. On main the scoring and dual-write are inline in
`app/actions/ipd-nursing-actions.ts`.

`sim-ward.ts` therefore mirrors main's inline `calcNEWS()` — including its omission of the +2
supplemental-oxygen modifier the real RCP score requires. Matching the app beats matching the
standard here: a ward screen showing a NEWS value the software itself would never compute is worse
than a slightly wrong one. **When that branch merges, delete `calcNews()` from `sim-ward.ts` and
call the shared lib.**

### Reset

`npx tsx scripts/sim/bootstrap-org.ts --reset` clears payments → invoice items → invoices →
discharge summaries → pharmacy → lab → admissions → appointments → patients → audit rows, returns
every bed to Available with cleaning stamps cleared, and switches generation off. The stage
(staff, wards, beds, catalogues) survives.

---

## 10. Deliberately not built

- No run-state table — domain status columns carry it.
- No scheduler dependency — `setInterval` locally, the existing cron pattern on staging.
- No scenario DSL or config-driven probability engine. Probabilities are constants in one file
  until someone needs to tune them without a deploy.
- Not routed through `app/actions/*` — the ticker writes via the tenant Prisma client directly.
  Server Actions are serialised per client and carry role guards the engine has no session for.

---

## 11. Index maintenance

Phase 2 adds a cron route and a shared lib, which under `LLM_INDEX.md` §17 requires proposing an
update to that file. Ask before writing to it.
