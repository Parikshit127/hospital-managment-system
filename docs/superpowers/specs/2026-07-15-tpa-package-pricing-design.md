# TPA-Specific IPD Package Pricing — Design Spec

**Date:** 2026-07-15
**Status:** Approved (design), not yet implemented
**Module:** Admin Master Data (Packages) + IPD Billing (package application)

## 1. Problem

`IpdPackage.total_amount` (`prisma/schema.prisma:2905-2924`) is a single price. Real
hospitals negotiate different package rates per TPA/insurer. Today `applyPackageToAdmission`
(`app/actions/ipd-finance-actions.ts:789-886`) always charges `pkg.total_amount`, regardless
of the patient's insurer.

Goal: let staff set a TPA-specific price per package on the Packages tab
(`app/admin/master/services/page.tsx`), and have package application auto-resolve to that
TPA's negotiated rate when the patient has an active TPA policy.

## 2. Key findings from existing code

- Patient ↔ TPA link is **not** on `admissions`. It's `insurance_policies` (patient_id +
  provider_id, `schema.prisma:1409-1437`), status `'Active'`. A patient may have multiple
  Active policies; existing convention (`ipd-finance-actions.ts:2043-2047`) resolves via
  `orderBy: created_at desc, take 1` — "most recent active policy wins." This spec reuses
  that rule.
- Provider master is `insurance_providers` (`schema.prisma:1376-1407`), read via
  `getInsuranceProviders()` (`app/actions/insurance-actions.ts:39-52`).
- `IpdAdmissionPackage.applied_amount` (`schema.prisma:2930`) is already a per-application
  Decimal, decoupled from `IpdPackage.total_amount` — the correct place for a resolved TPA
  price to land without touching the master rate.
- `applyPackageToAdmission(admissionId, packageId)` reads `pkg.total_amount` three times:
  `applied_amount` (line 815), invoice line `unit_price` (line 833), audit log `amount`
  (line 875). All three must use the resolved amount.
- Admission page's package picker (`app/ipd/admission/[id]/page.tsx:2247-2317`) currently
  loads `listPackages({ limit: 200 })` (line 221) with no TPA awareness, and shows/sets
  `pkg.total_amount` directly (lines 2271, 2294).
- `getAdmissionFullDetails` (`app/actions/ipd-actions.ts:1543-1592`) already includes the
  patient's active `insurance_policies` but selects only `provider.provider_name`, not
  `provider_id` (lines 1552-1561) — needs `provider_id` added.
- Precedent table shape: `PayerSlaConfig` (`schema.prisma:5042-5058`) — `provider_id Int?`,
  `organizationId`, org-scoped index, FK to `insurance_providers`. This spec follows the same
  shape but adds a composite unique constraint (PayerSlaConfig doesn't need one; this model
  does, for upsert semantics).

## 3. Data model

New model, additive only (no changes to existing tables):

```prisma
model IpdPackageTpaRate {
  id             Int          @id @default(autoincrement())
  package_id     Int
  provider_id    Int
  tpa_amount     Decimal
  organizationId String
  created_at     DateTime     @default(now())
  updated_at     DateTime     @updatedAt

  package      IpdPackage          @relation(fields: [package_id], references: [id])
  provider     insurance_providers @relation(fields: [provider_id], references: [id])
  organization Organization        @relation(fields: [organizationId], references: [id])

  @@unique([package_id, provider_id, organizationId])
  @@index([organizationId])
  @@index([provider_id])
  @@map("ipd_package_tpa_rates")
}
```

Reverse relations to add:
- `IpdPackage.tpa_rates IpdPackageTpaRate[]`
- `insurance_providers.package_rates IpdPackageTpaRate[]`
- `Organization.ipd_package_tpa_rates IpdPackageTpaRate[]`

**No `prisma migrate` will be run as part of this work.** Schema-only change, staged for
manual DB apply — matches this project's convention for pending features (Referral &
Commission, Bill status lifecycle, Discharge summary, Doctor commission, OPD_FEE→OPD
migration all follow this pattern per project memory).

## 4. Backend actions (`app/actions/service-master-actions.ts`)

- `listPackageTpaRates(providerId: number)` — admin-only. Returns all active packages
  joined with any existing rate row for that provider:
  `{ package_id, package_code, package_name, total_amount, tpa_amount: number | null }[]`.
- `bulkUpsertPackageTpaRates(providerId: number, rates: { package_id: number; tpa_amount: number | null }[])`
  — admin-only, single `$transaction`. Upserts rows keyed on `[package_id, provider_id,
  organizationId]`; rows with `tpa_amount` null/cleared are deleted (not stored as 0).
  Audit-logged as `BULK_UPSERT_PACKAGE_TPA_RATES`, mirroring existing action conventions
  (e.g. `createPackage` at `service-master-actions.ts:191-204`).

## 5. Packages tab UI (`app/admin/master/services/page.tsx`)

Within the existing Packages sub-tab, add a local view toggle:
`[Package List] [TPA Rates]` (new state `pkgView: 'list' | 'tpa_rates'`). Not a new
top-level `SubTab` — TPA rates are package-scoped data, nested under Packages.

**TPA Rates view:**
- Provider `<select>` at top, sourced from `getInsuranceProviders()` (same source already
  used by `TpaProfileModal.tsx:8,165`).
- On provider change, call `listPackageTpaRates(providerId)`; render a table: Code | Name |
  Cash Rate | TPA Rate.
- TPA Rate cell: empty editable `<input>` with `placeholder={cash total_amount}` when unset
  (never pre-filled with the cash value — avoids accidentally persisting a redundant
  cash-equal row).
- Dirty cells tracked in local state (not saved on blur/individually).
- "Save All Changes" button, enabled only when there are pending edits, calls
  `bulkUpsertPackageTpaRates` once with the full changed set, toasts result, refetches.

## 6. Resolution logic (`app/actions/ipd-finance-actions.ts`)

New helper colocated near `applyPackageToAdmission`:

```ts
async function resolvePackagePrice(
    db: any, organizationId: string, patientId: string,
    packageId: number, fallbackAmount: number,
) {
    const policy = await db.insurance_policies.findFirst({
        where: { patient_id: patientId, status: 'Active' },
        orderBy: { created_at: 'desc' },
        select: { provider_id: true },
    });
    if (!policy) return { amount: fallbackAmount, providerId: null, isTpaRate: false };

    const rate = await db.ipdPackageTpaRate.findUnique({
        where: {
            package_id_provider_id_organizationId: {
                package_id: packageId, provider_id: policy.provider_id, organizationId,
            },
        },
    });
    return rate
        ? { amount: Number(rate.tpa_amount), providerId: policy.provider_id, isTpaRate: true }
        : { amount: fallbackAmount, providerId: policy.provider_id, isTpaRate: false };
}
```

`applyPackageToAdmission(admissionId, packageId)` — **signature unchanged**, no client-
supplied price param (resolution is fully server-side; avoids trust-boundary issues). Calls
`resolvePackagePrice` once right after fetching `pkg`, replaces all three `pkg.total_amount`
reads (lines 815, 833, 875) with the resolved amount. Audit log detail gains
`tpa_provider_id`, `is_tpa_rate`, `resolved_amount` fields.

**Fallback behavior:** if no Active policy, or no `IpdPackageTpaRate` row exists for the
resolved provider, silently fall back to `pkg.total_amount` — never blocks package
application. Missing TPA rates are surfaced to the *user* at picker time (§7), not enforced
as a hard requirement at apply time.

## 7. New read action for the picker

`getPackagesForAdmission(admissionId)` (new, in `ipd-finance-actions.ts` or `ipd-actions.ts`)
— resolves the patient's provider once (same logic as §6, factored to share), then returns
all active packages annotated with `{ resolved_amount, is_tpa_rate, tpa_provider_name }`.
Replaces `listPackages` as the data source for the admission page's package picker, so the
dropdown shows real resolved prices before the user clicks anything (not just after
selection) — consistent with the no-silent-substitution principle applied throughout this
feature.

## 8. Admission page picker (`app/ipd/admission/[id]/page.tsx`)

- `useEffect` at line 221: replace `listPackages({ limit: 200 })` with
  `getPackagesForAdmission(data.admission_id)`, gated on `data` being loaded.
- Dropdown list rows (~line 2294): show `resolved_amount` instead of `total_amount`.
- When `is_tpa_rate` is `false` but the patient has a resolved provider (`tpa_provider_name`
  present), show a small inline warning badge on that row, e.g. "Standard rate — no
  [Provider] price set" — visible **before** selection, in the list itself.
- On select (~line 2271): `setChargeRate` uses `resolved_amount` instead of `total_amount`.
- `getAdmissionFullDetails` (`app/actions/ipd-actions.ts:1552-1561`): add `id: true` (i.e.
  `provider_id`) to the `insurance_policies.provider` select. `getPackagesForAdmission`
  performs its own server-side resolution and is the sole source of truth for pricing shown
  in the picker — this field is not required for pricing. It is added so `data.patient`
  exposes the resolved provider id for any other UI on the page that wants to reference it
  (e.g. a future "TPA: [name]" label near the picker), without a second round trip.

## 9. Out of scope

- Bulk import/export of TPA rate sheets via the existing `MasterImportButton`/
  `MasterExportButton` components (`page.tsx:920-930`). Natural follow-up given those
  components already exist for Packages, but not required for this feature.
- Changes to `removeAdmissionPackage` / `breakOpenPackage`
  (`ipd-finance-actions.ts:892+`) — they key off `IpdAdmissionPackage.applied_amount`, which
  will already carry the resolved price once applied, so no changes needed.
- Changes to the discharge-settlement TPA-approval flow (`ipd-finance-actions.ts:2030-2093`)
  — that resolves `tpa_provider_id` on the *invoice* for claims/receivables tracking, an
  unrelated concern from package pricing.
- Any change to `IpdEstimate.package_id` / pre-admission estimate pricing
  (`schema.prisma:2953-2966`) — estimates are out of scope; this feature only affects actual
  package application on an admission.

## 10. Files touched (implementation checklist)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `IpdPackageTpaRate` model + 3 reverse relations. No migration run. |
| `app/actions/service-master-actions.ts` | Add `listPackageTpaRates`, `bulkUpsertPackageTpaRates`. |
| `app/admin/master/services/page.tsx` | Add `pkgView` toggle, TPA Rates table view, provider select, bulk save. |
| `app/actions/ipd-finance-actions.ts` | Add `resolvePackagePrice` helper; wire into `applyPackageToAdmission` (3 call sites); add `getPackagesForAdmission`. |
| `app/actions/ipd-actions.ts` | Add `provider_id` to `insurance_policies.provider` select in `getAdmissionFullDetails`. |
| `app/ipd/admission/[id]/page.tsx` | Swap package data source to `getPackagesForAdmission`; show resolved price + fallback warning badge in picker rows and on selection. |
