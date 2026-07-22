# TPA Package Name Per-Provider — Design

Builds on the (not-yet-migrated) `feat/tpa-package-pricing` work: `IpdPackage` (global package catalog), `IpdPackageTpaRate` (package ↔ insurance provider rate override), and the TPA-aware `getPackagesForAdmission` / `resolvePackagePrice` flow in `app/actions/ipd-finance-actions.ts`.

## Problem

Different TPAs often use their own name for the same clinical package (e.g. hospital's "Cardiac Bypass" is Star Health's "CABG Package"). Admins need to:
1. Set a custom package name per TPA on the existing TPA Rates screen (`/admin/master/services`).
2. Create packages that only exist for one TPA ("exclusive" packages), from within that TPA's rate view.
3. Have the IPD admission package picker show only the patient's TPA's packages (their exclusive packages + shared packages with a rate for them), with other shared packages demoted to a clearly separated "standard rate" fallback section — never showing packages exclusive to a *different* TPA.

## Data model changes

- `IpdPackage.exclusive_provider_id Int?` (FK → `insurance_providers`, nullable). Null = shared/cash package (today's behavior). Set = visible only to that one TPA everywhere (Package List badge, TPA Rates view, admission picker).
- `IpdPackageTpaRate.tpa_package_name String?` (nullable). The TPA's own name for a *shared* package. Blank/null falls back to `IpdPackage.package_name`. Not used for exclusive packages (their `package_name` already is the TPA-specific name).
- `IpdAdmissionPackage.applied_package_name String?` (nullable). Snapshot of whichever name was resolved (TPA override or master name) at the moment the package was applied to the admission — mirrors the existing `applied_amount` snapshot. Downstream documents (estimate, invoice line item, discharge summary) read this snapshot, not a live lookup, so a later name edit doesn't retroactively change already-billed paperwork.

All three changes land in the same pending Prisma migration already tracked for TPA package pricing (still unapplied to the DB).

## Server actions

`app/actions/service-master-actions.ts`:
- New `createExclusivePackage(providerId, { package_code, package_name, total_amount, description?, inclusions?, exclusions? })` — creates the `IpdPackage` with `exclusive_provider_id` set, plus an `IpdPackageTpaRate` row (`tpa_amount = total_amount`) in the same transaction, so existing rate-resolution code needs no special-casing for exclusive packages.
- `bulkUpsertPackageTpaRates` extended to accept an optional `tpa_package_name` per row alongside `tpa_amount`.
- `listPackageTpaRates(providerId)` extended to also return this provider's exclusive packages (separate array or a `kind: 'shared' | 'exclusive'` flag per row), plus `tpa_package_name`.
- `listPackages()` (Package List tab) extended to include `exclusive_provider_id` and the provider's name for the badge.
- New `deleteExclusivePackage(packageId)` (admin-only, only allowed on packages with `exclusive_provider_id` set) for the exclusive-package table's delete action.

`app/actions/ipd-finance-actions.ts`:
- `resolvePackagePrice` → extended to `resolvePackageForPatient(packageId, patientId)`, returning `{ amount, name, is_tpa_rate, tpa_provider_name }` (adds resolved display name to the existing fields).
- `getPackagesForAdmission(admissionId)` — query changes to:
  - Resolve the patient's active TPA provider (unchanged: via `insurance_policies`).
  - **TPA bucket**: packages where `exclusive_provider_id = provider_id` OR a matching `IpdPackageTpaRate` row exists — name/amount resolved from the TPA rate/exclusive package.
  - **Standard bucket**: shared packages (`exclusive_provider_id IS NULL`) with no rate row for this provider — master name/cash amount, flagged for the amber "standard rate" warning as today.
  - Packages exclusive to any *other* provider are excluded from both buckets entirely.
  - No active policy (cash patient): only the standard bucket (shared packages), unchanged from today.
- `applyPackageToAdmission` — snapshots `applied_package_name` onto `IpdAdmissionPackage` alongside the existing `applied_amount`.
- Any other place that renders an applied package's name for a patient document (estimate builder, invoice line-item creation, discharge summary) reads `applied_package_name ?? package_name` instead of the raw master name.

## Admin UI — `app/admin/master/services/page.tsx`, Packages tab

**TPA Rates view** (existing `pkgView === 'tpa_rates'`, provider selected):
- Existing shared-packages table gets one more inline-editable column, "TPA Name" (next to Cash Rate/TPA Rate), backed by `tpaRateEdits`-style dirty-tracking and saved via the extended `bulkUpsertPackageTpaRates`.
- New "Exclusive packages" table above/below it, listing this provider's exclusive packages with inline-editable Code/Name/Rate and a delete action.
- New "+ Add Package" button (visible only when a provider is selected) opens a modal collecting code/name/rate/description → calls `createExclusivePackage`.
- Excel export/import template gains a "TPA Package Name" column; import only touches shared-package rows (exclusive packages stay a manual/modal flow).

**Package List view** (existing `pkgView === 'list'`):
- Exclusive packages appear in the same table with a `[{Provider name} only]` badge; row is read-only there (edits happen from the owning TPA's rate view).

## IPD admission package picker — `app/ipd/admission/[id]/page.tsx`

Dropdown groups results into two labeled sections instead of one flat list:
- **"{Provider} packages"** — this patient's TPA bucket (exclusive + rated shared packages), resolved name, green "negotiated rate" label, no warning.
- **"Other packages (standard rate)"** — the standard bucket, master name, existing amber "no {provider} price set" warning.

For cash/no-TPA patients, behavior is unchanged (flat list of shared packages).

## Out of scope

- No changes to `IpdEstimate` JSON item structure beyond ensuring whatever populates it also uses the resolved/snapshotted name.
- No bulk import/export path for exclusive packages — only individual creation via the modal.
- Migration application to the live DB is not part of this change (already a known pending step for the underlying TPA package pricing feature).
