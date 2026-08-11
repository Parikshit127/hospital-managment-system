# OT Module — Working Context

> Live working memory for the Operation Theatre rebuild. Read this first when
> picking the work back up, and keep it current in the same commit as the change.
>
> Branch: **`fix/ot-phase0`** · 33 commits ahead of `origin/main` · **nothing pushed, nothing merged**
> Last updated: **2026-08-08** · Next up: **DESIGN.md for the dashboard & reports, then Phase 3**
> Companions: `OT_MODULE_FINDINGS.pdf` (original 30-finding audit),
> `OT_PACKAGE_MAPPING_GUIDE.pdf` (admin worksheet, built from LIVE),
> `FINDING_package_exclusions_never_match.md` (handed off, not ours to fix).

---

## 1. Why this work exists

OT was built in Phase 2 of `HIMS_UPGRADE_MASTERPLAN.md` to close a KareXpert
feature-parity gap. It was faithful to the plan document and never to a
surgeon's day.

**Verified on the LIVE server (13.234.242.13, 7 Aug):** 0 OT rooms, 0 surgery
requests, 0 completed in 30 days. **OT has genuinely never been used in
production** — not just on the demo copy. So the schema changes land on empty
tables and there is no OT data to migrate.

**Nobody asked for this work.** The user's words: "this is us deciding it should
be complete." There is therefore no user feedback to design against, so the
anchors are (1) the hospital's own commercial model, read out of their
`IpdPackage` data, and (2) NABH + WHO.

**Resolved at the start of Phase 2 (do not re-open).** Raised a third time, with
the risk broken down per item rather than as a blanket warning, because the five
Phase 2 items were not equally exposed:

- **Aldrete is a published instrument** (Aldrete 1970, modified 1995) — five
  domains 0/1/2, discharge at ≥9. Zero design freedom. Safe to build.
- **Sponge/instrument counting is AORN/WHO standard practice.** Safe to build.
- **Implants and printables carry no clinical design content at all.**
- **The intraoperative anaesthesia chart was the one real exposure.** It is the
  anaesthetist's own document, differs by department, and a half-completed one
  is *worse* evidence than none, because gaps imply monitoring stopped.

Decision: **build the anaesthesia SUMMARY, not the chart.** Hospitals not on a
full electronic anaesthesia record keep the paper chart at the machine; the
summary is what the HIMS, the bill and a NABH file need. The recovery screen
says so on its face so the omission is never mistaken for an oversight. **A
surgeon/anaesthetist is still needed before anyone builds the intraop chart.**

---

## 2. The finding that reframed everything (resolved in Phase A)

OT invented a second surgical catalogue that fought the first. `IpdPackage`
holds the real surgical price list — **41 live at Axten, 201 at Avise** — while
`SurgeryMaster` has **never had a row in either org**. And the models were
opposite: `GSURG-005 Appendectomy - Lap.` is ₹48,000 whose inclusions list
"Surgeon Fees" and "Operation Theatre", while OT billed those itemised on top.

That is why nobody adopted it: switching OT on meant re-keying the price list
into a second master under a fee structure the hospital does not use.

**Fixed in Phase A.** OT no longer owns surgical pricing.

---

## 3. Open, handed off — package exclusions never match

`matchExclusion` in `app/lib/package-billing.ts` compares a charge's category
for exact equality with the exclusion string, or checks whether the description
contains it. Every package stores exclusions as prose ("Implants (charged as
per actuals + patient choice)", "Lab Tests"). Category `Lab` ≠ `lab tests`, so
**nothing matches and every excluded item is absorbed into the package.**

Demo measurements: Axten **2** `billable_extra` against **312**
`package_consumed`; ~₹5,600 of labs/X-ray absorbed. Avise ~₹41,236.

**Not ours to fix** — user chose to ring-fence it (option 3). Written up in
`FINDING_package_exclusions_never_match.md` with a runnable probe at
`scripts/check-package-exclusions.ts`.

**OT works around it:** implants post with an explicit
`disposition_override: CHARGE_DISPOSITION.BILLABLE_EXTRA`. Marked in
`ot-actions.ts` for removal once the matcher is fixed.

---

## 4. What is done — Phases 0, 1, 1.1, A

Everything below was verified by **running it**, plus four independent manual
test rounds by the user which found three real defects I had missed.

### Phase 0 — make it trustworthy
`invoice_id` String?→Int? (posting threw on every call, after writing the
charges) · posting idempotency (2 clicks = 6 rows, ₹45,000 twice) · role guards
on all 26 actions (there were none; `requireTenantContext()` accepts **patient**
sessions) · signatures from session not client · admission auto-resolved (the UI
never set it, so OT revenue reached no bill) · cancel releases the theatre slot ·
reject ≠ cancel · IST day boundaries · request numbers gap-safe + per-tenant ·
surgeon/patient conflict checks.

### Phase 1 — the safety spine
Patient identity + allergies on all 9 screens · laterality + surgical site ·
**clinical gates** (PAC + WHO checklist are now conditions of proceeding; you
could previously operate with neither) · checklist phases lock on signing ·
`SurgeryConsent` keyed to the surgery.

### Phase 1.1 — from the user's test round
Modal overflow · overrun slots show "Overdue 45 m" (worklist **and** calendar,
shared `slotState`) · readiness chips on the card, now click-through · admission
re-resolved at scheduling · requesting doctor pre-filled as Primary Surgeon ·
worklist status filters · fee fields disabled when a package is chosen.

### Phase A — economic coherence
OT stops billing surgeon/anaesthesia/OT when the admission carries a package
("Covered by package: X — extras only") · implants bill as `billable_extra` ·
`SurgeryMaster.ipd_package_id` links the catalogue to the real price list, and
the fee fields lock when a package is chosen so a second price cannot be
entered · **day-care/OPD surgery now bills to an OPD invoice** instead of
refusing ("patient has no active admission") and vanishing.

### Phase 2 — the surgical record
Everything below verified by running it end to end against the demo DB.

- **Surgical count** (`SurgeryCount`). Gives the WHO Sign Out's "counts are
  correct" line something to be correct about. Per stage, per item class,
  `{added, counted}` — so a pack opened mid-case raises the *expected* total
  instead of firing a false alarm. Logic in `app/lib/surgical-count.ts`
  (10 assertions). Gate: completion needs a final count, and any discrepancy
  needs a recorded action. It does **not** require the count to balance —
  the surgery is over, and an unsatisfiable gate gets faked.
- **Specimen → histopathology** (`SurgerySpecimen`). Dispatch creates a real
  `lab_orders` row + `lab_sample_tracking` chain of custody on a shared
  barcode. **This was a revenue leak:** `lab-actions.ts` bills histopath on
  *result entry*, so no order meant no result meant no bill. OT does not bill
  it — that would double-charge. Frozen section → `is_critical`.
- **Anaesthesia summary** (`AnaesthesiaRecord`) — *not* the intraop chart, see §1.
- **PACU + Aldrete** (`PACURecord`, `AldreteScore`). `app/lib/aldrete.ts`
  (11 assertions). Discharge below 9 needs a recorded reason; **ICU/HDU are
  exempt — that is escalation, not discharge.**
- **Implants & consumables** (`SurgeryConsumable` extended). See §4a — the
  brief's premise was wrong and the fix is different from what was asked.
- **Printables** — 5 documents, 2 routes, using the existing letterhead system.
  `/api/ot/<id>/{operative-note,anaesthesia,consent,pac}` and
  `/api/ot/register?from=&to=[&room=]`.

### 4a. Phase 2's own reframing — the implant ledger is dead

The brief said "implant traceability with **real stock deduction**
(`SurgeryConsumable.itemMasterId`/`storeId` exist and are never populated)".
Probing first changed the answer. **It is the Phase A finding again, one module
over.**

The general inventory module is not under-used, it is **empty and unwired**:
`item_master`, `stores`, `store_stocks`, `item_batches`, `inventory_movements`,
`stock_issues`, `indents` — **0 rows in every org**, and **0 writers anywhere in
the app** (one reader in `lib/mis/registry/inventory.ts`). Deducting from it
would have decremented a fiction and looked like a feature.

The live ledger is the **pharmacy's** — 13,210 medicines, real batches, an
existing decrement path — and it already stocks OT consumables (PDS, Vicryl,
Prolene, Ethilon, suction catheters).

**And implants should never have been deductible.** They are *consignment*
stock: the vendor's rep brings the box, the hospital buys the one used. The
hospital's own package exclusion says it — "Implants (charged as per actuals +
patient choice)". You cannot deduct what was never in your stock. That is
almost certainly why those columns were never populated: **a mismatch, not
neglect.**

So: consumables link to pharmacy batches and **deduct once**
(`stock_deducted`); implants **deduct nothing** and instead require
manufacturer + lot (refused server-side), with `lot_no` indexed and
`traceImplants()` answering the recall question. `itemMasterId`/`storeId` were
**dropped**, not left as an invitation to repeat the mistake.

### Migrations (11 total, all applied to demo; none applied to live)
Phase 2 added five:
`20260807040000_surgery_counts` · `20260807050000_surgery_specimens` ·
`20260807060000_anaesthesia_record` · `20260807070000_pacu_aldrete` ·
`20260807080000_implant_traceability` (**drops two columns** — safe, the table
is empty in both orgs)

Phases 0–A added six:
`20260806000000_surgery_billing_invoice_id_int` ·
`20260806010000_surgery_request_number_per_org` ·
`20260807000000_surgery_laterality` · `20260807010000_surgery_consent` ·
`20260807020000_surgery_billing_package_aware` ·
`20260807030000_surgery_master_package_link`

### New files
`app/ot/components/PatientIdentity.tsx` (PatientCell, PatientHeader,
AllergyBanner, SiteBadge, EncounterBadge, slotState, patientLine) ·
`scripts/check-timezone.ts` · `scripts/check-package-exclusions.ts` ·
`scratch/ot-status.js`, `scratch/ot-cleanup.js` (gitignored)

Phase 2: `app/lib/surgical-count.ts` · `app/lib/aldrete.ts` ·
`app/ot/components/{SurgicalCount,SpecimenDispatch,ConsumableEntry,PrintLinks}.tsx` ·
`app/ot/recovery/[surgeryId]/page.tsx` ·
`app/api/ot/[surgeryId]/[doc]/route.ts` · `app/api/ot/register/route.ts` ·
`scripts/check-surgical-count.ts` · `scripts/check-aldrete.ts` ·
`scripts/check-tenant-scoping.ts`

### Found and fixed en route — a whole class of tenant-scoping bug
`TENANT_SCOPED_MODELS` in `backend/db.ts` had **six wrong entries**. The known
rule is "a model *with* `organizationId` MUST be listed or it leaks". **The
inverse is just as sharp and much quieter:** a model listed *without* the column
makes the extension inject `where.organizationId`, and Prisma rejects the query.
The action's `try/catch` turns that into a puzzling toast, and nothing points at
the model list.

- **No `organizationId` (every read threw):** `SurgeryBilling` — so
  `updateSurgeryBillFees` failed **100% of the time**, undetected because Phase A
  tested the *package* path where fees are locked · `ICD10Master` (a global WHO
  table — all three callers in `icd10-lookup-actions.ts` were dead) ·
  `CRMActivity`.
- **No such model (matched nothing):** `billing_records`, `OPDConfig`,
  `PreAuthorization` (stale name for `InsurancePreAuth`, which *is* listed — no
  leak, but exactly how a rename goes quiet).

Fixed by correcting the list, not the schema: all three models are designed
right. **`npx tsx scripts/check-tenant-scoping.ts`** now makes this checkable
instead of folklore, and warns on the leak direction too. **CI-ready
(exits non-zero).**

---

## 5. Decisions taken — do not silently reverse

1. **Emergency override on the clinical gates.** A gate with no escape hatch is
   its own hazard: in a crash laparotomy the team will fabricate a PAC rather
   than stop, and then the record lies. Only `Emergency` urgency, reason
   mandatory, audited as `OT_GATE_OVERRIDE`. User: "keep it as it is."
2. **Consent owned by the surgery, not the admission** (user chose Option B).
   `PatientConsent_IPD` is admission-keyed and would miss day-care/OPD.
3. **Consent is upsert-on-(surgery, type)** — corrections, not duplicates.
   Open UX gap: no on-screen trace that a record was amended.
4. **Laterality required with an explicit "Not applicable."** The danger with
   wrong-site surgery is silence.
5. **"Day-care / OPD" warns, never blocks** — those surgeries are legitimate.
6. **Overrun state derived from the clock, not stored** — no sweeper can lag.
7. **No unique index on (admission_id, source_module, source_ref_id)** —
   pharmacy uses `Date.now()` and package flows repeat refs.
8. **Kept `SR-YYYYMMDD-NNNN` numbering**, not the FY finance format.
9. **No catalogue pagination** — search beats it, and the master is thin now.
10. **Worklist stays in start-time order**, not newest-first: it is the
    theatre's running order. Filters solve "find my case" instead.
11. **Fee fields kept but locked** when a package is chosen — some procedures
    genuinely are fee-for-service; what matters is that both can't be set.

Phase 2 added seven more:

12. **The anaesthesia SUMMARY, not the intraoperative chart** (user chose it
    over three alternatives). See §1. A surgeon/anaesthetist is still required
    before anyone builds the chart.
13. **Counts gate on *recorded*, not on *correct*.** A final count must exist
    and any discrepancy must carry an action — but a wrong count does not block
    closing the case. The surgery is over; refusing to record it does not
    un-retain a sponge, and an unsatisfiable gate gets satisfied dishonestly.
14. **`counted` is never prefilled with the expected number.** A field
    pre-populated with the right answer is a field that gets tabbed past, and
    the entire point is that somebody physically counted.
15. **An item counted at Initial but absent at Final reads as MISSING**, not as
    fine. Silence is not agreement.
16. **Implants are traced, never deducted; consumables deduct from pharmacy.**
    See §4a. Chosen by the user over three alternatives.
17. **OT does not bill the specimen** — `lab-actions.ts` already charges on
    result entry, so billing here too would double-charge.
18. **Aldrete ≥9 needs no companion "no domain scored 0" check** — the best
    total containing a zero is 0+2+2+2+2 = 8, so the threshold already excludes
    it. One rule, nothing to drift out of step. Pinned by the self-check.
19. **ICU/HDU are exempt from the PACU discharge gate** — a ventilated patient
    scoring 3 is exactly who should be going there. That is escalation, not
    early discharge.

---

## 6. What is next

### Next up
- **DESIGN.md + rendered directions for the OT dashboard & reports.** Brief:
  manager at a laptop (desk tool, not a wall board), match the existing
  HospitalOS shell, no reference supplied, hero metric undecided. Diagnosis of
  "looks cheap": it is a KPI grid, not a theatre board; 8 equal-weight cards so
  nothing is important; quick-links duplicate the sidebar; zero-states read as
  broken; reports render a bar chart as text. **DESIGN.md must be approved
  before any UI code**, then one screen rendered at 1920/1440/1280/390.
- **Phase 3** — utilisation, turnaround, first-case-on-time, cancellation
  taxonomy, TPA pre-auth, surgeon commission.
- **Package mapping** — `OT_PACKAGE_MAPPING_GUIDE.pdf` is with the admin.

### Known gaps left deliberately
- **Package check reads the admission's package, not the surgery's.** Right in
  the common case, wrong for an unrelated second procedure. Needs the
  catalogue mapped before it can be tightened.
- **PAC quality is not validated** — "Fit" can be set without the airway
  assessment. User: leave as is.
- **Consent is recorded, not captured** — no signature image or scan.
- **147 of 201 live Avise packages are ₹0** (`HEGIC-*`). Mapping one makes that
  surgery bill nothing. Axten's 41 are all priced.

Added by Phase 2:
- **No intraoperative anaesthesia chart.** Deliberate, see §1 and decision 12.
  Needs an anaesthetist before anyone builds it.
- **The second count signer is attested, not authenticated.** A count is a
  two-person check but only one holds the session, so `verified_by` is a typed
  name. Real dual authentication would need a second login at the bedside.
- **Printables are HTML, not PDF binaries.** They rely on the browser's
  print-to-PDF, like every other document in this codebase. Only worth
  revisiting if something must attach a PDF without a browser.
- **No PACU worklist.** Recovery is reached per-surgery from the OT worklist;
  there is no "who is in recovery right now" board. Phase 3 material.
- **`traceImplants()` has no UI yet.** The action exists and is tested; nothing
  calls it. A recall search box belongs on the OT dashboard — which is
  blocked on DESIGN.md.
- **The Avise logo renders broken on printables** (`logo_url` does not resolve).
  Pre-existing branding data, visible in `scratch/print-*.png`. Not OT's.
- **Avise's "BIOPSY" lab test is priced ₹1** on demo — junk data, not a bug.

---

## 7. Environment traps — all hit at least once

- **Restart the dev server after `prisma generate`.** A running Next process
  holds the old client; queries throw and actions swallow it into an empty list.
  Hit **three times**.
- **An invalid Prisma schema shows as a dead port, not an error.** A missing
  opposite relation breaks `get-dmmf`, so the server never opens 3000 and
  `curl` returns `000`. `tsc` cannot catch it (relations used via `any` client).
  **Grep `prisma validate` for `valid|error` — do not read its tail.**
- **Never give the user inline `node -e "…$disconnect()…"`.** PowerShell eats
  `$disconnect`. Use `node scratch\ot-status.js`. Got this wrong twice.
- **Cleanup scripts must never touch a non-`Draft` invoice**, and must match
  `ZZTEST` only — a `ref_id startsWith 'OT-'` clause once deleted a line from a
  finalised pharmacy bill that had a payment against it. Delete invoice_items
  **before** charge postings, or the `invoice_item_id` link is lost and a live
  charge is orphaned on a real bill.
- **The branch moves outside the session** — check
  `git rev-parse --abbrev-ref HEAD`. A teammate's voice commit landed on it once
  and was later deduped by rebasing onto `origin/main`.
- **`TENANT_SCOPED_MODELS` membership cuts BOTH ways.** With `organizationId` and
  not listed → cross-tenant leak. Listed *without* the column → **every read
  throws** and the action swallows it into a confusing toast. Run
  **`npx tsx scripts/check-tenant-scoping.ts`** after any schema change; it
  catches both. All Phase 2 child models of `surgery_requests` deliberately
  carry no `organizationId` and are deliberately absent from the list.
- **`nvm` is NOT installed on this machine and Node is 24, not 22.** The
  CLAUDE.local.md instruction "use Node 22 (`nvm use 22`) before `npm run dev`"
  is **not actionable here**. Node 24 does emit the
  `controller[kState].transformAlgorithm` noise in the dev log, but the server
  serves fine and every Phase 2 test passed on it. Do not burn time hunting nvm.
- **The user may already have a dev server running that you did not start.**
  It holds `query_engine-windows.dll.node`, so `prisma generate` fails EPERM.
  Kill by port (`Get-NetTCPConnection -LocalPort 3000`) plus the `postcss`
  child, generate, then restart. Hit **twice** this session.
- **After a dev-server restart, the FIRST action call on a route can exceed a
  3.5 s Playwright wait** — Turbopack is compiling it. This looks exactly like
  a broken feature: the DB row appears but the screen does not update. It cost
  a false "read path is broken" diagnosis. Use ~6 s on the first interaction,
  and confirm against the DB before believing the screen.
- **Playwright `:below()` is not precise enough for a checkbox next to other
  checkboxes** — it silently ticked the wrong one and two assertions failed for
  a reason that had nothing to do with the code. Use
  `label:has-text("…") input[type="checkbox"]`, and never wrap the click in
  `.catch()`, which hides exactly this.
- **A negative assertion can match your own explanatory copy.** A check for
  "the intraoperative chart is absent" matched the screen's own sentence
  *"The intraoperative chart stays on paper"*. Assert on the absent UI
  (`EtCO2`, `MAC`), not on the absent phrase.
- **The classifier blocks deleting `system_audit_logs`** — ~10 `module='ot'`
  test rows remain on demo. Do not work around it.
- Test patients (demo/Avise): **ANANT GUPTA `AVS-2026-00110`** and **RAJ KUMAR
  `AVS-2026-00143`** are admitted with no package; **KAPALESHWAR
  `AVS-2026-00003`** is on the ACL package; **Yogita `AVS-2026-00001`** is not
  admitted. Prefix test data `ZZTEST`.
- `nurse.anita` is Axten; the Avise `nurse` account is disabled.

## 8. Live access

Read-only navigation of `http://13.234.242.13` was authorised and used once, to
read the package catalogue and confirm OT is unused. Rules followed: `goto()`
only, one click (the "Packages" tab, guarded by exact text), dialogs dismissed
never accepted, credentials never written to disk. **The live admin password is
in that session's transcript and should be rotated.** No writes were made to
live and no migrations have been applied there.
