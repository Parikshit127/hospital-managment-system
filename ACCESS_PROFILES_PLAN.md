# Per-employee Access Profiles — plan

Goal (2026-10-23): when an employee is added, choose **which modules they get and what they may do inside each**.
An HR login sees only HR; a receptionist sees My Workspace (attendance, leave, profile) + the Reception portal; and
every employee's permissions can be tuned individually.

Decisions (user, 2026-10-23)
1. **Who assigns:** Admin + HR. HR can hand out any module **except Admin console, Finance, Insurance/TPA**, can never
   change their own access and cannot give anyone the "assign access" right. Admin can hand out everything except the
   Admin console itself (admin stays a role, not a profile).
2. **Rollout:** per-employee switch. Only employees who have an *access profile* follow the new rules; everyone else
   keeps working exactly as today. No unit-wide `enforce` flip, no shadow period.

## What already exists (Company-OS phases 0-4) and what is missing

| Exists | Gap this plan closes |
|---|---|
| Module registry, permission catalogue (HR, Pharmacy, Finance-ledger, Admin-access), resolver, `requireAccess` | Only 4 modules have a catalogue; every other module is "legacy page rule by role" |
| `/admin/access/*` (role/override centric, admin only) | Not module-by-module; HR cannot use it; not in the Add Employee flow |
| Unit-wide `legacy → shadow → enforce` | All-or-nothing; nothing per employee |
| Claims in JWT, proxy module gate, sidebar `buildNav` | Only minted for `enforce` units |

## Design

**Access profile** = one row per employee-login in new table `user_access_profiles`:
`preset` (system role it started from; also mirrored into `users.role`), `modules[]` (apps they can open) and
`permissions{key: scope}` (fine-grained keys, only where a module has a catalogue). **WYSIWYG**: for a profiled user the
profile is the whole truth - their role template and one-off overrides are ignored.

* Having a profile row ⇒ the user is "managed". `requireAccess` treats a managed user as `enforce` regardless of the
  unit flag; claims are minted for them; proxy + sidebar use module membership.
* No profile row (or the table is missing because the migration is not applied) ⇒ byte-for-byte today's behaviour.
* Page level (proxy + sidebar): **every** module. Action level: modules on the catalogue (HR 19 keys, Pharmacy 6,
  Finance ledger 4). Other modules show "pages only" in the editor and get catalogues module-by-module later
  (Reception is next).
* My Workspace (`/me`) is always on for every employee.
* Presets are *derived*, never invented: modules = modules of the role's own sidebar + route gates; permissions = the
  catalogue keys the role holds today.

## Build steps

1. Schema + additive migration `user_access_profiles` (code is inert and safe before the migration is applied).
2. Pure core: `presets.ts` (presets, levels, assignable modules, HR restrictions), resolver `profile` input,
   `claimModules` managed branch, `checkProfileGrant` delegation rule.
3. Server: profile store (cached managed check), entitlement loader, `requireAccess` managed ⇒ enforce, claims minting,
   login landing page for managed users, claims refresher for every staff session.
4. Service + guarded actions (`access-profile-actions.ts`): editor lookups, save/reset profile, create employee with
   login, create login for existing employee. Change log + audit on every write; `access_version` bump.
5. UI: shared `AccessProfileEditor` (preset → module cards → level/permissions → "what they will see" preview);
   HR Add Employee (rebuilt), HR employee detail "Login & Access" card, employee list login/access columns,
   admin user page "Module access" card, `/me` "no access" banner.
6. HR hardening: deactivating an employee can also disable the login; mobile `capabilities` follow the engine.
7. Tests (unit + database-backed), typecheck, `check:*` scripts, production build.

## Not done on purpose (stated honestly)

* Detailed permissions for modules without a catalogue (Reception, OPD, IPD, Lab, Nursing, ...): page-level only
  until their actions are moved onto `requireAccess` (~820 actions repo-wide, one module at a time).
* Server actions that compare `session.role` inline still use the user's preset role.
* Offboarding does not kill an already-issued JWT (existing limitation, see `docs/COMPANY_OS_PROGRESS.md`).
* Profiles apply in the employee's home unit (multi-unit non-admins are future work).

---

## Status (2026-10-23) - built and verified, NOT committed, migration NOT applied to the shared DB

**Verified:** `tsc` clean · 205 unit + 75 database-backed tests green (scratch Postgres) · `check:registry/parity/guards/migrations`
OK · production `next build` compiles · live dev server against a scratch DB: managed receptionist reaches only
Reception + My Workspace (Billing/IPD/HR/Finance bounce to `/me?reason=no-access`), managed HR reaches only HR, unmanaged
users behave exactly as before, HR created an employee + login over real server-action calls, was refused Finance/Insurance/
Finance base role (nothing half-created), mid-session claims upgraded via `/api/auth/refresh`.

**Files:** `prisma/migrations/20261023120000_user_access_profiles` · `app/lib/access/{presets,editor-ops,profile-store,profile-service,landing,check-access}.ts`
· resolver/claims/`requireAccess` changes · `app/actions/access-profile-actions.ts` · `app/components/access/*` ·
HR Add Employee (rebuilt), employee list columns, employee "Login & Access" tab, admin user page card · `hr.access.assign` permission.

**To go live:** `npx prisma migrate deploy` (the code is safe before this - every read swallows a missing table - but the
feature does nothing until the table exists). Then: Admin or HR → HR → Employees → Add Employee → "Give a system login".
Existing employees: open the employee → Login & Access.

**Known limits:** see "Not done on purpose" above. Plus: a profile applies in the employee's home unit; a user mid-session
who is first given a profile picks it up within ~5 min (background refresh) or at next sign-in; revoking is the same.
