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

## 4. Two-key control

The generator requires **both** keys. Either alone is inert.

| Key | Set by | Purpose |
|---|---|---|
| `SIM_ENABLED=1` + `SIM_ORG_ID=<uuid>` | Deploy environment | Infrastructure lock. Absent in every real deploy, so the engine cannot run there at all. |
| `activity_generator_enabled` + `activity_generator_intensity` | Superadmin → Organization → Config | Operator control. Lets staging admins start/stop and set volume without a redeploy. |

The Config tab reads back the live environment state so an operator can see whether the
infrastructure lock actually permits this org — a DB toggle on an org the environment forbids
would otherwise look enabled while doing nothing.

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

`npx tsx scratch/t-tick.ts` drives 12 ticks across ~12 simulated hours and asserts 14 invariants —
all passing as of 2026-08-31 (105 patients, 9 admit→discharge cycles, 108 invoices/payments,
443 audit rows):

- every stage advances; lab results populate; beds complete Available → Occupied → Cleaning →
  Available
- every discharge has both a summary and an IPD bill
- invoice headers reconcile with their line items; payments equal invoice net amounts
- every payment names a cashier
- **every non-Auth audit row is attributed to a user with a LOGIN on record**
- no bed sits Occupied without a live admission
- no record anywhere carries marker text

### Still not generated

Nursing notes, vitals/NEWS2, eMAR administrations, TPA/insurance claims, deposits, GL journal
entries, OT cases. Nursing and vitals are the most likely next gap if a ward screen is on camera —
note that vitals must be written through `app/lib/vitals-recording.ts` to dual-write `IPDVitals`
and `vital_signs`.

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
