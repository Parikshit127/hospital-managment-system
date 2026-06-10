# HospitalOS — Modular Multi-Tenant SaaS Architecture & Scale Plan

**Prepared:** 2026-06-10
**Goal:** Turn HospitalOS into a flexible, module-selectable, multi-tenant SaaS platform sellable from a single-doctor clinic up to a multispecialty hospital group — **target 100+ clients**, all managed from one superadmin control plane.
**Product decisions (locked):** Editions + add-ons packaging · Cloud SaaS with a dedicated-enterprise option · Usage metering now, automated billing later.
**Scope:** Architecture & approach plan. No code was changed.

---

## 1. The core idea in one sentence

A client buys an **Edition** (a pre-built bundle of modules) plus optional **add-ons**; the superadmin provisions their tenant; and what they can see and do is computed at runtime as **Plan entitlement ∩ Enabled modules ∩ User role** — enforced in three layers and backed by per-tenant data isolation.

This is achievable because **~80% of the plumbing already exists** in your codebase. The work is to centralize, enforce, and orchestrate it.

---

## 2. What you already have (foundation audit)

| Capability | Status | In code |
|---|---|---|
| Tenant data isolation | ✅ Strong | `getTenantPrisma(orgId)` auto-injects `organizationId` via Prisma `$extends` — row-level multi-tenancy on a shared DB |
| Per-org module toggles | ✅ Exists | `ModuleConfig` (module_key, enabled, config_json) + `toggleModule`, `getAllModuleStatuses`, `getModuleConfig` |
| Plans | ✅ Exists | `SubscriptionPlan` (plan_code, features[], max_users, max_branches, max_patients_per_month, pricing) |
| Per-org settings & integrations | ✅ Exists | `OrganizationConfig` (uhid_prefix, timezone, currency, enable_whatsapp/razorpay/ai_triage, SMTP, Tally, OpenAI keys) |
| Superadmin console | ✅ Rich | org CRUD, `updateOrganizationPlan`, plan CRUD, branches, config, branding, usage metrics, platform analytics, impersonation, audit log |
| RBAC | ✅ Exists | `Role`, `Permission`, custom roles per org |
| Multi-branch | ✅ Exists | `Branch` per org |
| Hospital typing | ✅ Exists | `Organization.hospital_type` (Clinic, Multi-Specialty, Super-Specialty, Nursing Home…) |

**The gaps (what this plan builds):**
1. No **single module registry** — module keys are scattered strings; nav/routes/actions aren't driven by one source of truth.
2. Module gating is **defined but not consistently enforced** — `ModuleConfig` exists, but routes, navigation, and server actions don't uniformly check it.
3. No **Edition → module entitlement mapping** — assigning a plan doesn't auto-configure modules.
4. No **module dependency graph** — nothing stops enabling IPD without Registration + Billing.
5. No **provisioning/seeding pipeline** per edition/hospital-type.
6. No **metering enforcement** against the limits the plan already declares.
7. Data isolation is good but lacks **automated cross-tenant leakage tests** and a path to **dedicated-DB enterprise tenants**.
8. Infra is a **single EC2** — needs pooling, horizontal scale, and caching for 100 tenants.

---

## 3. Target architecture — four pillars

```
                    ┌─────────────────────────────────────────┐
                    │         SUPERADMIN CONTROL PLANE          │
                    │  Tenants · Editions · Module Matrix ·     │
                    │  Add-ons · Limits/Metering · Provisioning │
                    └───────────────────┬───────────────────────┘
                                        │ writes
                    ┌───────────────────▼───────────────────────┐
   PILLAR 1 ───►    │  MODULE REGISTRY (single source of truth)  │
                    │  module → routes, nav, deps, edition, subs │
                    └───────────────────┬───────────────────────┘
                                        │ read by
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                ▼
 PILLAR 2: ENTITLEMENT ENGINE     PILLAR 3: PROVISIONING        PILLAR 4: SCALE/ISOLATION
 Plan ∩ ModuleConfig ∩ Role       Edition seeders, master        Pooling, ALB/Fargate,
 enforced at: middleware,         data templates, default         Redis cache, per-tenant
 nav, server actions, DB scope    roles, admin user               metering, dedicated DB opt
```

---

## 4. PILLAR 1 — The Module Registry (build this first)

One TypeScript file becomes the source of truth for everything: nav, routing, entitlement checks, plan mapping, and the superadmin UI. Illustrative shape:

```ts
// app/lib/modules/registry.ts
export type ModuleKey =
  | 'registration' | 'opd' | 'emr' | 'appointments' | 'pharmacy' | 'lab'
  | 'ipd' | 'ot' | 'er' | 'billing' | 'finance' | 'hr' | 'insurance'
  | 'crm' | 'patient_portal' | 'radiology' | 'analytics' | 'superadmin';

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  category: 'core' | 'clinical' | 'ancillary' | 'financial' | 'engagement' | 'platform';
  routePrefixes: string[];        // ['/ipd', '/api/ipd'] — used by middleware
  navGroup: string;               // sidebar grouping
  dependsOn: ModuleKey[];         // e.g. ipd → ['registration','billing']
  features: string[];             // sub-feature flags, stored in ModuleConfig.config_json
  defaultRoles: string[];         // roles this module needs
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  registration: { key:'registration', name:'Registration', category:'core',
    routePrefixes:['/reception','/api/patient'], navGroup:'Front Desk',
    dependsOn:[], features:['walk_in','pre_reg','uhid'], defaultRoles:['receptionist'] },
  ipd: { key:'ipd', name:'In-Patient (IPD)', category:'clinical',
    routePrefixes:['/ipd','/api/ipd','/api/admission','/api/discharge'], navGroup:'Clinical',
    dependsOn:['registration','billing'], features:['beds','packages','discharge','tpa'],
    defaultRoles:['ipd_manager','nurse'] },
  // ...every module
};
```

**Why this is the keystone:** today, adding/removing a module means touching nav, routes, and checks in many places. With a registry, every consumer (middleware, sidebar, server-action guard, superadmin matrix) reads the same definition. Granularity is handled by `features[]` stored in the existing `ModuleConfig.config_json` — so a clinic can have `emr` enabled but only the `prescriptions` feature, not `templates`.

---

## 5. Editions & add-ons (packaging)

Define editions as named module bundles. These become `SubscriptionPlan` rows whose `features[]` lists the included module keys.

| Edition | Target buyer | Included modules |
|---|---|---|
| **Clinic** | Single doctor / polyclinic | registration, emr (prescriptions), appointments, basic billing, patient_portal-lite |
| **OPD Plus** | Small hospital, OPD-heavy | Clinic + pharmacy, lab, appointments/queue, finance-lite |
| **Standard Hospital** | Mid-size hospital | OPD Plus + ipd, ot, er, finance (GL), hr, insurance |
| **Multispecialty Enterprise** | Large/group hospital | Everything + multi-branch, crm, radiology/RIS, advanced analytics, TPA/corporate, **dedicated-DB option** |
| **Pharmacy (vertical)** | Standalone pharmacy/chain | pharmacy POS + inventory + GST billing + supplier/PO |
| **Diagnostic Lab (vertical)** | Standalone lab/diagnostics | LIMS + lab billing + reports + patient_portal-lite |

**Add-ons** (toggle on any edition, à-la-carte): WhatsApp, Razorpay/online payments, Tally sync, AI features (triage, discharge-summary), Video/Teleconsult, ABDM/ABHA, extra branches, extra users, RIS/PACS, Telemedicine.

This gives you the "**only OPD**" sale (Clinic/OPD Plus) and the "**everything**" sale (Enterprise) from the same codebase — and a clean upsell path (Clinic → add Pharmacy add-on → upgrade to Standard).

---

## 6. PILLAR 2 — Entitlement engine (the enforcement)

**The rule:** a capability is available only if it passes all three gates:

```
ENTITLED = Plan.features.includes(module)        // commercial: did they buy it?
         ∧ ModuleConfig[module].enabled          // operational: is it switched on?
         ∧ userRole ∈ module.allowedRoles(RBAC)  // security: can THIS user use it?
```

Enforce in **four layers (defense in depth — never trust the client):**

1. **Middleware (edge):** map request path → module via `routePrefixes`; if not entitled, redirect/403. Cache the tenant's entitlement set (Redis) to avoid a DB hit per request.
2. **Navigation:** render the sidebar/menus from the registry filtered by entitlement — users never see what they can't use. (Drives the per-client custom admin panel you described.)
3. **Server actions / API:** a `requireModule('ipd')` guard composed with the existing `requireTenantContext()` / `requireRoleAndTenant()`. This is the real security boundary.
4. **Data:** already handled — `getTenantPrisma` row-scopes every query to the org.

Concrete guard shape (extends what you already have):

```ts
// backend/tenant.ts (extend)
export async function requireModuleContext(module: ModuleKey, roles: string[] = []) {
  const ctx = await requireTenantContext();
  const entitled = await getEntitlements(ctx.organizationId); // cached
  if (!entitled.has(module)) throw new ForbiddenError(`Module '${module}' not enabled`);
  if (roles.length && !roles.includes(ctx.session.role)) throw new ForbiddenError('Role denied');
  return ctx;
}
```

---

## 7. Module dependency graph

Encode `dependsOn` in the registry and enforce it both when superadmin toggles a module and when an edition is provisioned. Examples:

- `ipd` → requires `registration`, `billing`
- `pharmacy` billing → requires `billing`/`finance`
- `ot` → requires `ipd`
- `insurance/tpa` → requires `billing`
- `lab` / `radiology` → require `registration`

Toggling off a module warns about (or blocks) dependents. This prevents the #1 misconfiguration class ("IPD enabled but billing off → broken hospital").

---

## 8. PILLAR 3 — Superadmin control plane (what to add)

You already have org/plan/branch/config management. Add:

1. **Tenant Module Matrix** — a grid (modules × enabled) per tenant with an **"Apply Edition"** button that seeds the right `ModuleConfig` rows, plus individual add-on toggles. (`toggleModule` exists; wire it to superadmin context and the registry.)
2. **Edition manager** — define/edit editions as plan rows; changing an edition can optionally re-sync tenants on it.
3. **Provisioning wizard** — create tenant → pick edition + hospital_type → auto-seed (see §9).
4. **Limits & metering dashboard** — usage vs plan limits per tenant (see §10), with soft/hard caps.
5. **Health & isolation panel** — per-tenant status, last activity, error rate, and a "dedicated vs shared DB" indicator.
6. **Impersonation & audit** — already present; ensure every superadmin action is audit-logged (you have `system_audit_logs`).

---

## 9. PILLAR 3 — Tenant provisioning & onboarding

Make creating a client a **one-click, idempotent** operation. On `createOrganization(edition, hospital_type)`:

1. Create `Organization` + `OrganizationConfig` (sensible defaults by hospital_type).
2. **Seed `ModuleConfig` rows** from the edition's module list (+ chosen add-ons).
3. **Seed default Roles/Permissions** for the included modules (registry `defaultRoles`).
4. **Seed master-data templates** per hospital_type: specialties, departments, a starter `charge_catalog`, `IpdServiceMaster`/tariffs (hospital only), GST/HSN defaults, document templates.
5. Create the **org admin user** + send setup email.
6. Set **plan limits** (max_users/branches/patients) from the plan.

Build edition "presets" so a Clinic doesn't get IPD master data and an Enterprise gets the full set. This is what makes onboarding 100 clients sustainable instead of manual.

---

## 10. Metering now (billing later)

Track per tenant, enforce against the limits `SubscriptionPlan` already declares:

- **Patients/month** (`max_patients_per_month`), **active users** (`max_users`), **branches** (`max_branches`), **storage** (uploads).
- A lightweight `usage_events` / monthly rollup per org (you already have `getOrganizationUsageMetrics`/`getOrganizationUsageTrend` — extend these).
- **Soft limit** → warn in superadmin + tenant banner; **hard limit** → block new creates (configurable per plan).
- Expose a per-tenant usage page. When volume justifies it, an automated-billing module reads these meters (Razorpay subscriptions / invoicing) — deferred per your decision.

---

## 11. Data isolation strategy (shared default + dedicated enterprise)

- **Default (all editions):** shared DB + row-level scoping via `getTenantPrisma`. Harden with:
  - **Automated cross-tenant isolation tests** in CI (create 2 orgs, assert org A can never read org B) — this is the single most important multi-tenant safety net.
  - **PostgreSQL Row-Level Security (RLS)** as belt-and-suspenders beneath the app-level scoping, so even a missed `where` can't leak.
- **Dedicated enterprise tenants:** same codebase, separate RDS instance/database. Introduce a **tenant→datasource resolver**: a registry mapping `organizationId → connection string`; `getTenantPrisma` picks the shared pool or the dedicated pool. Provision dedicated DB during onboarding for Enterprise clients that require PHI residency/isolation. This satisfies enterprise procurement without forking the product.

---

## 12. PILLAR 4 — Scaling to 100+ clients (infrastructure)

Your current single EC2 + single RDS won't hold 100 tenants. Concrete upgrades:

**Database (highest risk):**
- **Connection pooling** — Prisma + many tenants = connection exhaustion. Put **RDS Proxy or PgBouncer** in front of PostgreSQL. Non-negotiable at scale.
- **Right-size + read replica** — a read replica for analytics/MIS/report queries so heavy reporting doesn't slow clinical writes.
- **Partition / archive** big tables later (invoices, `system_audit_logs`, messages) as volume grows.

**Application:**
- Move from single EC2 to **horizontal scale**: ALB + multiple stateless app instances, or **ECS Fargate** (you already have `aws/cloudformation.yml` for this — reconcile it with reality and use it). Sessions are JWT, so the app is already stateless-friendly.
- **Caching layer (Redis / ElastiCache):** cache per-tenant **entitlements**, `ModuleConfig`, and `OrganizationConfig` (keyed by org) so every request doesn't re-query. Invalidate on superadmin changes.

**Background work:**
- Your crons (reminders, daily accrual, claim/dunning) must run **across all tenants** reliably. Move to a proper **job runner/queue** (worker + schedule) rather than ad-hoc cron routes, with per-tenant iteration and failure isolation.

**Observability & ops:**
- **Per-tenant tagging** in logs/metrics (`organizationId` on every log line — your PHI-safe `logger.ts` is the place to add it).
- Error tracking (Sentry), uptime alerts on `/api/health`, per-tenant dashboards.
- **Per-tenant rate limiting** (noisy-neighbor protection) at Nginx/ALB.
- **CI/CD + staging** (dev → staging → prod) — essential once 100 clients depend on uptime.
- **Backups**: automated RDS backups for shared; separate backup policy per dedicated tenant; per-tenant data export capability (DPDP portability).

---

## 13. Security & compliance at multi-tenant scale

- **Cross-tenant leakage tests** (see §11) — the defining risk of multi-tenant SaaS.
- **Encrypt per-tenant secrets**: `OrganizationConfig` currently stores integration creds (e.g., `tally_password`, `razorpay_key_secret`, `smtp_pass`, `openai_key`) — these must be encrypted at rest (KMS/app-level field encryption), not plaintext columns.
- **PHI/DPDP**: field-level encryption for sensitive columns, per-tenant audit trail (`system_audit_logs` exists), consent records, breach process. Each tenant is a separate data-fiduciary context.
- **Per-tenant RBAC** stays scoped; superadmin actions fully audited.
- Tie in the **AWS access-control runbook** already added (`aws/security/`) for the operator side.

---

## 14. Implementation roadmap (phased)

**Phase 0 — Entitlement foundation (highest leverage):**
Build the **Module Registry**; wire **entitlement enforcement** into middleware + navigation + a `requireModule` server-action guard. Make the *existing* `ModuleConfig` actually gate the whole app. *Outcome: you can already sell "OPD-only" by toggling modules.*

**Phase 1 — Editions & provisioning:**
Define editions as plans; build the **provisioning wizard** + **per-edition seeders** + **superadmin module matrix** + dependency graph. *Outcome: onboard a clinic or a hospital in one click.*

**Phase 2 — Scale & isolation:**
Connection pooling, ALB/Fargate, Redis entitlement cache, **metering + limits**, **cross-tenant isolation tests + RLS**, encrypt config secrets, observability with per-tenant tags. *Outcome: ready to run 100 clients safely.*

**Phase 3 — Verticals & monetization:**
Pharmacy-only and Lab-only editions, **dedicated-DB enterprise** provisioning, automated subscription billing on top of the meters, ABDM/advanced add-ons. *Outcome: full product line + self-serve commercials.*

---

## 15. Risks & how to de-risk

| Risk | Severity | Mitigation |
|---|---|---|
| Cross-tenant data leakage | Critical | App scoping + **Postgres RLS** + **automated isolation tests in CI** |
| DB connection exhaustion at scale | High | **RDS Proxy/PgBouncer** before onboarding many tenants |
| Entitlement drift / inconsistent gating | High | **Single module registry**; enforce in middleware + actions, not ad-hoc |
| Plaintext tenant secrets in `OrganizationConfig` | High | Field-level encryption / KMS |
| Migrating existing tenant (Axten) into the model | Medium | Treat Axten as the first Enterprise tenant; backfill `ModuleConfig` from current usage |
| No tests across 254 pages | High | Add tests starting with entitlement + billing (also flagged in prior reports) |
| Single EC2 SPOF | High | ALB + multi-instance / Fargate before scaling clients |

---

## 16. Recommended approach (how to start)

1. **Build the Module Registry + entitlement engine first (Phase 0).** It's the keystone, it leverages your existing `ModuleConfig`, and it *immediately* unlocks selling differentiated module sets — even before editions/provisioning are pretty.
2. **Then editions + one-click provisioning (Phase 1)** so onboarding scales.
3. **Then harden for scale (Phase 2)** — pooling, isolation tests, caching, metering — *before* you cross ~10-15 live tenants.
4. **Migrate Axten** as Enterprise tenant #1 to validate the whole pipeline on a real org.
5. Defer billing automation and verticals (Phase 3) until you have paying tenants and proven load.

The crucial sequencing point: **don't onboard many clients before Phase 2 isolation + pooling are done.** A cross-tenant leak or a connection storm with real hospitals on the line is the one failure you can't walk back.

---

## Caveats

- This is an architecture plan, not an implementation; effort estimates depend on team size and the test/CI maturity (currently no automated tests — a prerequisite for safe multi-tenant changes).
- Designs reference your actual models/files (`ModuleConfig`, `SubscriptionPlan`, `getTenantPrisma`, `requireTenantContext`, superadmin actions); illustrative code shapes are sketches, not final.
- Regulatory/data-residency specifics for enterprise hospitals should be confirmed per-client before committing the dedicated-DB tier in contracts.

---

*Want this turned into an executable plan? I can next (a) draft the actual `registry.ts` + `requireModule` guard + middleware enforcement (Phase 0), or (b) define the concrete edition→module map as `SubscriptionPlan` seed data, or (c) write the cross-tenant isolation test harness. Say which and I'll build it.*
