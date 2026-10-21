# HospitalOS — Architecture Brief

> **Audience:** an AI agent (or new engineer) who must understand the system before changing it.
> **Purpose:** describe what exists *today*, where access control and module gating actually live, and what must change to make modules assignable **per organization, per role and per user**.
> **Verified against the code on 2026-10-21** (branch `main`, 1,212 commits). Anything marked *(inferred)* was not traced end to end — verify before relying on it.
> **Status update (2026-10-21):** this brief describes the system as it was when written. Company-OS Phases 0–3 have since added a module registry, an access engine behind a per-unit flag, and guarded finance/HR/pharmacy actions — see `docs/COMPANY_OS_PROGRESS.md` for what is now true. Sections 6–8 (roles, enforcement layers, gaps) are the *baseline* those changes started from.
> Companion docs: `docs/PROJECT_ARCHITECTURE_FLOWCHART.md` (diagrams), `SAAS_MODULAR_ARCHITECTURE_PLAN_2026-06-10.md` (target-state plan), `HIMS_MODULE_CATALOGUE.md` (feature catalogue), `HANDOFF.md` (status).

---

## 0. TL;DR for the agent

1. One Next.js 16 app serves **five separate user realms** (staff, patient, superadmin, dev-portal, investor), each with its own cookie/JWT.
2. Staff data is **multi-tenant by `organizationId`** on a shared Postgres DB (an "organization" is also a hospital *unit*). The scoping is done by a Prisma `$extends` wrapper — but only for models listed in `TENANT_SCOPED_MODELS`.
3. Staff authorization is **hardcoded**, in four places that must be kept in sync by hand:
   `proxy.ts` (`ROLE_ROUTES`, `PERMISSION_ROUTES`, `ROLE_PERMISSIONS`) · `app/lib/session.ts` (`SYSTEM_ROLE_PERMISSIONS`) · `app/actions/role-actions.ts` (a third copy) · `app/components/layout/Sidebar.tsx` (`NAV_BY_ROLE`).
4. **The DB-driven pieces — `Role`, `Permission`, `ModuleConfig`, `SubscriptionPlan` — are mostly cosmetic.** They have admin/superadmin UIs, but the runtime gate (middleware, nav, server actions) does not read them. See §7.
5. So today you **cannot** really "set modules per user". That is the gap this brief exists to close (§9).

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.1 App Router, React 19.2, TypeScript |
| DB / ORM | PostgreSQL via Prisma 6 (`prisma/schema.prisma`, **237 models**, ~6,150 lines) |
| Auth | Custom JWT (`jose`, HS256) in httpOnly cookies, `bcryptjs`, optional MFA (`user_mfa`) |
| UI | Tailwind 4, `lucide-react`, `chart.js`, `next-themes` |
| Mutations | Server actions (`app/actions/*.ts`, 119 files) |
| HTTP | Route handlers (`app/api/**/route.ts`, 121 files) — webhooks, cron, uploads, public/voice, PDF/export |
| Realtime | `next-ws` websockets (`/api/ws/*`), `app/lib/realtime.ts`, `notification-realtime.ts` |
| Files | AWS S3 (`s3.ts`) and Azure Blob (`blob-azure.ts`), signed URLs (`signed-url.ts`) |
| Integrations | Razorpay, WhatsApp/AiSensy, OpenAI (clinical helpers, triage, voice STT/TTS), Zealthix (TPA), Tally, SMTP (`nodemailer`) |
| PDF | `@react-pdf/renderer`, `puppeteer-core` + `@sparticuz/chromium` |
| Deploy | AWS EC2 + pm2 (`ecosystem.config.js`, `next start`), also `vercel.json`, Dockerfile, `aws/`, `azure/` |

Required env is validated at boot by `app/lib/env.ts` (`validateServerEnv()`); `JWT_SECRET` is mandatory.

> Deploy caveat (see memory note *Prod deploy standalone mismatch*): `next.config.ts` sets `output: 'standalone'` while pm2 runs `next start`. Verify a deploy actually took effect via `git log` / `pm2 logs`.

---

## 2. Repository layout

```
proxy.ts                  Edge gate (Next 16 "proxy", formerly middleware): auth + role→route + idle timeout
backend/
  db.ts                   Prisma client + getTenantPrisma(orgId) tenant-scoping extension
  tenant.ts               requireTenantContext / requireRoleAndTenant / AuthError / ForbiddenError
  dev-portal.ts, email.ts, pill-scheduler.ts, services/
app/
  layout.tsx, page.tsx, login/, me/                  entry + shared staff self-service portal
  <module>/…              one top-level route tree per module (see §5)
  admin/                  hospital-admin console: users, roles, modules, masters, settings, MIS (81 pages)
  superadmin/             platform control plane (orgs, plans, users, analytics, audit)
  patient/                patient portal (separate auth)
  dev-portal/, investor/  further separate realms
  actions/                server actions, one file per domain
  api/                    route handlers (webhooks, cron, upload, public, voice, reports…)
  components/             shared UI incl. layout/Sidebar.tsx + AppShell.tsx
  lib/                    domain logic + helpers (billing, GST, commission, session, pharmacy-access…)
components/               older shared UI: booking/, ipd/, mis/
prisma/                   schema.prisma, migrations/, seed.ts
scripts/, aws/, azure/, docs/
```

Root also contains many one-off diagnostic scripts (`check*.ts`, `fix-*.ts`, `test-*.js`, `out*.json`, `*.xlsx`, `*.docx`) — they are **not** part of the application.

Path alias: `@/` → repo root (e.g. `@/backend/tenant`, `@/app/lib/session`).

---

## 3. The five identity realms

| Realm | Cookie | Entry | Guarded by | Idle timeout | Session type |
|---|---|---|---|---|---|
| **Staff** | `session` (+ `last_activity`) | `/login` | `proxy.ts` + server-action helpers | 15 min (`SESSION_TIMEOUT_MS`), JWT expires 8 h | `SessionData {id, username, role, name, specialty, organization_id, organization_slug, organization_name}` |
| **Patient** | `patient_session` | `/patient/login` | `proxy.ts` (`/patient/*`) | 30 min | `PatientSessionData` (`role:'patient'`) |
| **Super admin** | `superadmin_session` | `/superadmin/login` | `proxy.ts` + `requireSuperAdmin()` | — | `SuperAdminSessionData` (`role:'superadmin'`); separate `SuperAdmin` table |
| **Dev portal** | `dev_portal_session` | `/dev-portal/login` | `app/dev-portal/(protected)/layout.tsx` + `requireDevAdmin()/requireDeveloper()` | — | `User.is_dev_admin` / `is_developer` flags |
| **Investor** | `investor_session` | `/investor`, `/login/investor` | `app/investor/layout.tsx` | — | `InvestorCredential` table |

Also: `mfa_pending` cookie (staff passed password, awaiting TOTP; roles requiring MFA per `isMfaRequiredRole`), and a **kiosk / public** surface (`/kiosk`, `/hospital`, `/opd/display`, `/api/public/*`, `/api/voice/*`) that needs no login.

Staff login (`app/login/actions.ts`): username+password → `login-rate-limit.ts` → MFA branch → `createSession` → `audit` row in `system_audit_logs` → redirect by role.

**Landing page per role** (duplicated in `proxy.ts` and `login/actions.ts`):
`receptionist→/reception`, `doctor→/doctor/dashboard`, `lab_technician→/lab/technician`, `pharmacist→/pharmacy/billing`, `admin→/admin/dashboard`, `finance→/finance/dashboard`, `ipd_manager→/ipd`, `nurse→/nurse/dashboard`, `opd_manager→/opd-manager/dashboard`, `hr→/hr/dashboard`, `ot_manager→/ot/dashboard`, `er_staff→/er/dashboard`, `coordinator→/coordinator/dashboard`.

---

## 4. Multi-tenancy & data model

### 4.1 Hierarchy

```
SubscriptionPlan (global)  ←(string match, not FK)—  Organization.plan
Organization  = a hospital / unit   (slug, code, is_active, plan)
 ├─ OrganizationConfig   1:1  uhid_prefix, timezone, currency, session_timeout, feature flags
 │                            (enable_whatsapp/razorpay/ai_triage) + integration secrets
 ├─ OrganizationBranding 1:1
 ├─ ModuleConfig         N    (module_key, enabled, config_json)   unique(org, module_key)
 ├─ Role                 N    (slug, permissions JSON, data_scope, is_system)  unique(org, slug)
 ├─ Branch               N    physical sites inside the org
 ├─ User                 N    role is a free STRING; branch_id optional
 │    └─ UserUnitAccess  N    extra orgs an admin may switch into (+ can_access_all_units)
 └─ ~200 business tables each carrying organizationId
Permission (global catalogue: key "module.action", unique)
```

Key points:
- `User.role` is a plain `String`. The admin "create user" path validates it against a Zod enum `staffRoles` (`app/lib/validations.ts`) containing only **10** values — it omits `ot_manager`, `er_staff`, `coordinator`, `counsellor`, `call_center`, `crm_manager`, which the rest of the app does recognize.
- `User.username` is **globally unique** (not per-org).
- `Organization.plan` is a loose string (`free|starter|pro|enterprise`); `SubscriptionPlan.plan_code` is not a foreign key to it.
- **Unit switcher** (`unit-switch-actions.ts`, `UserUnitAccess`, `can_access_all_units`): an admin can switch the active `organization_id` in their session to another unit. Super Admin → Users page manages this (`getAdminUnitAccess` / `setAdminUnitAccess`).
- A "head office" concept exists in `app/lib/head-office-org.ts`.

### 4.2 How tenant scoping works

`backend/db.ts` exports `prisma` (raw, cached on `globalThis`) and `getTenantPrisma(organizationId)`, a `$extends` query wrapper that injects `organizationId` into reads and writes for every model in the `TENANT_SCOPED_MODELS` set, and hides `is_archived` rows for `OPD_REG, invoices, admissions, lab_orders, Clinical_EHR`.

Standard server-action pattern:

```ts
'use server';
const { db, session, organizationId } = await requireTenantContext();      // any logged-in staff OR patient
// or
const { db, session } = await requireRoleAndTenant(['admin', 'finance']);  // role allow-list
await db.invoices.findMany({ ... });                                       // auto-scoped
```

**Limits you must know (see §8):**
- Scoping covers only models **registered** in `TENANT_SCOPED_MODELS`. A comment in `db.ts` records that `PharmacyInventoryMovement` was "actively leaking" because it was never registered.
- `update` / `delete` / `upsert` **by `id`** are not org-scoped (memory note *Tenant prisma scoping gap*).
- `requireTenantContext()` falls back to the **patient** session, so it proves "somebody is logged in", not "staff".
- Several action files use the raw `prisma` and take `organizationId` as an argument.

### 4.3 Data domains (237 models, grouped)

| Domain | Representative models |
|---|---|
| Platform / identity | `Organization, OrganizationConfig, OrganizationBranding, Branch, SubscriptionPlan, ModuleConfig, Role, Permission, User, UserUnitAccess, SuperAdmin, user_mfa, PasswordResetOTP, PatientPasswordSetupToken, InvestorCredential, system_audit_logs, DocumentTemplate, AlertRule` |
| Patient & registration | `OPD_REG` (patient master), `PatientNote, PatientConsent, PatientAllergy, patient_external_records, ArchivedPatientRecord, RegistrationFieldConfig, DataImportJob` |
| OPD / clinical | `appointments, AppointmentSlot, AppointmentWaitlist, Department, Clinical_EHR, ClinicalEncounter, vital_signs, triage_results, AiHealthAssessment, PrescriptionTemplate, FollowUp, VideoCallRequest, DoctorLeave, CallLog, CounsellingSession, ICD10Master, OrderSet, ReferralOrder` |
| IPD | `admissions, beds, wards, BedTransfer, AdmissionBooking, PatientMovement, DischargeClearance, discharge_summaries, medical_notes, WardRound, DietPlan, NursingTask/Note/Assessment, MedicationAdministration, ShiftHandover, IPDVitals, IpdServiceMaster, IpdTariffRate, IpdPackage, IpdAdmissionPackage, IpdPackageTpaRate, IpdEstimate, IpdChargePosting, AdmissionConsultant` |
| OT / ER | `OTRoom, SurgeryMaster, SurgeryRequest, OTSchedule, PACClearance, OTChecklist, SurgeryNote, SurgeryConsumable, SurgeryBilling` · `ERRegistration, MLCRecord, ERVitals, EROrder, ERNote` |
| Lab / radiology | `lab_orders, lab_test_inventory, LabPanel(+Test), LabSampleTracking, LabReagentInventory, lab_staff, lab_audit_logs, radiology_imaging` |
| Pharmacy & stores | `pharmacy_medicine_master, pharmacy_batch_inventory, pharmacy_orders(+items), PharmacySupplier, PurchaseOrder(+Item), GoodsReceiptNote, PharmacyPurchaseInvoice(+Line), PharmacyReturn, NarcoticRegister, DispenseAllocation, PharmacyInventoryMovement, WardStock*` and general inventory: `stores, item_master, item_batches, store_stocks, indents, stock_transfers, stock_issues, stock_adjustments, stock_count_*, purchase_requisitions` |
| Billing & finance | `invoices, invoice_items, invoice_snapshots, payments, PaymentSplit, PaymentOrderIntent, Refund, CreditNote, PatientDeposit, CashClosure, charge_catalog, DiscountScheme, DiscountOTP, BillingOrderSet, Writeoff, FinancialPeriod, BankTransaction, HospitalBankAccount, Expense*, Vendor, TaxConfig, DunningRule/Log` |
| Accounting | `GL_Account, GL_JournalEntry, GL_JournalLine, GST_Invoice_Register, GST_Return_Filing, HSN_SAC_Master, Tally*`, `FixedAsset*, Asset*`, `Budget*` |
| Insurance / TPA | `insurance_providers, insurance_policies, insurance_claims, InsurancePreAuth, CorporateMaster, InsuranceReceipt(+Allocation), ClaimDispatch, DenialReason, ClaimShortPay, PayerSlaConfig, ZealthixApiKey` |
| Commission / referral | `Referrer, ReferrerServiceRate, ReferralCommission, ReferralPayoutStatement, DoctorCommissionConfig, DoctorServiceRate, DoctorCommission, DoctorPayoutStatement` |
| HR | `Employee, Attendance, AttendanceEvent, AttendanceRegularization, Holiday, LeaveType, LeaveRequest, ShiftPattern, ShiftAssignment` |
| CRM / engagement | `CRMLead, CRMActivity, CRMCampaign, DoctorReferralNetwork, PatientEngagement, PatientFeedback, FinancialCounselling` |
| Comms / support | `Notification, NotificationReceipt, Broadcast, Ticket(+Attachment/Note), ReleaseNote, MessageDeliveryLog, whatsapp_log, WhatsAppIncomingMessage, EmailJob, PillReminder` |
| Reporting (MIS) | `report_jobs, report_presets, report_schedules, report_access_logs, mis_daily_billing_rollups, mis_daily_pharmacy_rollups` |
| Optical / misc | `optical_orders(+items), optical_prescriptions, ambulance_requests` |

---

## 5. Modules (route trees) and who can reach them

Page counts are `page.tsx` files. "Gate" is the *only* thing that decides access today — the `ROLE_ROUTES` entry in `proxy.ts` (`admin` is allowed everywhere it is listed). Prefixes **not in `ROLE_ROUTES` are reachable by any logged-in staff user at the proxy level**; the layout/page/action must guard them.

| Module | Route | Pages | Roles allowed by `proxy.ts` | Perm key (route) | Main actions file(s) | Sidebar roles |
|---|---|---|---|---|---|---|
| Hospital admin console | `/admin` | 81 | admin | `admin.view` | `admin-actions, role-actions, module-config-actions, branch-actions, master-*, integration-actions…` | admin |
| Reception / registration | `/reception` | 22 | admin, receptionist | `opd.view` | `reception-actions, register-patient, patient-actions, uhid-merge-actions` | receptionist |
| Doctor | `/doctor` | 14 | admin, doctor | `opd.view` | `doctor-actions, emr-actions, ipd-emr-actions, order-set-actions` | doctor |
| OPD (queue/display) | `/opd` | 3 | admin, receptionist, doctor, opd_manager | `opd.view` | `opd-actions` | — |
| OPD manager | `/opd-manager` | 6 | admin, opd_manager | `opd.view` | `opd-manager-actions` | opd_manager |
| IPD | `/ipd` | 29 | admin, ipd_manager | `ipd.view` | `ipd-actions, ipd-*, bed-occupancy-actions` | ipd_manager |
| Discharge | `/discharge` | 1 | admin, ipd_manager, doctor | `ipd.view` | `discharge-actions, discharge-summary-actions` | — |
| Nurse | `/nurse` | 11 | admin, nurse | `ipd.view` | `nurse-actions, ipd-nursing-actions` | nurse |
| OT | `/ot` | 11 | admin, ot_manager, doctor, nurse | `ot.view` | `ot-actions` | ot_manager |
| Emergency | `/er` | 11 | admin, er_staff, doctor, nurse | `er.view` | `er-actions, triage-actions` | er_staff |
| Lab | `/lab` | 12 | admin, lab_technician | `lab.view` | `lab-actions` | lab_technician |
| Pharmacy | `/pharmacy` | 18 | admin, pharmacist | `pharmacy.view` | `pharmacy-actions, pharmacy-gst-actions, medicine-master-actions` | pharmacist |
| Finance | `/finance` | 38 | admin, finance | `finance.view` | `finance-actions, gl-actions, tally-*, expense-actions, period-actions…` | finance |
| Insurance / TPA | `/insurance` | 2 | admin, finance, ipd_manager | `insurance.view` | `insurance-*` (≈9 files), `zealthix-actions` | via finance/ipd |
| Master billing | `/billing` | 6 | admin, finance, ipd_manager, receptionist, opd_manager | `billing.view` | `master-billing-actions, billing-engine, writeoff-actions, fee-receipt-actions` | — |
| HR | `/hr` | 11 | admin, hr | `hr.view` | `hr-actions` (+ `app/lib/hr/hr-core.ts`) | hr |
| **Employee portal** | `/me` | 6 | **any staff** (not in `ROLE_ROUTES`) | — | `hr-self-service-actions` | all roles ("My Workspace") |
| **CRM** | `/crm` | 8 | **any staff** | — | `crm-actions, referral-actions` | crm_manager |
| **Call centre** | `/call-center` | 3 | **any staff** | — | `crm-actions` *(inferred)* | call_center |
| **Coordinator** | `/coordinator` | 1 | **any staff** | — | `coordinator-actions` | coordinator |
| **Counselling** | `/counselling` | 1 | **any staff** | — | `counselling-actions` | counsellor |
| Print centre / notifications / help | `/print-center, /notifications, /help-center` | 1/1/4 | any staff | — | `help-center-actions, notification-actions` | — |
| Kiosk / public | `/kiosk, /hospital, /opd/display` | 1/1/— | public | — | — | — |
| Patient portal | `/patient` | 26 | patient realm | — | `patient-*, register-patient` | patient |
| Super admin | `/superadmin` | 10 | superadmin realm | — | `superadmin-actions` | — |
| Dev portal | `/dev-portal` | 7 | dev realm | — | `backend/dev-portal.ts, release-notes-actions, broadcast-actions` | — |
| Investor | `/investor` | 3 | investor realm | — | `investor-actions, investor-auth-actions` | — |

Cross-cutting capabilities (not separate routes): audit trail (`audit.ts`, `audit-actions.ts`, `system_audit_logs`), MIS/report engine (`components/mis`, `mis-report-actions`, `/api/reports`, `/api/mis`, cron rollups), notifications & broadcasts, document templates, AI helpers (`ai-service.ts`, `drug-safety.ts`, triage, voice booking), GST & Tally exports, referral/doctor commission engines, and a **simulation/seed engine** (`sim-*.ts`, `/api/cron/sim-tick`, `/superadmin/simulations`).

Cron endpoints (`app/api/cron/*`, authenticated by `CRON_SECRET`): appointment-reminders, assessment-alerts, asset-maintenance-reminders, broadcast-dispatch, budget-alerts, depreciation, email-dispatch, mis-cleanup/jobs/rollup/scheduled-delivery, pill-reminders, sim-tick, sla-check.

---

## 6. Roles

### 6.1 System roles recognized by the code

| Role | Home | Notes |
|---|---|---|
| `admin` | `/admin/dashboard` | Bypasses every permission check (`hasPermission` returns true). Also the **default landing** for unknown roles. |
| `doctor` | `/doctor/dashboard` | |
| `receptionist` | `/reception` | |
| `lab_technician` | `/lab/technician` | |
| `pharmacist` | `/pharmacy/billing` | |
| `finance` | `/finance/dashboard` | |
| `ipd_manager` | `/ipd` | |
| `nurse` | `/nurse/dashboard` | |
| `opd_manager` | `/opd-manager/dashboard` | |
| `hr` | `/hr/dashboard` | |
| `ot_manager` | `/ot/dashboard` | in `proxy.ts` + Sidebar; **not** in `staffRoles` Zod enum, **not** in `session.ts` `SYSTEM_ROLE_PERMISSIONS` |
| `er_staff` | `/er/dashboard` | same gaps as `ot_manager` |
| `coordinator` | `/coordinator/dashboard` | Sidebar + login redirect only; no proxy entry |
| `counsellor`, `call_center`, `crm_manager` | — | Sidebar only; no proxy entry, no redirect, no Zod enum value |
| `patient` | `/patient/dashboard` | separate realm |

### 6.2 Role → route matrix (from `proxy.ts` `ROLE_ROUTES`; ✔ = allowed)

| Route ↓ / Role → | admin | doctor | recep | lab | pharm | finance | ipd_mgr | nurse | opd_mgr | hr | ot_mgr | er |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/admin` | ✔ | | | | | | | | | | | |
| `/doctor` | ✔ | ✔ | | | | | | | | | | |
| `/reception` | ✔ | | ✔ | | | | | | | | | |
| `/opd` | ✔ | ✔ | ✔ | | | | | | ✔ | | | |
| `/opd-manager` | ✔ | | | | | | | | ✔ | | | |
| `/lab` | ✔ | | | ✔ | | | | | | | | |
| `/pharmacy` | ✔ | | | | ✔ | | | | | | | |
| `/finance` | ✔ | | | | | ✔ | | | | | | |
| `/insurance` | ✔ | | | | | ✔ | ✔ | | | | | |
| `/ipd` | ✔ | | | | | | ✔ | | | | | |
| `/discharge` | ✔ | ✔ | | | | | ✔ | | | | | |
| `/nurse` | ✔ | | | | | | | ✔ | | | | |
| `/hr` | ✔ | | | | | | | | | ✔ | | |
| `/ot` | ✔ | ✔ | | | | | | ✔ | | | ✔ | |
| `/er` | ✔ | ✔ | | | | | | ✔ | | | | ✔ |
| `/billing` | ✔ | | ✔ | | | ✔ | ✔ | | ✔ | | | |

**Important quirk of the proxy check:** it first tests the flat role list; if that fails it falls back to `PERMISSION_ROUTES` + `ROLE_PERMISSIONS`. Because `ROLE_PERMISSIONS` grants broad `*.view` perms (e.g. `doctor` has `finance.view`, `insurance.view`; `nurse` has `lab.view`, `pharmacy.view`), a role can pass the permission fallback for routes it is *not* in the flat list for. Example: `doctor` has `finance.view` → passes `/finance`; `receptionist` has `ipd.view` → passes `/ipd`. So the flat table above **understates** real access. Treat `ROLE_PERMISSIONS` in `proxy.ts` as authoritative for page access.

### 6.3 Permission model

- Catalogue: `module.action` strings, 8 modules × 6 actions (`view, create, edit, delete, approve, export`) plus `reports.view/export` — defined in `role-actions.ts` (`ALL_PERMISSIONS`) and seeded to the `Permission` table.
- Route-level checks use only `*.view`. **Actions `create/edit/delete/approve/export` are almost never checked** at runtime; `hasPermission()` is called only from `hr-actions.ts` and `app/lib/hr/hr-core.ts`.
- Per-module role gates exist as hand-rolled allow-lists, e.g. `app/lib/pharmacy-access.ts` (`PHARMACY_CATALOG_ROLES`, `…OPERATE…`, `…PROCUREMENT…`, `…PO_APPROVE…`, `…RETURN…`) and `session.role` comparisons in ~28 action files.

---

## 7. Request pipeline & the four enforcement layers

```
Browser ─▶ proxy.ts ─▶ page / layout (RSC) ─▶ client component ─▶ server action / route handler ─▶ getTenantPrisma ─▶ Postgres
           (1)          (2)                                         (3)                                (4)
```

| # | Layer | What it checks today | Reads DB-driven config? |
|---|---|---|---|
| 1 | **`proxy.ts`** | valid JWT, idle timeout, role→route (+ `*.view` fallback). Exempts `/api/cron, reports, invoice, discharge, razorpay, public, voice, zealthix, organisations, doctors, appointments, notifications…` (those handlers self-authenticate). | **No** — hardcoded maps. Does not see `Role`, `ModuleConfig`, `Plan`. |
| 2 | **Layouts / `Sidebar.tsx` / `AppShell.tsx`** | Sidebar picks `NAV_BY_ROLE[session.role]` (1,049 lines of hardcoded nav; `MY_WORKSPACE` appended for everyone). Only `admin`, `doctor`, `reception`, `lab`, `ot`, `er`, `call-center`, `patient`, `superadmin`, `investor`, `dev-portal` have a `layout.tsx` at the module root; most others have none. | **No.** |
| 3 | **Server actions / route handlers** | `requireTenantContext()` (any session), `requireRoleAndTenant([...])` (20 files), ad-hoc `session.role` checks (28 files), `resolveRouteAuth({allowedStaffRoles})` for APIs. | **No** (except `hr`). |
| 4 | **Data scope** | `getTenantPrisma` injects `organizationId` for registered models. | n/a |

**Where `Role`, `Permission`, `ModuleConfig`, `SubscriptionPlan` are actually read:**
- `ModuleConfig`: read/written by `module-config-actions.ts` and rendered in `/admin` (`roles`, `workflows`, `opd-settings`, `hr` settings, `ModuleHubLayout`, dashboard) and `cash-compliance-actions.ts`. It stores **per-module business settings** (slot duration, deposit rules, TAT…) in `config_json`. The `enabled` flag is stored but **nothing in layers 1–3 consults it**. `MODULE_KEYS` there is only 8 values: `opd, ipd, lab, pharmacy, finance, hr, insurance, patient_portal` — no `ot, er, billing, crm, call-center, coordinator, counselling, mis, investor`.
- `Role` (custom roles): CRUD UI at `/admin/roles` via `role-actions.ts`. `User.role` stores a string, but `proxy.ts`/`Sidebar`/`hasPermission` only know the system role names. **A custom role created in the UI cannot be assigned to a user in a way the runtime honors.** Verified: the `roles` table is read/written only by `app/actions/role-actions.ts`; nothing in `proxy.ts`, `session.ts`, `Sidebar.tsx`, login or any other action queries it. The code comment in `proxy.ts` ("when a custom role system is used, this takes precedence") describes intent that is not implemented.
- `SubscriptionPlan` / `Organization.plan`: managed in `/superadmin/plans` and `updateOrganizationPlan`; shown in superadmin billing tabs. **No runtime enforcement** of `features[]`, `max_users`, `max_branches`, `max_patients_per_month`.

---

## 8. Known gaps & risks (prioritized)

**P0 — security / data isolation**
1. **Unauthenticated / weakly authenticated server actions.** Server actions are POST-addressable regardless of page. Files with no session helper at all: `gl-actions.ts`, `budget-actions.ts`, `gst-compliance-actions.ts`, `asset-management-actions.ts`, `insurance-gl-actions.ts` (these use raw `prisma` and accept `organizationId` as a parameter, `gl-actions.ts` is `@ts-nocheck`). `hr-actions.ts` / `hr-self-service-actions.ts` use `hasPermission`/hr-core (already hardened). Verify each caller path before assuming safe.
2. **`requireTenantContext()` accepts a patient session** → 120 action files prove only "someone is logged in". Only pharmacy (`pharmacy-access.ts`) and HR were hardened. Everything else relies on page-level gating that does not apply to direct action calls.
3. **Tenant scoping gaps:** `update/delete/upsert` by `id` aren't org-scoped; models missing from `TENANT_SCOPED_MODELS` leak across orgs (some such models are present in the schema — audit by diffing models-with-`organizationId` against the set).
4. **Route handlers with no role/org check** (they sit behind the `proxy.ts` staff-cookie gate unless exempted, so they are not anonymous, but any logged-in staff of any unit can call them; detected by text search — see `docs/COMPANY_OS_PROGRESS.md` for the per-route findings): e.g. `/api/inventory/stores`, `/api/upload/*`, `/api/files`, `/api/tally-export/download`, `/api/mis/worker`, `/api/mis/export/[jobId]`, `/api/departments`. Public-by-design ones (voice, org-lookup, self-register, health) should be reviewed for abuse/rate-limiting instead.

**P1 — correctness of access model**
5. **Four hand-synced copies** of role/permission/nav data (`proxy.ts`, `session.ts`, `role-actions.ts`, `Sidebar.tsx`); they already disagree (`receptionist` has `ipd.create/edit` in `session.ts` but only `ipd.view` in `role-actions.ts`; `proxy.ts` adds `ot/er/billing` perms the others lack).
6. **Roles recognized inconsistently:** `ot_manager`, `er_staff`, `coordinator`, `counsellor`, `call_center`, `crm_manager` are missing from different subsets of {Zod enum, `proxy.ts`, `SYSTEM_ROLE_PERMISSIONS`, login redirect, Sidebar}.
7. **`/crm, /call-center, /coordinator, /counselling` have no proxy guard** — any staff user (including `lab_technician`) can open them by URL.
8. **Permission fallback in `proxy.ts` is broad** (see §6.2) — "role X can't see module Y" is frequently false.
9. `ROLE_ROUTES` iteration uses `startsWith` on insertion order: `/opd` also matches `/opd-manager` first-hit; keep in mind when reordering.

**P2 — product / maintainability**
10. Module toggles, plan features and plan limits are not enforced (§7).
11. No module registry / dependency graph (e.g. IPD without Billing).
12. Business settings live in untyped `config_json` blobs with defaults duplicated in code.
13. Edge `proxy.ts` can't touch Prisma; any DB-driven gate must use a signed claim in the JWT or a cached lookup.

---

## 9. Target architecture — modules assignable per org, role and user

### 9.1 Principle

> **A capability is available iff** `Plan entitles the module` **∧** `org has module enabled` **∧** `user is granted the module/permission` — evaluated from **one registry**, enforced in the same four layers (proxy, nav, actions, data).

```
ENTITLED(user, module, action) =
      module ∈ Plan(org).modules ∪ Org.addons          // commercial   (superadmin)
  ∧   ModuleConfig(org, module).enabled                // operational  (hospital admin)
  ∧   action ∈ EffectivePermissions(user)              // security     (hospital admin)

EffectivePermissions(user) =
      (RolePermissions(user.role) ∪ UserGrant(user)) ∖ UserDeny(user)
      ∩ AllowedByModuleFeatures(org)
```

### 9.2 Components to build

1. **Module registry** — `app/lib/modules/registry.ts`, a single typed source of truth:
   ```ts
   export const MODULES = {
     ipd: { key:'ipd', name:'In-Patient', category:'clinical',
            routePrefixes:['/ipd','/api/ipd','/discharge','/nurse'],
            actionsFiles:['ipd-actions', …],      // for audit tooling
            permissions:['view','create','edit','delete','approve','export'],
            dependsOn:['registration','billing'],
            features:['beds','packages','tpa','discharge'],
            defaultRoles:['ipd_manager','nurse'],
            nav:[{label,href,icon,group,permission}] },
     …
   } as const;
   ```
   Cover **all** modules in §5 (add `ot, er, billing, crm, call_center, coordinator, counselling, mis, assets, budget, optical, inventory, patient_portal`). Everything below derives from it: `proxy.ts` route map, `Sidebar` nav, `MODULE_KEYS`, permission catalogue, the superadmin matrix.
2. **Single role definition** — move the four hand-synced maps into `app/lib/access/system-roles.ts` (system roles' default modules/permissions/home/nav); delete the copies in `proxy.ts`, `session.ts`, `role-actions.ts`, `login/actions.ts`, `Sidebar.tsx`.
3. **Make `Role` real** — `User.role` keeps the system slug; add `User.custom_role_id` (nullable FK → `Role`) *or* treat `Role.slug` as the canonical key and seed system roles per org (`seedSystemRoles` already exists). Effective permissions = DB role JSON.
4. **Per-user overrides** — new `UserModuleAccess(userId, module_key, mode: 'grant'|'deny', permissions String[], granted_by)` for "this one nurse also gets Pharmacy-view" or "this admin loses Finance".
5. **Entitlement resolver** — `app/lib/access/entitlements.ts`:
   `getEntitlements(orgId, userId)` → `{ modules: Set, permissions: Set, features: Map }`, cached per (org,user) for ~60 s and invalidated on role/module/plan/override change.
6. **Carry a compact claim in the JWT** — add `entitlement_version` (and optionally a short permission digest) to `SessionData`, so the Edge `proxy.ts` can allow/deny without Prisma. The proxy compares `entitlement_version` with a cached per-org version (Redis/KV or a tiny `/api/_internal/entitlement-version` fetch); on mismatch it forces a session refresh.
7. **Server guard** — `requireAccess(moduleKey, action)` in `backend/tenant.ts`: staff-session-only, then resolver check, then returns `{db, session}`. Replace bare `requireTenantContext()` in all staff actions (mechanical, module by module). Add a lint rule/test that every exported function in `app/actions/*` calls one of the approved guards.
8. **Nav from registry** — `Sidebar` renders `registry ∩ entitlements`; drop `NAV_BY_ROLE`.
9. **Plan → modules** — populate `SubscriptionPlan.features` with module keys (editions: Clinic, OPD Plus, Standard Hospital, Multispecialty, Pharmacy-only, Lab-only — see the SaaS plan §5); `Organization.plan` becomes an FK `plan_id`; enforce `max_users`, `max_branches`, `max_patients_per_month` at create-time.
10. **Superadmin & admin UIs**
    - Superadmin → *Organization → Modules* matrix (plan modules + add-ons, dependency-aware).
    - Hospital admin → *Modules* (enable/disable within plan, `config_json` settings), *Roles* (permission grid), *Users* (assign role + per-user module overrides).
11. **Tenant hardening** — generate `TENANT_SCOPED_MODELS` from the schema (every model with `organizationId`) and fail CI if one is missing; add org-scoped `updateMany/deleteMany({where:{id, organizationId}})` helpers; add a cross-tenant leakage test suite.

### 9.3 Rollout order (low risk first)

| Phase | Deliverable | Behavior change |
|---|---|---|
| 0 | Fix P0 items (§8 1–4); add tests | security only |
| 1 | Registry + single system-role file; generate old maps from it | none (parity test: generated maps == current maps) |
| 2 | `requireAccess()` guard; migrate module by module (start with pharmacy/HR patterns) | tightens access where it was open |
| 3 | Registry-driven nav + proxy | none for existing roles |
| 4 | Real custom roles (DB-driven) + `UserModuleAccess` overrides + admin UI | **new capability** |
| 5 | Plan → module entitlement + limits + superadmin matrix | **new capability** |
| 6 | JWT entitlement version / caching / invalidation | perf + immediacy |

**Constraints for every phase:** never run `prisma migrate dev` (shared dev DB has drift — use `migrate deploy` with hand-written SQL migrations); keep `admin` as a super-role within its org; keep the current role landing pages; ship behind a per-org feature flag with the old behavior as fallback; add a parity test before deleting any old map.

---

## 10. Conventions & gotchas

- **Server actions** are `'use server'` files under `app/actions`; return `{ success, data?, error? }`; call `revalidatePath` after writes; audit sensitive writes via `app/lib/audit.ts`.
- **Money/billing** invariants: `invoices.status` is a pure `Draft|Final|Cancelled` lifecycle; payment state derives from amounts (`app/lib/bill-status.ts`). Edit rights are lifecycle-based (Draft = all staff, Final = admin/finance, Cancelled = none). `OPD_FEE` was folded into `OPD` with an `is_fee_receipt` flag.
- **Time**: use `app/lib/ist.ts` / `timezone.ts`; org timezone is in `OrganizationConfig`.
- **Sequences/IDs**: `sequence-generator.ts`, UHID prefix from `OrganizationConfig.uhid_prefix`.
- **Secrets** in `OrganizationConfig` (Razorpay, SMTP, WhatsApp, OpenAI) — see `secure-config.ts`; never log them.
- **Branding/print**: `bill-branding.ts`, `pharmacy-branding.ts`, per-invoice hospital-name label.
- **Migrations pending** (per project memory, status may have changed — check `prisma migrate status`): referral/commission, bill status lifecycle, discharge summary, doctor commission, OPD_FEE→OPD, rendered-by attribution, admin unit switcher. Applied: TPA package pricing, refund payment method, invoice finalized-by, bill hospital-name label, HR employee portal.
- Root-level diagnostic scripts and spreadsheets are noise; don't edit or import them.
- Build needs `NODE_OPTIONS=--max-old-space-size=4096`; `predev` runs `scripts/check-deps-sync.js` and `prisma generate`.

---

## 11. Glossary

- **Organization / unit / tenant** — one hospital unit; the unit of data isolation.
- **Branch** — physical site within an organization.
- **Module** — a product area sold/enabled as a unit (OPD, IPD, Pharmacy…). Today only loosely defined; §9 formalizes it.
- **System role** — one of the hardcoded staff roles in §6.1. **Custom role** — a `Role` row created in `/admin/roles` (not yet honored at runtime).
- **Entitlement** — what the org's plan allows. **Permission** — what a user may do inside an entitled module.
- **Realm** — an independent login/cookie/audience (staff, patient, superadmin, dev-portal, investor).
- **MIS** — the reporting engine (presets, schedules, jobs, daily rollups).
- **TPA** — third-party administrator (insurance intermediary).
