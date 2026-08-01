# Asset Register: bulk import + depreciation report

## Context

`app/admin/assets/page.tsx` (Asset Register — IT/housekeeping/reception fixed
assets) already has a working "Export Excel" button (`exportAssetRegister` in
`app/actions/report-export-actions.ts`) that produces a styled, presentation
`.xlsx` of the current filtered register. It has no bulk **import** and no
**report** beyond the raw list.

The codebase already has a generic, proven bulk-import pipeline used for
doctors/services/lab tests/packages/medicines/radiology master data:

- `app/lib/import/parser.ts` — `parseFile()` reads an uploaded `.xlsx/.csv`
  into `{ headers, previewRows, totalRows, data }`; `generateTemplateFile()`
  builds a blank/sample template for download.
- `app/lib/import/master-validators.ts` — a `MasterImportType` union, one
  `RowError`-producing validator per type, `MASTER_IMPORT_MAX_ROWS = 500`.
- `app/lib/import/master-templates.ts` — per-type template headers + sample
  row, used by both the download button and the template API route.
- `app/api/import/template/[type]/route.ts` — serves the generated template
  for a given `MasterImportType`.
- `app/components/master/MasterImportButton.tsx` — the full UI: Template
  download button, Import button → file picker → parse → validate →
  **preview modal** (valid-row sample + per-row error list, download-all-errors
  option) → **Import N rows** button → commits → done screen with
  imported/updated/failed counts and a downloadable error report.
- `app/actions/master-import-actions.ts` — `importMasterData(type, rows)`:
  per-row upsert keyed on a natural key from `UPSERT_CONFIG[type]` (create if
  no match, update if found), collects per-row failures, writes one audit-log
  entry for the whole batch.

Goal: reuse this pipeline for assets instead of building new upload/preview
UI, and add one new "Reports" surface for depreciation / book value —
data that is already computed and stored on every `FixedAsset` row
(`accumulated_depreciation`, `book_value`) but never summarized.

## Design

### 1. Import — new `asset_master` import type

Wire assets into the existing generic pipeline as a sixth `MasterImportType`:

- **`app/lib/import/master-validators.ts`**: add `'asset_master'` to the
  union. New `AssetRow` interface and `validateAssetRow`/case in
  `validateMasterRows`. Required: `asset_name`, `category` (free-text
  category name), `acquisition_cost` (number ≥ 0), `acquisition_date`
  (parseable date). Optional: `asset_code`, `location`, `department`,
  `serial_number`, `manufacturer`, `model_number`, `invoice_number`,
  `warranty_expiry`. Validation here is purely synchronous/structural
  (matches the existing validators — none of them hit the DB); it does
  **not** check that `category` matches a real category, since the client
  validator has no Prisma access. That check happens server-side per-row
  (see below), consistent with how e.g. `doctor_master`'s username-uniqueness
  is only caught at create time, not in the client validator.

- **`app/lib/import/master-templates.ts`**: add the `asset_master` header
  list (same column order as above) + one realistic sample row. Columns are
  deliberately the same shape as `exportAssetRegister`'s output columns
  (adjusted: category by name not object, no computed `book_value`/`status`/
  `next_maintenance` — those aren't inputs) so a register export can be
  hand-edited and re-imported.

- **`app/actions/asset-register-actions.ts`**: two new exported wrappers used
  only by the import dispatcher:
  - `createAssetFromImportRow(row)` — resolves `row.category` (trimmed,
    case-insensitive) against `getAssetCategories(...)`; if no match, returns
    `{ success: false, error: 'Category "<name>" not found — check spelling
    or add it in Asset Categories first.' }`. Otherwise delegates to the
    existing `addAsset(...)`, passing through `row.asset_code` if present
    (blank still auto-generates, unchanged behavior).
  - `updateAssetFromImportRow(id, row)` — same category resolution, then
    delegates to the existing `editAsset(id, ...)`.
  Both reuse all existing validation already inside `addAsset`/`editAsset`
  (required fields, cost ≥ 0, etc.) — no duplicated logic.

- **`app/actions/master-import-actions.ts`**: add to `UPSERT_CONFIG`:
  `asset_master: { model: 'fixedAsset', key: 'asset_code' }` (matches the
  schema's `@@unique([asset_code, organizationId])`). Add the
  `createAssetFromImportRow`/`updateAssetFromImportRow` cases to
  `createRow`/`updateRow`. Blank `asset_code` in a row → generic importer's
  existing "only look up existing when key is non-empty" behavior means it's
  always treated as a new asset (auto-numbered), never accidentally matched
  to another blank-code row.

- **`app/admin/assets/page.tsx`**: add
  `<MasterImportButton type="asset_master" onImportComplete={load} />` next
  to the existing Export Excel button. No new import UI code — this is the
  same Template/Import/preview/confirm flow already used across the Master
  Data hub, just pointed at assets.

- **Access control**: `importMasterData` already restricts to
  `session.role === 'admin'`, consistent with this page presumably already
  being admin-only.

### 2. Export — unchanged

Existing "Export Excel" (`exportAssetRegister`) stays exactly as-is. No
changes needed; it already covers "export all assets."

### 3. Reports — category-wise depreciation / book value

- **`app/actions/asset-register-actions.ts`**: new `getAssetDepreciationReport(filters?: { category_id?: string })`.
  Calls the existing `getFixedAssets` (same data `listAssets` already uses —
  no new query pattern), groups by `category.category_name`, and for each
  group sums `acquisition_cost`, `accumulated_depreciation`, `book_value`,
  and counts assets. Returns rows sorted by category name plus a grand-total
  row. Only `Active` + `Disposed` assets already returned by `getFixedAssets`
  are included as today; disposed assets keep contributing their last known
  book value/depreciation so the report reconciles with the register.

- **`app/actions/report-export-actions.ts`**: new
  `exportAssetDepreciationReport(filters?)` following the exact pattern of
  `exportAssetRegister` (same `ColumnSpec[]`/`generateExcelBuffer` call):
  columns Category, Asset Count, Total Cost, Accumulated Depreciation, Book
  Value, % Depreciated, with a totals row.

- **`app/admin/assets/page.tsx`**: new "Reports" button (next to Export
  Excel / Import) opens a modal — same modal styling already used for
  History/Move/Service/Dispose on this page — showing the category-wise
  table on screen (via `getAssetDepreciationReport`) with its own "Download
  Excel" action calling `exportAssetDepreciationReport`. One report type for
  now; if more report types are wanted later, they'd become additional
  tabs inside this same modal rather than a new page.

## Error handling

- Import: per-row failures (bad category name, validation errors) never
  block other rows — matches existing `importMasterData` behavior exactly.
  Category-not-found is the one asset-specific failure mode; the message
  names the offending value so it's fixable without re-reading code.
- Report: an org with zero assets renders an empty state ("No assets to
  report on yet") rather than a zero-row table with a misleading total.

## Testing

- `npx tsc --noEmit` after each file change (matches how the rest of this
  session's work was verified).
- Manual: import a small `.xlsx` with 2 new assets (one with a bad category
  name to confirm the row-level error), confirm they appear in the register
  with auto-generated codes; export the register, edit a row's location in
  Excel, re-import, confirm it updates rather than duplicating; open Reports,
  confirm category totals match manual sums from the register table.

## Out of scope

- CSV/Excel import of asset **categories** themselves (categories are few and
  already seeded/managed via the existing category flow).
- Maintenance/warranty report (already visible as due/overdue badges + the
  "Needs Attention" summary card on the existing table — would be
  redundant for v1).
- Changing the existing `exportAssetRegister` presentation format.
