# Company OS — Progress log

Plan: `docs/COMPANY_OS_PLAN.md` · Brief: `docs/ARCHITECTURE_BRIEF.md`

## Phase 0 — Stabilize  (started 2026-10-21)

**Principle for this phase:** live system. Everything shipped so far is additive and inert at runtime. Items that would change live behaviour are analysed below and deliberately **not applied** until reviewed as their own PRs.

### Done (no runtime behaviour change)

| Item | Files |
|---|---|
| ADR-001 … ADR-008 | `docs/adr/*.md` |
| Plan + brief saved | `docs/COMPANY_OS_PLAN.md`, `docs/ARCHITECTURE_BRIEF.md` |
| Guard-coverage check (Prompt A) | `scripts/check-action-guards.ts`, `scripts/guard-allowlist.json`, `scripts/guard-violations.json` (baseline), `npm run check:guards` |
| Scoped-model check | `scripts/check-scoped-models.ts`, `scripts/scoped-models-baseline.json`, `npm run check:scoped-models` |
| Both checks wired into CI | `.github/workflows/ci.yml` (after `lint:ci`, before `build`) |
| `FeatureFlag` model + helper (`access_engine`, default `legacy`) | `prisma/schema.prisma`, `prisma/migrations/20261021130000_feature_flags/migration.sql`, `app/lib/feature-flags.ts` |
| `requireStaffContext()` (staff-only, no patient fallback) — **unused so far** | `backend/tenant.ts` |

**Migration `20261021130000_feature_flags` is written but NOT applied.** Apply with `prisma migrate deploy` (never `migrate dev`). `getFlag()` / `getAccessEngineMode()` swallow a missing table and return the default, so the code is safe to deploy before the migration.

### Baselines recorded (the lists that may only shrink)

- **Server actions:** 1,146 exported functions in `'use server'` files → **STRONG 199 · WEAK 795 · NONE 152**.
  - NONE concentrations: `asset-management-actions` (22), `budget-actions` (21), `gl-actions` (12+), `approval-center-actions`, `doctor-actions` (ICD10/voice helpers), `emr-actions` (`searchICD10Codes`), `gst-compliance-actions`, `insurance-gl-actions`.
  - Run `npm run check:guards -- --report` for the full table (NONE first).
- **Unscoped tenant models:** 207 models have an `organizationId` column, 154 are registered in `TENANT_SCOPED_MODELS`, **53 are not** (e.g. `PatientNote`, `LabPanel`, `Writeoff`, `Referrer`, `ReferralCommission`, `DoctorCommission`, `DoctorServiceRate`, `Ticket`, `stores`, `item_master`, `store_stocks`, `radiology_imaging`, `report_jobs`, `HospitalBankAccount`, `UserUnitAccess`, `OrganizationConfig`). Run `npm run check:scoped-models -- --report`.
  - 6 names in the set have no `organizationId` in the schema (`CRMActivity, ICD10Master, OPDConfig, PreAuthorization, SurgeryBilling, billing_records`) — harmless, stale.

### Analysed, deliberately NOT applied (needs a decision / its own PR)

**1. Guards on `gl-actions`, `budget-actions`, `gst-compliance-actions`, `asset-management-actions`, `insurance-gl-actions`** — ✅ DONE (2026-10-21), see "Phase 0 — finance action split" below.

**2. Registering the 53 unscoped models in `TENANT_SCOPED_MODELS`**
Registering a model also makes the extension overwrite `organizationId` on `create`/`createMany` and add it to every `where`. Models queried cross-org on purpose (e.g. superadmin, `OrganizationConfig`, `UserUnitAccess`, cron rollups) would break. Needs a per-model review of callers; do it in small batches, patient-data models first (`PatientNote`, `PatientConsent`, `patient_external_records`, `radiology_imaging`, `LabPanel`).

**3. Route handlers** (plan Phase 0 item 4). Note: all of these sit behind the `proxy.ts` staff-cookie gate (they are not in its exempt list), so they are **not anonymous** — but none checks role or organization:
| Route | Finding | Suggested fix |
|---|---|---|
| `GET /api/inventory/stores` | raw `prisma.stores.findMany` with no org filter → every unit's stores to any logged-in staff | filter by `session.organization_id` |
| `GET /api/departments` | same, `prisma.department` | same |
| `POST /api/upload/patient-record`, `/expense-receipt` | S3 key built from **client-supplied `organizationId`** (defaults to `'default'`); no session check | take org from session; staff-only |
| `GET /api/files?key=patient-records/…` | signs any `patient-records/` key for any logged-in staff | require key prefix `patient-records/<session org>/` |
| `GET /api/tally-export/download` | not inspected beyond grep (org passed as parameter) | verify auth |
| `/api/mis/worker` | `x-worker-secret`; **allows all requests when `MIS_WORKER_SECRET` is unset** | fail closed in production |
| `/api/mis/export/[jobId]` | documents an org check (header comment) | verify in code |

Each fix is small, but the callers (MIS filter dropdowns, upload widgets) need a quick check that none relies on cross-org data or on a patient/public session before the change ships.

**4. `requireStaffContext()` adoption** — only meaningful together with a role/permission check; adopt per module in Phase 3 via `requireAccess`.

### Route-handler fixes: on hold (changed from the earlier recommendation)
Per the 2026-10-21 decision, the company runs many hospital units with a head-office unit that bills on behalf of the others, so cross-unit reads/uploads may be **intended** (e.g. MIS filter dropdowns for head-office users, uploading a record for another unit's patient). Org-filtering `/api/departments`, `/api/inventory/stores`, `/api/files` or the upload routes cannot be proven safe from code alone. They stay as documented findings until someone confirms the intended cross-unit behaviour per route. `/api/mis/worker` fail-closed is also held: if `MIS_WORKER_SECRET` is unset in production, failing closed would stop MIS exports.

### Not started in Phase 0
- Tenant-leak test suite (`tests/tenant-leak/*`) — no test runner is configured in `package.json` yet (no vitest/jest). Decide on a runner first.
- `check:migrations` lint (no `migrate dev`, hand-written SQL).
- Rate limits on public-by-design routes.

### Phase 0 gate status
`check:guards` in CI ✅ · `check:migrations` in CI ✅ · finance action split ✅ · tenant leak suite ❌ (needs a DB + a test runner) · model scoping ❌ (held) · route-handler fixes ❌ (held, needs cross-unit decision) → **Phase 0 not fully closed.**

## Open decisions (from plan §13) — still unanswered
Sold to other companies? · Company-per-hospital or multi-unit companies? · Login identifier · Contractor access to My Workspace · Payroll build vs integrate · Who owns access in each client company.

## Phase 1 — Access registry, no behaviour change  (2026-10-21) — code complete, awaiting review

Nothing at runtime reads any of this yet; `proxy.ts`, `session.ts`, `role-actions.ts`, `Sidebar.tsx` and `login/actions.ts` are untouched.

| Deliverable | File |
|---|---|
| Registry types (edge-safe) | `app/lib/modules/types.ts` |
| Module registry — 24 modules, 54 route prefixes, 53 legacy permission keys; `legacyGates` reproduce `ROLE_ROUTES`/`PERMISSION_ROUTES` in order | `app/lib/modules/registry.ts` |
| 16 system roles with the three diverging permission maps + both home-route maps preserved verbatim, `LEGACY-QUIRK` notes | `app/lib/access/system-roles.ts` |
| Verbatim sidebar snapshot (generated) | `app/lib/access/legacy-nav.ts` ← `scripts/gen-legacy-nav.ts` |
| Generators for every legacy map | `app/lib/access/legacy-maps.ts` |
| AST literal extractor (reads legacy maps without importing them) | `scripts/lib/extract-literal.ts` |
| Parity check — 9 maps incl. ordered ROLE_ROUTES; verified to fail on a deliberate mutation | `scripts/check-access-parity.ts` → `npm run check:parity` |
| Registry coverage check (route trees, duplicate prefixes, action files, permission strings, roles, dependency cycles) | `scripts/check-registry.ts` → `npm run check:registry` |
| Both wired into CI | `.github/workflows/ci.yml` |

Deviation from the plan: parity/coverage are `tsx` scripts, not `tests/*.test.ts`, because the repo has no test runner. Same pass/fail semantics; can be wrapped in vitest later.

### LEGACY-QUIRKS found (each needs a keep/fix decision before Phase 3)
1. `session.ts` vs `role-actions.ts`: receptionist loses `ipd.create/ipd.edit` in the roles UI but has them in `hasPermission()`.
2. `ot_manager`, `er_staff` exist only in `proxy.ts` + sidebar — absent from `session.ts`, `role-actions.ts`, the roles UI and the createUser Zod enum.
3. `coordinator`, `counsellor`, `call_center`, `crm_manager`: sidebar-only; no proxy gate, no permissions. `coordinator` is the only one with a login redirect, and `proxy.ts`'s own redirectMap lacks it.
4. `/crm`, `/call-center`, `/coordinator`, `/counselling`, `/me`, `/print-center`, `/notifications`, `/help-center` have no proxy gate: any logged-in staff can open them by URL.
5. `proxy.ts` `ROLE_PERMISSIONS` is a *view-only* subset of `session.ts` (+`ot.view/er.view/billing.view`), and its broad `*.view` fallback lets e.g. a doctor into `/finance` and a receptionist into `/ipd`.
6. `/opd` precedes `/opd-manager` in `ROLE_ROUTES`, so the `/opd` gate also catches `/opd-manager/*`.
7. Unknown roles land on `/admin/dashboard` after login (the `switch` default).

### Next
Phase 2 (Company/Employee/UserRole schema + backfill, hand-written SQL, **not applied**) is unblocked by the single-company decision. Phase 0 leftovers (guards on the five finance action files via service/action split; model scoping) remain open.


## Phase 0 — finance action split  (2026-10-21) — done, builds clean

The five finance files had **no auth at all** (raw `prisma`, org id taken from the caller), yet were called by pharmacy, deposits, expenses, insurance and two cron routes, so a plain session check would have broken live flows.

| Before | After |
|---|---|
| `app/actions/gl-actions.ts` (public POST endpoints, no auth) | implementation moved **unchanged** to `app/lib/finance/gl-service.ts` (not callable from the browser); `app/actions/gl-actions.ts` is now a thin guarded layer exposing only the 12 functions the finance pages call |
| `budget-actions`, `gst-compliance-actions`, `asset-management-actions`, `insurance-gl-actions` (no page ever called them) | moved unchanged to `app/lib/finance/*-service.ts`; **no longer server actions at all** |
| `tally-export-actions` | same split → `tally-export-service.ts` + guarded layer (5 functions) |
| `ipd-finance-actions` `postToGL` / `postChargeToGL` (public, unauthenticated GL posting, no external callers) | un-exported (now file-private) |

Guard used by the layers: `app/lib/access/legacy-guard.ts → requireLegacyRouteAccess('/finance')` = **the same decision `proxy.ts` makes for `/finance`** (flat role list, then the `*.view` fallback — via registry-generated maps, parity-tested). So every role that can open the finance screens today still can; patients, other realms and anyone without a staff session cannot. The session's unit overrides any client-supplied `organizationId` (the pages already send the session's own org from `/api/session`), and id-addressed calls check the record belongs to that unit first.

Callers re-pointed to the services: pharmacy, deposit, expense, finance, insurance-receipts, insurance-shortpay, ipd-finance, report-export, asset-register actions; the two cron routes; three verification scripts.

Result: server actions with **no** guard 152 → **29** (STRONG 199 → 252). Remaining NONE are pure helpers/delegates and the investor-realm auth actions. HR false positives removed by allow-listing `requireHr`/`requireStaff` (hr-core, patient-rejecting).

### Not changed on purpose
`reception-actions` `addPatientDues` / `processPatientPayment` delegate to `finance-actions` (`createInvoice`/`recordPayment`), which are still only `requireTenantContext`-guarded (WEAK). Tightening WEAK → role/permission is the Phase 3 per-module migration.

## Phase 2 — Org & identity  (2026-10-21) — code complete; **migration NOT applied; backfill NOT run**

| Deliverable | File |
|---|---|
| Additive schema: `Company`, `LegalEntity`, `OrgDepartment`, `Designation`, `RolePermission`, `UserRole`, `UserPermissionOverride`, `CompanyModule`, `AccessChangeLog`, `AccessShadowLog`; nullable `company_id` (+`unit_type`) on `organizations`, `company_id/home_app/access_version` on `users`, `company_id/unit_id/template_key` on `roles`, `company_id/org_department_id/designation_id` on `employees` | `prisma/schema.prisma` |
| Hand-written, idempotent SQL (generated from `prisma migrate diff`, then wrapped) | `prisma/migrations/20261021140000_company_os_phase2/migration.sql` (+ earlier `20261021130000_feature_flags`) |
| Backfill with dry-run default, `--apply --yes`, `--verify`, access diff, `--map` for multi-company | `scripts/backfill-company-os.ts` |
| Legacy roles screen hides the new templates (`template_key IS NULL`) and `seedSystemRoles` ignores them | `app/actions/role-actions.ts` |
| HR employee screen: company designation/department pickers (hidden until masters exist, ids validated against the employee's own company) | `app/actions/hr-actions.ts` (`listOrgMasters`, `updateEmployee`), `app/hr/employees/[id]/page.tsx` |
| Pure page-access decision shared by scripts and the guard | `app/lib/access/legacy-pages.ts` |

### Verified (local scratch Postgres, never the shared DB)
- SQL applied to a DB built from the **previous** schema, then `prisma migrate diff` DB → new schema = **empty** (exact parity). Second run of the SQL is a no-op.
- Backfill against a seeded DB (head office + 2 units, admin with all-unit access, a user with an unknown role, an `ot_manager`, duplicate employee codes across units, a `user_unit_access` row): dry run and apply agree; **second apply writes 0 rows**; `users.role` untouched; `--verify` passes. Deleting a `user_role` and a `role_permission` makes `--verify` exit 1 naming both users; re-applying repairs it.
- Access diff (pages reachable before vs after, per user) is empty. Informational: roles absent from `session.ts` (`ot_manager`, `er_staff`) *gain* permission keys in their template — inert until the engine is enforced.

### Design decisions made while building
- **Company templates, not per-unit role copies.** One hidden template Role per system role per company, anchored on the head-office unit with slug `company-template.<role>`; `UserRole.unit_id` carries the unit. This avoids the `(organizationId, slug)` unique clash with roles admins already seeded, and keeps the legacy roles screen unchanged.
- **Template permissions = union of today's three legacy maps** (nothing invented). Scope `UNIT` for all (today's behaviour is unit-wide).
- **`CompanyModule`**: the single company is entitled to every registry module.
- **`Employee.employment_type` stays a string** (existing values PERMANENT/CONTRACT/…); the plan's enum was not introduced. `Employee.reporting_manager_id` already is the manager link.
- **Company-aware login not built**: with one company there is nothing to resolve; usernames are already globally unique.

### ⚠ Deployment order (important)
Prisma selects every column of a model, so the new `users/organizations/roles/employees` columns must exist **before** this code runs. `.github/workflows/deploy-ec2.yml` already runs `prisma migrate deploy` before `build` + `pm2 reload`, so a normal push is safe. If you deploy any other way, apply the migration first. The migration is additive, so old code on the migrated DB is unaffected. A push will also apply every other pending migration listed in memory as "not applied".

### Run order when you are ready
1. `npx prisma migrate deploy` (or push).
2. `npx tsx scripts/backfill-company-os.ts --company-name "<Company>"` — read `tmp/backfill-diff.json`, check *unmapped users*, *employee-code collisions*, *access diff empty*.
3. `... --apply --yes`
4. `... --verify` (must print "Access diff is empty ✔").

### Open items from the backfill report
- **Employee codes are only unique per unit** (`EMP-00001` exists in several units). Login-by-employee-code needs a company-unique code first; no unique index was added. Decide: renumber, or prefix with a unit code.
- Users whose `role` is not a known system role get no `UserRole` (listed under `unmapped_users`).
- The 16 sidebar-only / partially-wired roles (see Phase 1 LEGACY-QUIRKs) still need permissions defined before Phase 3.


## Phase 3 — Resolver in shadow  (2026-10-21) — engine complete and tested; module migration partly done

**Everything defaults to `legacy`: with no flag set, behaviour is unchanged.** `npm test` (unit), `npm run test:integration` (real Postgres) and the production build all pass.

### What exists
| Piece | File(s) |
|---|---|
| Permission catalogue (`module.resource.action`, tied to legacy keys or seeded) | `app/lib/modules/registry.ts` (`permissions`), `app/lib/access/permissions.ts` |
| Pure resolver: entitlement ∩ unit toggle ∩ dependency closure ∩ (role perms ∪ grants) ∖ denies; widest scope wins; deny beats grant; expiry; admin template; My Workspace implicit | `app/lib/access/resolve.ts` |
| DB loader with version-keyed cache (`users.access_version` / `companies.module_version`) + 60 s TTL | `app/lib/access/entitlements.ts` |
| Data scope → Prisma `where` (OWN/TEAM/DEPARTMENT/UNIT/COMPANY, fails closed); reporting-line lookup; by-id-in-unit writes | `app/lib/access/scope.ts`, `scope-db.ts` |
| **`requireAccess(permission, { legacy })`** — legacy / shadow / enforce; staff-only; unprovisioned users fall back to the old check; engine errors invisible in shadow, fail closed in enforce. `requireSelf()` | `app/lib/access/require-access.ts` |
| Per-unit / company / platform mode (`access_engine`), `getCompanyIdForOrg` | `app/lib/feature-flags.ts`, `scripts/access-engine-mode.ts` |
| Shadow disagreements → `access_shadow_logs`; operator report (exit 1 when any) | `require-access.ts`, `scripts/shadow-report.ts` |
| JWT claims (`cid,eid,mods,mv,ae`) minted by `createSession` **only** for `enforce` units + provisioned users; `getSession().access`; `POST /api/auth/refresh` re-mints without extending the 8 h limit | `app/lib/session.ts`, `claims.ts`, `claims-server.ts`, `session-refresh.ts`, `app/api/auth/refresh/route.ts` |
| **proxy.ts**: if the JWT carries claims → module-membership gate (longest-prefix routing, ungated pages now governed, redirect to `/me?reason=no-access`); otherwise the original loop, untouched | `proxy.ts` |
| **Sidebar**: if the session carries claims → `buildNav`; otherwise `NAV_BY_ROLE` as before | `app/components/layout/Sidebar.tsx` |
| Seeding of permissions that have no legacy key (e.g. `pharmacy.return.create`) | `scripts/seed-access-permissions.ts` |
| vitest: 109 unit tests + 15 database-backed integration tests; CI job with a Postgres service | `vitest.config.ts`, `tests/**`, `.github/workflows/ci.yml`, `tsconfig.scripts.json` (scripts are now type-checked) |

### Modules migrated onto `requireAccess` (legacy check preserved as the `legacy` leg)
| Module | How | Parity |
|---|---|---|
| **HR** — all 22 admin actions | `requireHr(action, resource)` in `hr-core.ts` → `hr.<resource>.<action>`, tied to `hr.<action>` | holders == `hasPermission` for every action (test) |
| **Pharmacy** — all 49 call sites | `denyUnlessPharmacyRole` maps each tier to a permission; **same messages** | each tier == its role list (test) |
| **Finance ledger + Tally layer** — 17 browser-callable actions | `guarded(permission, …)` with `requireLegacyRouteAccess('/finance')` as legacy | reads == the `/finance` door; writes deliberately stricter (below) |
| My Workspace (`ess`) | `hr-self-service-actions` still use `requireStaff` (staff-only, OWN by construction); `requireSelf` exists for later | implicit `ess.self.*` |

**Deliberately stricter in the new model (documented + tested):** finance *write* permissions follow `finance.create/edit/export`, so a doctor, IPD manager or OPD manager — who can create journal entries today only because the page gate lets any `finance.view` holder in — would lose that. Receptionist also loses edit/export. This is exactly what shadow mode will show in `access_shadow_logs` before anyone is affected.

### Safety properties (each has a test)
- `legacy` mode never calls the new engine and returns exactly the old error/allow.
- `shadow` never changes a decision, never narrows a query, swallows engine and log-write failures.
- `enforce` never locks out an **unprovisioned** user (old check decides) but fails **closed** on an engine error for a provisioned one.
- Un-migrated modules are never governed by the engine: claims give them the legacy page decision, so `enforce` cannot lock anyone out of a module Phase 3 has not reached.
- Forged / `shadow`-mode claims in a JWT are ignored by the proxy.

### Rollout runbook
1. Migration + Phase 2 backfill (see above), then `npx tsx scripts/seed-access-permissions.ts --apply --yes`.
2. `npx tsx scripts/access-engine-mode.ts --unit <slug> --set shadow --yes` (start with one unit; `--show` lists effective modes).
3. Let people work for ≥ 2 weeks. `npx tsx scripts/shadow-report.ts` — every "OLD allowed → NEW denies" line is someone enforce would lock out. Fix by granting the permission (Phase 4 UI / `UserPermissionOverride`) or by correcting the registry; repeat until clean.
4. Pilot unit → `--set enforce --yes`. Roll back with `--clear --yes`: flags cache ~30 s, and every signed-in browser re-mints its claims within 5 minutes (Phase 4 `AccessClaimsRefresher`) and reloads, which removes the claims and restores the legacy gate. Verified end to end against a running server. For an instant revert, also have users sign in again.

### Not done in Phase 3 (honest list)
- **823 server-action functions in 98 files are still on the old guards** (`check:guards`: STRONG 252 · WEAK 794 · NONE 29). Largest: finance 45, reception 38, ipd 31, doctor 31, ipd-finance 30, ot 28, admin 28, lab 25, service-master 24, ipd-nursing 24, insurance 20, nurse 19, er 17, ipd-emr 16. Each needs its resource/action permissions defined and a `requireAccess(..., { legacy })` swap (Prompt C) — mechanical but needs a human decision per function about which permission it is. **The plan's gate "guard-violations.json empty" is therefore NOT met.**
- `refresh` is not called by any UI yet (Phase 4: call it after an admin changes access).
- Claims are only minted for `enforce`, so there is no shadow-mode *page-level* comparison; only server actions are shadowed.
- `ModuleConfig.enabled = false` rows are honoured by the engine. They are ignored by the app today, so any module an admin toggled off long ago will show up as an "OLD allowed → NEW denies" line in shadow mode — review those rather than assume a bug.
- MIS reports declaring module + permission, `scopeWhere` adoption in list queries (HR list screens still fetch unit-wide), company-level scoping in `getScopedPrisma`, and the `/admin/access/*` UI (Phase 4).


## Phase 4 — Admin UI and enforce rollout  (2026-10-21) — built and verified; pilot flip is YOUR operational step

### Delivered
| Piece | Where |
|---|---|
| **Delegation rules** (pure, 21 tests): need `admin.access.assign` in the unit · hand out only what you hold · admin template only by an admin · company-wide only by a company owner · never your own access · the last company owner can never be removed | `app/lib/access/delegation.ts` |
| Resolver now exposes `isAdmin` / `isCompanyOwner` (admin template via a unit-less assignment = company owner) | `resolve.ts`, `entitlements.ts` |
| Admin permissions in the catalogue (`admin.access.view/assign`, `admin.user.create/offboard`, `admin.role.view/edit`) tied to legacy `admin.*` — only `admin` holds them today | `registry.ts` |
| **Service layer** — users list/detail, assign/revoke role (end-dated, revivable), per-user grant/deny with mandatory reason + expiry, create-user wizard in one transaction, one-click offboarding, custom roles (create/clone/edit/switch off/delete-if-unused), bulk CSV import with per-row preview, change log; every write confined to the actor's company, bumps `access_version`, writes `access_change_logs` | `app/lib/access/admin-service.ts` |
| Guarded server actions (`requireAccess`, legacy leg = "role is admin") | `app/actions/access-admin-actions.ts` |
| **Screens** under *Admin → People → Access Control*: Users · Add user (Person → Access → Login → Review, credentials shown once) · User detail (roles, exceptions, **"what this person actually gets"** with their sidebar preview, history, offboard) · Roles (custom-role editor with a permission checklist limited to what *you* hold; standard roles read-only; clone) · Bulk import · Change log | `app/admin/access/**`, `lib/navigation/admin-nav.ts` |
| Silent claims refresh every 5 min (only when the session carries claims); excluded from the proxy matcher so it can never keep an idle session alive | `app/components/AccessClaimsRefresher.tsx`, `proxy.ts` |
| Break-glass: promote/create a company owner straight in the database, dry-run by default | `scripts/company-owner.ts` |
| Tests: 131 unit (incl. 21 delegation, 13 proxy) + **47 database-backed** (32 for access administration: delegation end-to-end, an HR admin who cannot escalate, last-owner protection, cross-company isolation, offboarding, import) | `tests/**`, `scripts/test-integration.sh` (each file gets a pristine schema) |

### Verified against a running production build (scratch DB)
Admin reaches all new pages (200); a doctor is bounced to `/login?reason=unauthorized`; no cookie → `/login`. Refresh mints claims (original 8 h expiry preserved), a repeat refresh is a no-op, `/api/session` exposes `access`, `/finance` is refused with `/me?reason=no-access` for a user whose claims lack it, and clearing the flag + refresh removes the claims. Refresh without a session → 401.

### Design decisions
- **A custom role has no effect on a user until their unit is in `enforce`** — legacy screens still read `users.role`. The wizard therefore always sets a *primary standard role* (it becomes `users.role` and a `UserRole`) and layers custom roles / exceptions on top.
- Custom roles carry `template_key = custom:<slug>`, so they stay out of the old `/admin/roles` screen (which filters `template_key IS NULL`).
- Role editor lists only catalogue permissions (HR, pharmacy, finance ledger, admin). Apps not yet brought into the model (nursing, lab, OT, …) stay governed by the standard roles; the editor says so.
- Offboarding ends roles and disables the login, but an already-issued JWT stays valid until it expires (as with the existing activate/deactivate toggle). **Nothing in the app checks `users.is_active` per request.** Adding that check to `getSession`/proxy is the follow-up that makes offboarding immediate.
- "Flag assets to recover" on offboarding is not built: there is no employee-asset assignment model yet (Phase 6).
- The temporary password is shown once; there is no forced-change-on-first-login field on `users` today.

### Phase 4 plan items NOT done
- **Flip the pilot unit to `enforce`** — operational, needs the migration + backfill + seeding + ≥2 clean weeks of shadow first (runbook above). Not done and not appropriate to do without you.
- **Delete the legacy maps and retire the parity test** — only after a stable pilot, by design.
- Per-request `is_active` check (above) and forced password change.
- The remaining ~820 server actions (Phase 3 gate) — until they are on `requireAccess`, `enforce` governs only HR, pharmacy, finance-ledger/Tally, admin-access and the module-level page gate.


## Per-employee access profiles  (2026-10-23) - built, verified; migration `20261023120000_user_access_profiles` NOT applied

Plan + status: `ACCESS_PROFILES_PLAN.md` (project root). A third way to govern a user, alongside legacy and the unit-wide
engine: a row in `user_access_profiles` makes ONE employee follow the new engine (always `enforce` for them) with an explicit
module list + catalogue permissions, regardless of the unit's `access_engine` flag. No row = unchanged behaviour. HR and Admin
set it from the Add Employee screen / the employee's "Login & Access" tab; HR may not hand out Admin, Finance or Insurance
(`app/lib/access/presets.ts` `checkProfileChange`). Page level covers every module; action level only HR, Pharmacy and
Finance-ledger (catalogue modules). Next module to give a catalogue: Reception.
