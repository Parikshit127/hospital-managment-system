# Company OS — Re-architecture Plan (from HospitalOS)

> **Audience:** AI coding agents and engineers working in the HospitalOS repo.
> **Date:** 2026-10-21 · **Owner:** Parikshit
> **Read with:** `docs/ARCHITECTURE_BRIEF.md` — it describes what exists *today*. This file describes what we are building and in what order. "Brief §N" means a section of that file.
> **Saved as:** `docs/COMPANY_OS_PLAN.md` (the prompts in §12 reference it by that path).
> **Progress:** see `docs/COMPANY_OS_PROGRESS.md`.

---

## 0. Rules for agents — read before any change

1. Read `docs/ARCHITECTURE_BRIEF.md` and this file before changing code. Work only on the phase and task you were given.
2. **No big-bang rewrite.** Changes are additive until their phase gate passes. Old code paths stay as the fallback.
3. **Never run `prisma migrate dev`.** The shared dev DB has drift. Write SQL migrations by hand and apply with `prisma migrate deploy`.
4. **One concern per PR.** One module, or one cross-cutting change. State the files in scope and do not touch others.
5. **User-visible behaviour changes only behind the per-company flag `access_engine`** (`legacy` | `shadow` | `enforce`, default `legacy`).
6. **Parity before deletion.** Do not delete any hardcoded map (`ROLE_ROUTES`, `PERMISSION_ROUTES`, `ROLE_PERMISSIONS`, `SYSTEM_ROLE_PERMISSIONS`, the copy in `role-actions.ts`, `NAV_BY_ROLE`) until a parity test proves its replacement matches.
7. Keep: `admin` all-powerful **within its scope**, the current landing page per role, the five separate realms (staff, patient, superadmin, dev-portal, investor).
8. Do not edit or import root-level diagnostic files (`check*.ts`, `fix-*.ts`, `test-*.js`, `out*.json`, `*.xlsx`, `*.docx`).
9. Every PR must pass: typecheck, build (`NODE_OPTIONS=--max-old-space-size=4096`), `check:guards`, the tenant leak suite, and the parity test while Phases 1–3 are open.
10. Never invent role defaults. Derive today's behaviour from the code, and mark anything odd with `// LEGACY-QUIRK: <note>` instead of fixing it silently.
11. Finish every task with a review table (for example: function → permission → scope) and a list of anything you were unsure about.

---

## 1. Goal

Turn HospitalOS into a modular company platform:

- **One login per employee**, by employee ID.
- **My Workspace** for every employee: attendance, leave, holidays, payslips, claims, documents, assets, tickets, approvals.
- **Work apps assigned per user** through roles, permissions with data scope, and per-user overrides.
- **Hospital features become the Healthcare pack** — one industry pack on a shared company core.

**Assumption:** the product stays multi-tenant SaaS sold to client companies. If it only runs inside one company group, Phase 7 can be dropped.

---

## 2. Locked decisions (write each as an ADR in `docs/adr/`)

| # | Decision | Choice | Why |
|---|---|---|---|
| ADR-001 | Tenant boundary | New `Company` above today's `Organization`; `Organization` now means **unit** | 200+ tables already carry `organizationId`; re-keying them is a rewrite |
| ADR-002 | Who is a user | Every staff login is an `Employee`; `User` holds only credentials | Attendance, leave and payroll need one person record |
| ADR-003 | Where modules are defined | Typed registry in code; DB stores only assignments | Testable, versioned with code, cannot drift |
| ADR-004 | Roles per user | Many roles per user, each tied to a unit (or all units) | Doctor + HOD; billing in unit A, reception in unit B |
| ADR-005 | Permission grain | `module.resource.action` + data scope | `hr.leave.approve` for my team vs whole company |
| ADR-006 | Exceptions | Per-user grant/deny overrides; deny wins; optional expiry | One-off cases without new roles |
| ADR-007 | Admin power | Company owner, unit admin, module admin; you can only grant what you hold; never edit your own access | Delegated admin without privilege escalation |
| ADR-008 | Code structure | Modular monolith in the same Next.js app; boundaries enforced by lint | Fits the team; no network boundaries needed |

---

## 3. Target architecture

```
Shells          Staff app (My Workspace + work apps) | Patient portal | Superadmin | Dev, investor
   ↓ calls down only
Industry packs  Healthcare pack: OPD, IPD, OT, ER, Lab, Pharmacy, Nursing, TPA, patient billing | next pack
   ↓
Business apps   HR & payroll | Finance & accounts | Procurement & inventory | CRM & call centre
(company-wide)  | Helpdesk & assets | MIS & reports
   ↓
Core platform   Org & people | Access engine | My Workspace (ESS) | Approvals | Notifications
(every company) | Audit & documents
   ↓
Data            PostgreSQL — every row scoped by companyId and unit (organizationId)

Access engine (registry, roles + scopes, user overrides, plan + unit toggles)
is checked in four places: proxy, navigation, server actions, data queries.
```

### Dependency rules

- Calls go **downward only**: packs → business apps → core. Core never imports a business app or pack.
- Cross-module calls go through a module's **public service functions**, never its tables. Example: IPD discharge calls `finance.postJournal()`; it never writes `GL_JournalLine`.
- Enforce with ESLint `no-restricted-imports` (or dependency-cruiser) rules generated from each module's `layer` in the registry.

### Target code layout (move folders gradually — only after a module's guards are migrated)

```
app/lib/modules/registry.ts      aggregates all module definitions (edge-safe: no Node/Prisma imports)
app/lib/access/
  system-roles.ts                system role templates (home route, default permissions)
  entitlements.ts                getEntitlements() resolver + cache
  require-access.ts              requireAccess(), requireSelf()
  scope.ts                       scopeWhere(), getScopedPrisma()
  jwt-claims.ts                  claim shape + refresh logic
modules/<key>/                   later: definition.ts, service.ts (public), actions/, lib/ (private)
app/(staff)/me/…                 My Workspace (exists as /me)
app/<module>/…                   work app routes stay where they are for now
```

---

## 4. Organization and identity

One person = one `Employee` with one login, belonging to a `Company` and holding roles in one or more units.

```
Company                       tenant: plan, billing, login domain, company-wide masters
 ├─ LegalEntity (optional)    GSTIN, PAN, PF/ESI codes — for groups with several registered entities
 ├─ Unit  (= Organization)    + unit_type: hospital | clinic | pharmacy | office | warehouse | other
 │   └─ Branch                physical site (exists)
 ├─ OrgDepartment, Designation   company-wide masters, usable in any unit
 └─ Employee ── 1:1 ── User   home unit, department, designation, reporting manager
```

Rules:

- **`User` is only the credential:** username, password hash, MFA, status, last login. Everything about the person lives on `Employee`.
- **Reporting manager** (`Employee.manager_id`) decides who approves leave/expenses and what TEAM scope means.
- **Login by employee ID.** `User.username` is globally unique today. Make it unique per company (`@@unique([company_id, username])`) and resolve the company from the subdomain or a company-code field on the login page. Default username = employee code. Keep the old global login working until every client is migrated.
- **Units come from roles.** Unit-scoped `UserRole` rows replace `UserUnitAccess`; the unit switcher lists units where the user holds a role (or all units if a role has `unit_id = null`).
- **Contractors and visiting consultants** get an `Employee` with `employment_type`.
- **Other realms stay separate.** Patients, investors and dev-portal users are not employees. Superadmin = platform operators.
- **Name clash:** the existing `Department` model is clinical. Name the new one `OrgDepartment`.

---

## 5. Access model

```
allowed(user, permission p, record r) =
      module(p) ∈ Plan(company) ∪ Addons(company)                              -- commercial  (superadmin)
  ∧   ModuleConfig(unit, module(p)).enabled                                    -- operational (company/unit admin)
  ∧   p ∈ ( ⋃ Perms(role) for role in Roles(user, unit)  ∪  Grants(user) ) \ Denies(user)   -- security
  ∧   r ∈ Scope(user, p)                                                       -- data
```

| Concept | What it is | Example | Managed by |
|---|---|---|---|
| Module | A product area in the registry | `ess`, `hr`, `finance`, `reception`, `pharmacy` | Code |
| Permission | `module.resource.action` | `hr.leave.approve`, `finance.invoice.create`, `ipd.admission.discharge` | Code |
| Role | Named bundle of permissions, each with a scope | Receptionist, HR Manager, Unit Admin | Company/unit admin (system roles seeded as templates) |
| Role assignment | User × role × unit | Asha = Receptionist @ Unit A | Admin |
| Override | Per-user grant or deny, with reason, optional expiry | Nurse Ravi + `pharmacy.stock.view` until 30 Nov | Admin |
| Data scope | How far a permission reaches | `OWN` < `TEAM` < `DEPARTMENT` < `UNIT` < `COMPANY` | Per role permission / override |

### Rules

1. **Permission keys:** `<module>.<resource>.<action>`. Standard actions: `view`, `create`, `edit`, `delete`, `approve`, `export`. Module-specific actions are allowed (`ipd.admission.discharge`, `pharmacy.dispense.execute`). Every key must exist in the registry (CI-checked).
2. **Module visibility:** a user sees a module in the launcher if they hold any permission in it.
3. **Widest scope wins** when the same permission comes from several roles/grants. **Deny beats grant**, at any scope.
4. **My Workspace is always on:** every active employee gets `ess.*` at `OWN`. Removed only by deactivating the employee.
5. **Sensitive fields get their own permissions** (`hr.salary.view`, `clinical.record.view`) so module access doesn't expose everything.
6. **Dependencies:** registry `dependsOn` (e.g. IPD → registration, billing) is enforced in the admin UI and the resolver.
7. **Delegated administration:** assigning access is the scoped permission `admin.access.assign`. A grantor can assign only roles/permissions they hold, only in units they administer, and never to themselves.
8. **Admin templates:**
   - *Company owner* — everything entitled, `COMPANY` scope, incl. `admin.*`.
   - *Unit admin* — everything enabled in their unit, `UNIT` scope (today's `admin`).
   - *Module admin* — e.g. HR Admin: `hr.*` + `admin.access.assign` limited to HR roles.
9. **System roles become templates.** The 16 role slugs in use today (`admin, doctor, receptionist, lab_technician, pharmacist, finance, ipd_manager, nurse, opd_manager, hr, ot_manager, er_staff, coordinator, counsellor, call_center, crm_manager`) are seeded per company with defaults **derived from current code**; admins clone them to make custom roles.
10. **Home app:** `User.home_app`, else the primary role's home route, else `/me`.

Scope example: everyone has `hr.leave.view` at `OWN`, a manager at `TEAM`, HR at `COMPANY`.

---

## 6. Data model changes

All changes are **additive**. Follow existing `schema.prisma` conventions (id type, field naming, `@@map`); the sketches below show intent, not final syntax.

```prisma
enum DataScope       { OWN TEAM DEPARTMENT UNIT COMPANY }
enum OverrideEffect  { GRANT DENY }
enum UnitType        { hospital clinic pharmacy office warehouse other }
enum EmploymentType  { employee contractor consultant intern }

model Company {
  id              String   @id @default(uuid())   // match existing id type
  name            String
  slug            String   @unique
  login_domain    String?  @unique
  plan_id         String?                          // FK → SubscriptionPlan (Phase 7)
  module_version  Int      @default(1)             // bump on plan/module change
  is_active       Boolean  @default(true)
  created_at      DateTime @default(now())
  organizations   Organization[]
}

// Organization (= unit): ADD
//   company_id  String   → Company
//   unit_type   UnitType @default(hospital)

model LegalEntity {           // optional
  id String @id @default(uuid())
  company_id String
  name String
  gstin String?
  pan String?
  pf_code String?
  esi_code String?
}

model OrgDepartment { id String @id @default(uuid()); company_id String; name String; code String?; parent_id String? }
model Designation   { id String @id @default(uuid()); company_id String; name String; code String?; level Int? }

// Employee: ADD
//   user_id (unique, nullable until linked), company_id, home_unit_id, org_department_id,
//   designation_id, manager_id (→ Employee), employment_type, status

// User: ADD
//   company_id, home_app String?, access_version Int @default(1)
//   @@unique([company_id, username])   -- keep global unique until all clients migrated
//   `role` stays as LEGACY (read-only after Phase 4, dropped later)

// Role: CHANGE
//   company_id, unit_id String? (null = company-wide template), slug, name,
//   is_system Boolean, template_key String?   -- permissions JSON → RolePermission

model RolePermission {
  role_id        String
  permission_key String
  scope          DataScope
  @@id([role_id, permission_key])
}

model UserRole {
  id         String   @id @default(uuid())
  user_id    String
  role_id    String
  unit_id    String?                // null = all units of the company
  is_primary Boolean  @default(false)
  valid_from DateTime @default(now())
  valid_to   DateTime?
  granted_by String
  @@unique([user_id, role_id, unit_id])
}

model UserPermissionOverride {
  id             String         @id @default(uuid())
  user_id        String
  permission_key String
  effect         OverrideEffect
  scope          DataScope?
  unit_id        String?
  expires_at     DateTime?
  reason         String
  granted_by     String
  created_at     DateTime       @default(now())
}

model CompanyModule {           // commercial entitlement
  company_id String
  module_key String
  source     String             // plan | addon | trial
  expires_at DateTime?
  @@id([company_id, module_key])
}

// ModuleConfig: KEEP (organizationId, module_key, enabled, config_json) — per-unit switch, now enforced.
// SubscriptionPlan: ADD modules String[] (registry keys) + limits; Organization.plan string → Company.plan_id (Phase 7).

model FeatureFlag {             // Phase 0; holds access_engine per company/org
  scope_type String             // platform | company | organization
  scope_id   String
  key        String
  value      String
  @@id([scope_type, scope_id, key])
}

model AccessChangeLog {
  id         String   @id @default(uuid())
  company_id String
  actor_id   String
  target_user_id String
  change     Json
  created_at DateTime @default(now())
}

model AccessShadowLog {
  id          String   @id @default(uuid())
  company_id  String
  user_id     String
  permission  String
  target      String              // action name or route
  legacy      Boolean
  next        Boolean
  created_at  DateTime @default(now())
}
```

### Migration and backfill rules

1. Hand-written SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`, applied with `prisma migrate deploy`. Never `migrate dev`.
2. `scripts/backfill-company-os.ts`, **idempotent**: one `Company` per `Organization` unless `scripts/company-map.json` groups several; set `Organization.company_id`; create an `Employee` for every `User` without one; create `UserRole` rows from `User.role` (unit = user's organization) and from `UserUnitAccess`; seed system roles per company from `system-roles.ts`; copy `ModuleConfig.enabled`.
3. `--dry-run` on a copy of production first. Compute every user's effective permissions **before** (from `User.role` via the Phase 1 maps) and **after** (from the new `UserRole` rows via the same templates). The diff must be empty.
4. Tag every Prisma model as **company-scoped** (employees, payroll, ledger, approvals) or **unit-scoped** (OPD, IPD, lab, pharmacy stock). Generate the list from the schema; CI fails if a model with `organizationId` or `company_id` is missing.
5. Permission keys are plain strings validated in CI against the registry. The old global `Permission` table is retired.

---

## 7. Enforcement — code contracts

One resolver feeds every layer, so proxy, sidebar and actions can never disagree.

| Layer | Today | After |
|---|---|---|
| Registry | — | `app/lib/modules/registry.ts` |
| Resolver | — | `getEntitlements(userId, unitId)` |
| `proxy.ts` (Edge) | `ROLE_ROUTES` + broad `*.view` fallback | Module keys + versions from JWT; route → module via registry (longest prefix wins) |
| Sidebar | `NAV_BY_ROLE` (1,049 lines) | `buildNav(registry, entitlements)` |
| Server actions | `requireTenantContext()` accepts patient sessions | `requireAccess(permission)` — staff only |
| Data | `getTenantPrisma(orgId)` | `getScopedPrisma({companyId, unitId})` + `scopeWhere()` |

### 7.1 Registry

```ts
// app/lib/modules/types.ts — must stay edge-safe (no Node or Prisma imports)
export type DataScope = 'OWN' | 'TEAM' | 'DEPARTMENT' | 'UNIT' | 'COMPANY';
export type ModuleLayer = 'core' | 'business' | 'pack';

export interface NavItem {
  label: string; href: string; icon: string;   // lucide icon name
  group?: string; permission: string;          // shown only if user holds it
}

export interface ModelOwnership {               // used by scopeWhere()
  employeeField?: string;                      // OWN / TEAM
  departmentField?: string;                    // DEPARTMENT
  unitField?: string;                          // UNIT (usually 'organizationId')
  companyField?: string;                       // COMPANY
}

export interface ModuleDef {
  key: string;                                 // 'hr', 'pharmacy', 'ess'
  name: string;
  layer: ModuleLayer;
  pack?: 'healthcare';
  dataLevel: 'company' | 'unit';
  routePrefixes: string[];                     // ['/hr', '/api/hr']
  actionsFiles: string[];                      // ['hr-actions', 'hr-self-service-actions']
  resources: Record<string, readonly string[]>;// { leave: ['view','create','approve'] }
  dependsOn: string[];
  defaultRoles: string[];                      // system role slugs that get it by default
  alwaysOn?: boolean;                          // only 'ess'
  nav: NavItem[];
  models?: Record<string, ModelOwnership>;     // Prisma model name → owner fields
}
```

Cover **every** route tree in brief §5, including `ess`, `reception`, `doctor`, `opd`, `opd_manager`, `ipd`, `discharge`, `nurse`, `ot`, `er`, `lab`, `pharmacy`, `finance`, `insurance`, `billing`, `hr`, `crm`, `call_center`, `coordinator`, `counselling`, `mis`, `admin`, `print_center`, `notifications`, `help_center`, plus planned `payroll`, `procurement`, `inventory`, `assets`, `budget`, `helpdesk`, `optical`, `approvals`.

### 7.2 Resolver

```ts
// app/lib/access/entitlements.ts
export interface Entitlements {
  companyId: string; userId: string; employeeId: string; unitId: string;
  modules: Set<string>;
  permissions: Map<string, DataScope>;   // key → widest granted scope (denies removed)
  version: string;                       // `${company.module_version}.${user.access_version}`
}
export function getEntitlements(userId: string, unitId: string): Promise<Entitlements>;
```

- Inputs: `CompanyModule` (or plan), `ModuleConfig.enabled` for the unit, `UserRole` → `RolePermission`, `UserPermissionOverride` (not expired), `dependsOn`.
- Cache in-process, keyed by `userId:unitId:version`, TTL 60 s. Read the two version numbers from the DB on each server-action call (one indexed query) so revocation is immediate there.
- Bump `User.access_version` on any role/override change; bump `Company.module_version` on any plan/module/ModuleConfig change.

### 7.3 Server guards

```ts
// app/lib/access/require-access.ts
export function requireAccess(
  permission: string,
  opts?: { unitId?: string; legacy?: () => Promise<unknown> | unknown }
): Promise<{
  db: ScopedPrisma; session: SessionData; ent: Entitlements;
  scope: DataScope;
  where: (model: string) => Record<string, unknown>;   // = scopeWhere(ctx, permission, model)
}>;

export function requireSelf(): Promise<{ db: ScopedPrisma; session: SessionData; employeeId: string }>;
```

Behaviour by `access_engine` flag:

| Mode | Decision | Side effect |
|---|---|---|
| `legacy` | `opts.legacy()` decides | none |
| `shadow` | `opts.legacy()` decides | evaluate new rule too; write `AccessShadowLog` on disagreement |
| `enforce` | new rule decides | none |

In every mode: reject non-staff sessions (patient, investor, dev-portal) with `AuthError`; throw `ForbiddenError` on deny.

### 7.4 Data scope

```ts
// app/lib/access/scope.ts
export function scopeWhere(ctx, permission: string, model: string): Record<string, unknown>;
// OWN        → { [employeeField]: ctx.employeeId }
// TEAM       → { [employeeField]: { in: reportIds(ctx.employeeId) } }   // manager chain incl. self, cached
// DEPARTMENT → { [departmentField]: ctx.departmentId }
// UNIT       → { [unitField]: ctx.unitId }
// COMPANY    → { [companyField]: ctx.companyId }   // or no extra filter beyond tenant scoping
```

`getScopedPrisma({ companyId, unitId })` replaces `getTenantPrisma`: company-level models are filtered by `company_id`, unit-level models by `organizationId`. Add org-scoped `updateMany/deleteMany({ where: { id, organizationId } })` helpers so updates by id can't cross tenants.

### 7.5 JWT and proxy

- Staff JWT claims: `cid` (company), `uid`, `eid` (employee), `unit` (active unit), `mods` (module keys), `mv` (module_version), `av` (access_version), `exp` ≈ 10 min.
- `/api/auth/refresh` re-mints silently while the session is valid and not idle; it re-resolves `mods` if versions changed. Idle timeout (15 min) and 8 h max session stay.
- `proxy.ts`: find the module for the path (longest prefix wins — fixes the `/opd` vs `/opd-manager` ordering quirk); if not in `mods`, redirect to the user's home app with a "no access" notice. Proxy never imports Prisma.

### 7.6 Navigation

`buildNav(registry, ent)` → **My Workspace** group first, then entitled apps grouped by layer. Unit switcher only if the user has roles in more than one unit. Replaces `NAV_BY_ROLE` and `MY_WORKSPACE` in `Sidebar.tsx`.

---

## 8. What users see

- **App launcher:** only entitled apps.
- **My Workspace (`/me`)** grows to: profile, attendance punch + regularization, leave balance + requests, holidays + roster, payslips + tax declarations, expense claims, documents + letters, assets issued, helpdesk tickets, announcements, approvals inbox (`/me/approvals`).
- **Approvals inbox:** everything waiting on the user across modules — leave, regularization, expenses, POs, discounts, write-offs, refunds.
- **Landing:** receptionist → `/reception`, doctor → `/doctor/dashboard`, office employee → `/me`.

### Admin screens (under `/admin/access/…`)

| Route | Purpose |
|---|---|
| `/admin/access/users` | List users; filter by app, role, unit, status |
| `/admin/access/users/new` | Add-user wizard (below) |
| `/admin/access/users/[id]` | Edit roles/overrides, effective-access view, "View as this user", offboard |
| `/admin/access/roles` | Role editor: rows = resources, columns = actions, cell = scope dropdown; clone templates |
| `/admin/access/log` | `AccessChangeLog` viewer |
| `/admin/access/import` | Bulk CSV import |

### Add-user wizard (saved in one transaction)

1. **Person** — name, employee code (auto from sequence), email, phone, department, designation, reporting manager, joining date, home unit, employment type.
2. **Access** — pick role templates per unit; permission grid fills in; add grants/denies with scope, reason, optional expiry.
3. **Login** — home app, username (default = employee code), invite link or temp password, MFA if the role requires it.
4. **Review** — effective access (apps, permissions, scopes, units) + "View as this user" sidebar preview.
5. **Save** — Employee + User + UserRoles + overrides together; write `AccessChangeLog`; send welcome message.

**Offboarding (one click):** disable login, end-date all `UserRole` rows, revoke overrides, flag assets to recover, trigger final-settlement task for HR.

**Example:** Asha (receptionist) gets `ess.*` (OWN), Receptionist @ Unit A (UNIT), override `billing.invoice.create` (UNIT). She lands on `/reception`, applies for leave in My Workspace, her manager approves it from the inbox.

---

## 9. Module map

| Module | Layer | Exists today | Work needed | Phase |
|---|---|---|---|---|
| Access control | Core | Hardcoded in 4 places | Registry, resolver, admin UI (this plan) | P1–P4 |
| Org & people | Core | `Organization`, `Branch`, `UserUnitAccess`, `Employee` | Company, departments, designations, manager tree | P2 |
| My Workspace (ESS) | Core | `/me` (6 pages) | Payslips, claims, documents, assets, tickets, inbox | P5 |
| Approvals engine | Core | Scattered (`DiscountOTP`, leave, PO approval) | Generic multi-level rules by type/amount, delegation, SLA | P5 |
| Notifications, audit, documents | Core | `Notification`, `system_audit_logs`, `DocumentTemplate` | Module-aware, company-level | P5 |
| HR core | Business | `Employee`, `Attendance`, `LeaveRequest`, `Holiday`, `ShiftAssignment` | Company-wide; biometric/geo punch; onboarding/offboarding | P5 |
| Payroll | Business | None | Salary structures, payroll run, payslips, PF, ESI, PT, TDS, Form 16, bank file | P6 |
| Finance & accounts | Business | GL, GST, Tally, expenses, bank, budgets, fixed assets | Company ledger; `finance.postJournal()` posting service; AP, AR, bank reconciliation | P6 |
| Procurement & inventory | Business | Stores, indents, POs, GRN (pharmacy-led) | Purchasing for any item category | P6 |
| CRM & call centre | Business | `CRMLead`, campaigns, call logs (patient-oriented) | Generic leads/contacts; patient fields → healthcare extension | P6 |
| Helpdesk & assets | Business | `Ticket`, `FixedAsset` | Internal helpdesk; assets assigned to employees | P6 |
| MIS & reports | Business | Report engine, presets, schedules, rollups | Each report declares module + permission | P3 |
| Healthcare pack | Pack | OPD, IPD, OT, ER, lab, pharmacy, nursing, TPA, patient billing | Register modules; migrate guards module by module | P3 |

---

## 10. Phases, tasks and acceptance criteria

Rough timing for 3–4 engineers working with agents. Each gate is a test or measured result, not a date. Users see no change until Phase 4.

### Phase 0 — Stabilize (weeks 1–2)

- [ ] ADR-001 … ADR-008 in `docs/adr/`.
- [ ] Brief §8 P0 item 1: add guards to `gl-actions.ts`, `budget-actions.ts`, `gst-compliance-actions.ts`, `asset-management-actions.ts`, `insurance-gl-actions.ts`; take `organizationId` from the session, never from arguments; remove `@ts-nocheck` from `gl-actions.ts`.
- [ ] Brief §8 item 2: add `requireStaffContext()` (rejects patient sessions) and use it in staff-only actions.
- [ ] Brief §8 item 3: generate `TENANT_SCOPED_MODELS` from the schema; add org-scoped update/delete-by-id helpers.
- [ ] Brief §8 item 4: guard `/api/inventory/stores`, `/api/upload/*`, `/api/files`, `/api/tally-export/download`, `/api/mis/worker`, `/api/mis/export/[jobId]`, `/api/departments`; add rate limits to public-by-design routes.
- [ ] `FeatureFlag` table + `getFlag(scope, key)` helper; `access_engine` defaults to `legacy`.
- [ ] CI guardrails (§11) — Prompt A.

**Gate:** P0 list closed · `check:guards` running in CI with an allow-list · tenant leak suite green.

### Phase 1 — Access registry, no behaviour change (weeks 3–5)

- [ ] Registry for 3 modules first (`ess`, `hr`, `pharmacy`); human review of the shape.
- [ ] Registry for all remaining modules + `system-roles.ts` — Prompt B.
- [ ] Generators for the legacy maps + `tests/access-parity.test.ts`.
- [ ] Registry coverage test (every route prefix with a `page.tsx` maps to a module; every permission string in code exists).

**Gate:** parity test green · no runtime change · every `LEGACY-QUIRK` reviewed and marked keep or fix.

### Phase 2 — Org and identity (weeks 6–8)

- [ ] Schema + SQL migrations from §6 — Prompt D.
- [ ] Backfill script with `--dry-run` and before/after access diff.
- [ ] Company-aware login (subdomain or company code) with old global login still working.
- [ ] Minimal HR screen to link Employee ↔ User and set manager, department, designation.

**Gate:** every active user has an `Employee` and ≥1 `UserRole` · access diff empty · login unchanged.

### Phase 3 — Resolver in shadow (weeks 9–12)

- [ ] `getEntitlements`, `requireAccess`, `requireSelf`, `scopeWhere`, `getScopedPrisma`.
- [ ] JWT claims + `/api/auth/refresh`.
- [ ] Migrate server actions module by module — Prompt C. Order: `hr`, `pharmacy` (already hardened), then `finance`, `billing`, `ipd`, `reception`, `doctor`, the rest.
- [ ] Registry-driven proxy and sidebar behind the flag.
- [ ] MIS: every report declares module + permission.
- [ ] Turn on `shadow` for the internal company.

**Gate:** `guard-violations.json` empty · two weeks with no unexplained `AccessShadowLog` mismatches.

### Phase 4 — Admin UI and enforce (weeks 13–15)

- [ ] `/admin/access/*` screens from §8, add-user wizard, role editor, view-as, log, import, offboarding.
- [ ] Delegated-admin tests: cannot grant beyond own permissions; cannot edit own access; unit admin cannot touch other units.
- [ ] Break-glass company-owner account per company.
- [ ] Flip pilot company to `enforce`; then roll out company by company.
- [ ] Delete legacy maps and retire the parity test.

**Gate:** pilot stable for two weeks with no access incidents · legacy maps deleted.

### Phase 5 — My Workspace and approvals (weeks 16–19)

- [ ] Approvals engine: `ApprovalRule` (type, conditions such as amount bands, levels, approver resolver: manager / role / named user), `ApprovalRequest`, `ApprovalStep`; API `submitForApproval(type, entityId, payload)` and `decide(requestId, decision, note)`; delegation; SLA alerts via existing cron.
- [ ] Move leave, regularization, expense claims, discount OTP, write-off, PO approvals onto it.
- [ ] My Workspace pages from §8 + `/me/approvals`.
- [ ] Home-app landing.

**Gate:** leave and expense approvals run on the engine · inbox shows items from at least three modules.

### Phase 6 — Company apps (weeks 20–31)

- [ ] Payroll (India): salary structures and components, payroll run, payslips, PF, ESI, PT, TDS, Form 16, bank transfer file. Rules validated by a CA; one month parallel run against current payroll.
- [ ] Finance: company ledger, `finance.postJournal()` used by all packs, AP vendor bills, AR, bank reconciliation.
- [ ] Procurement & inventory generalized beyond pharmacy.
- [ ] CRM generic leads/contacts; internal helpdesk; assets assigned to employees.
- [ ] Each new module ships registry-first: definition, guards, tests, nav.

**Gate:** HR + payroll live for at least one company.

### Phase 7 — Plans and packaging (weeks 32–33; can move earlier if sales needs it)

- [ ] `SubscriptionPlan.modules`, `Company.plan_id` FK, `CompanyModule` add-ons and trials.
- [ ] Enforce limits (`max_users`, units/branches, `max_patients_per_month`) at create time.
- [ ] Superadmin: company → modules matrix (dependency-aware).

**Gate:** disabling a plan module hides it everywhere and blocks its actions.

---

## 11. CI guardrails

| Check | Fails when | Script |
|---|---|---|
| Guard coverage | An exported function in `app/actions/**` has no approved guard and isn't in the shrinking allow-list | `npm run check:guards` |
| Registry coverage | A route prefix with a `page.tsx` has no module, or a permission string in code isn't in the registry | `npm run check:registry` |
| Parity (P1–P3) | Generated maps differ from legacy maps | `tests/access-parity.test.ts` |
| Tenant leak suite | Any action run as company A returns or changes company B rows | `tests/tenant-leak/*.test.ts` |
| Scoped-model check | A model with `organizationId`/`company_id` isn't in the scoped-model list | `npm run check:scoped-models` |
| Migration lint | Any script calls `prisma migrate dev`; a migration lacks a hand-written SQL file | `npm run check:migrations` |
| Boundaries | A module imports another module's internals or a higher layer | ESLint rules from registry |

Work-package shape (one GitHub issue each): **scope** (module/concern), **files in scope**, **tests that must pass**, **out of scope**, **review table** expected at the end.

---

## 12. Agent prompts (copy-paste)

### Prompt A — guard coverage check (Phase 0)

```text
Read docs/ARCHITECTURE_BRIEF.md sections 7 and 8, and docs/COMPANY_OS_PLAN.md sections 0 and 11.
Goal: a CI check that fails when a server action has no proper auth guard. Do not change application code.
1. Write scripts/check-action-guards.ts using the TypeScript compiler API. List every exported async function in app/actions/**/*.ts.
2. Classify each function: STRONG if it calls requireRoleAndTenant, requireSuperAdmin, requireDevAdmin, requireDeveloper, hasPermission, a helper from app/lib/pharmacy-access.ts, requireAccess, requireSelf, or a name in scripts/guard-allowlist.json; WEAK if it only calls requireTenantContext; NONE otherwise.
3. Write every WEAK and NONE function to scripts/guard-violations.json (file -> function names).
4. The check fails on any violation not in that file, and also fails when a listed function has become STRONG, so the list only shrinks.
5. Add "check:guards" to package.json and run it in CI.
Finish with a table: file, function, classification, sorted NONE first.
```

### Prompt B — module registry with zero behaviour change (Phase 1)

```text
Read docs/ARCHITECTURE_BRIEF.md sections 3, 5, 6 and 9.2, and docs/COMPANY_OS_PLAN.md sections 0, 5 and 7.1.
Goal: one typed module registry. Runtime behaviour must not change.
1. Create app/lib/modules/types.ts exactly as in plan section 7.1, and app/lib/modules/registry.ts exporting MODULES with one entry per route tree in brief section 5. It must be edge-safe (no Node or Prisma imports).
2. Create app/lib/access/system-roles.ts with every system role in brief section 6.1: slug, home route, default permissions with scope, nav. Derive everything from current code; do not invent defaults.
3. Write generators that produce ROLE_ROUTES, PERMISSION_ROUTES, ROLE_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, the role-actions.ts copy and NAV_BY_ROLE from these files.
4. Where proxy.ts, session.ts, role-actions.ts and Sidebar.tsx disagree today, the registry holds the intended value and the generator applies a per-target override marked // LEGACY-QUIRK: <one-line note>.
5. Write tests/access-parity.test.ts asserting each generated map deep-equals the current hardcoded one.
6. Write scripts/check-registry.ts (plan section 11, registry coverage) and add "check:registry" to package.json.
7. Do not switch runtime code to the generated maps. Stop when the parity test passes.
Finish with a list of every LEGACY-QUIRK and what you think the intended value should be.
```

### Prompt C — migrate one module to requireAccess (Phase 3, repeat per module)

```text
Module: <MODULE_KEY>. Read docs/COMPANY_OS_PLAN.md sections 0, 5 and 7, app/lib/modules/registry.ts, app/lib/access/require-access.ts and app/lib/access/scope.ts.
1. In every file listed in the registry's actionsFiles for <MODULE_KEY>, replace requireTenantContext, requireRoleAndTenant and ad-hoc session.role checks with requireAccess('<module>.<resource>.<action>'), using the narrowest permission that matches what the function does. Add missing resources/actions to the registry entry.
2. Pass the old check as requireAccess(..., { legacy: () => <old check> }) so shadow mode can compare both.
3. For list and read queries, apply the returned where(model) to the Prisma where clause, and declare the model's owner fields in the registry entry.
4. Add tests: a user without the permission is rejected; a patient session is rejected; a user with OWN scope sees only their own rows; a user from another company sees nothing.
5. Remove the fixed functions from scripts/guard-violations.json. Run check:guards, check:registry, the parity test and the tenant leak suite; all must pass.
Touch only <MODULE_KEY> files and its registry entry. Finish with a table: function, permission, scope behaviour, old check.
```

### Prompt D — schema and backfill (Phase 2)

```text
Read docs/ARCHITECTURE_BRIEF.md section 4 and docs/COMPANY_OS_PLAN.md sections 0, 4 and 6.
Goal: Phase 2 schema and backfill. No change to login or access behaviour.
1. Add the models and fields from plan section 6 to prisma/schema.prisma, following existing conventions (id type, naming, @@map). Do not drop or rename anything. Keep User.username globally unique for now and add the per-company unique index alongside it.
2. Write the matching SQL by hand in a new folder under prisma/migrations/. Never run prisma migrate dev. Check with prisma validate and prisma migrate diff against a scratch database.
3. Write scripts/backfill-company-os.ts, idempotent: one Company per Organization unless scripts/company-map.json groups them; set Organization.company_id; create an Employee for each User without one; create UserRole rows from User.role (unit = the user's organization) and from UserUnitAccess; seed system roles per company from app/lib/access/system-roles.ts; copy ModuleConfig.enabled.
4. Add --dry-run. It prints counts and writes tmp/backfill-diff.json: for each user, effective permissions before (User.role via the Phase 1 maps) and after (new UserRole rows via the same system-role templates). Report any user whose sets differ.
5. Do not touch proxy.ts, session.ts, login or any server action.
Finish with: migration folder names, the dry-run summary on a local seed, and any users the backfill could not map.
```

---

## 13. Risks and open decisions

| Risk | Mitigation |
|---|---|
| Lock-out or over-grant at cutover | Shadow mode per company; reversible `enforce` flag; break-glass owner account; every change in `AccessChangeLog` |
| Rewrite temptation | Strangler approach; no folder moves until a module's guards are migrated and green |
| Resolver slows requests | Cache by user, unit, version; one indexed version read per action |
| Stale permissions in JWT | 10-minute tokens + version check; server actions always resolve fresh |
| Backfill breaks live access | Dry run on a production copy; empty access diff required |
| Payroll/statutory errors | CA validates PF, ESI, PT, TDS rules; one month parallel run |
| Scope creep | Build a business app only when a real company is waiting for it; registry-first |

Decisions (answered 2026-10-21 by Parikshit, with defaults chosen by the engineering agent where marked *default*):

- [x] **One company** operates many hospital units; **all employees sit under that one company**; employees hold different roles in different units. → A single `Company` row owns every existing `Organization` (`company-map.json` = all units → one company). Multi-company SaaS (Phase 7 plan/module packaging, per-company subdomains) is **deferred, not deleted** — the `Company` boundary is still built so it can be turned on later.
- [x] Units under the one company include the head-office unit (`HEAD_OFFICE_ORGANIZATION_ID`, which bills on behalf of many hospitals). Cross-unit visibility for head-office / multi-unit staff is **intentional**; do not "fix" cross-org reads without an explicit per-route decision.
- [x] *default* Login identifier: employee code, unique within the company (no subdomain needed with a single company); keep the old global username working until every user is migrated.
- [x] *default* Contractors and visiting consultants get an `Employee` record and My Workspace (they are rows with `employment_type`).
- [ ] Payroll: build in-house, or export to an existing payroll provider first? (Phase 6)
- [x] *default* Who owns access: **Company owner** (super-user) and **HR Admin** (module admin for HR roles) delegate per ADR-007; unit admins manage their own unit only. Confirm names before Phase 4.

---

## 14. Glossary (new terms only — see brief §11 for the rest)

- **Company** — tenant root: plan, billing, login domain. Owns units.
- **Unit** — today's `Organization` (a hospital, clinic, office…). Operational data is scoped to it.
- **Pack** — a set of industry-specific modules (Healthcare pack = today's HospitalOS features).
- **My Workspace / ESS** — employee self-service, always on for every active employee.
- **Data scope** — how far a permission reaches: OWN, TEAM, DEPARTMENT, UNIT, COMPANY.
- **Override** — per-user grant or deny of a single permission, with reason and optional expiry.
- **Entitlements** — the resolved set of modules and permissions (with scope) for a user in a unit.
- **Shadow mode** — new access engine evaluates alongside the old checks and logs disagreements without deciding.
- **Home app** — the route a user lands on after login.
