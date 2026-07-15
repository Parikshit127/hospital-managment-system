# TPA-Specific IPD Package Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin staff set TPA/insurer-specific prices for IPD packages on the Packages
tab, and have `applyPackageToAdmission` auto-resolve to the patient's TPA rate (falling back
to the cash `total_amount`) when a package is applied to an admission.

**Architecture:** One new Prisma model (`IpdPackageTpaRate`, schema-only — no migration run)
storing per-`(package, provider)` prices. A provider-first "rate sheet" view nested inside the
existing Packages tab lets staff bulk-edit prices for one TPA at a time. Price resolution is
entirely server-side: a shared helper looks up the patient's most-recent Active
`insurance_policies` row, then the matching `IpdPackageTpaRate`, falling back to
`IpdPackage.total_amount`. Both the package-apply action and a new picker-data action use this
helper, so the admission page always shows the same price it will actually charge.

**Tech Stack:** Next.js App Router (server actions, `'use server'`), Prisma, React (client
components, `'use client'`), Zod validation, `react-hot-toast`, Tailwind.

## Global Constraints

- **No `prisma migrate` / no DB migration apply in this plan.** Every Prisma schema change is
  additive-only and stays staged in `prisma/schema.prisma` for manual migration later — this
  matches the project's existing convention for pending features (Referral & Commission, Bill
  status lifecycle, Discharge summary, Doctor commission, OPD_FEE→OPD migration are all in
  this same "code done, DB migration NOT applied yet" state per project memory). Do not run
  `npx prisma migrate dev`, `npx prisma db push`, or any command that touches the live
  database schema.
- `npx prisma generate` (client generation only, no DB write) MAY be run after schema edits so
  TypeScript picks up the new model — this does not touch the database.
- No test runner is configured in this repo (no jest/vitest, no `*.test.ts` files found).
  Verification is via `npx tsc --noEmit` (type check) and `npm run build` (Next.js build),
  plus manual smoke-checks of server action logic where feasible. Do not introduce a test
  framework as part of this plan.
- Admin-only guard pattern for master-data mutations: `if (session.role !== 'admin') return { success: false, error: 'Admin only' };` — copy this exact pattern for new actions (see `app/actions/service-master-actions.ts:64,79,94`).
- Server actions return `{ success: true, data }` or `{ success: false, error }` — never throw
  to the client. Every new action must follow this shape.
- `serialize()` helper (`app/actions/service-master-actions.ts:5-8`) converts Prisma `Decimal`
  to `number` for client consumption — every new action returning Decimal fields must run its
  result through `serialize()`.
- Two files touched by this plan (`app/actions/ipd-actions.ts`, `app/ipd/admission/[id]/page.tsx`) already have pre-existing **uncommitted** local changes from unrelated prior work in
  this working tree. Tasks that touch these files anchor edits with unique surrounding text
  (via the `Edit` tool's old_string/new_string), not raw line numbers, and must re-read the
  current file content immediately before editing (do not trust line numbers from this plan
  or the spec — they may have shifted further by execution time).

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `prisma/schema.prisma` | Add `IpdPackageTpaRate` model + reverse relations on `IpdPackage`, `insurance_providers`, `Organization`. |
| `app/actions/service-master-actions.ts` | Add `listPackageTpaRates`, `bulkUpsertPackageTpaRates` — TPA rate-sheet CRUD. |
| `app/admin/master/services/page.tsx` | Add "TPA Rates" sub-view inside the Packages tab: provider select, bulk-editable rate table, Save All Changes. |
| `app/actions/ipd-finance-actions.ts` | Add `resolvePackagePrice` helper; wire into `applyPackageToAdmission` (3 call sites); add `getPackagesForAdmission`. |
| `app/actions/ipd-actions.ts` | Add `provider_id` to `insurance_policies.provider` select inside `getAdmissionFullDetails`. |
| `app/ipd/admission/[id]/page.tsx` | Swap package picker's data source to `getPackagesForAdmission`; show resolved price + fallback warning badge. |

---

### Task 1: Prisma schema — `IpdPackageTpaRate` model

**Files:**
- Modify: `prisma/schema.prisma` (insert new model after `IpdAdmissionPackage`, which ends at line 2951; add reverse relations to `IpdPackage`, `insurance_providers`, `Organization`)

**Interfaces:**
- Produces: Prisma model `IpdPackageTpaRate` with fields `id: Int`, `package_id: Int`,
  `provider_id: Int`, `tpa_amount: Decimal`, `organizationId: String`, `created_at: DateTime`,
  `updated_at: DateTime`; unique constraint name `package_id_provider_id_organizationId`
  (Prisma's default compound-unique name for `@@unique([package_id, provider_id, organizationId])`);
  accessed in later tasks via `db.ipdPackageTpaRate` (Prisma camelCases model names for the
  generated client — verify this in Task 2 Step 2).

- [ ] **Step 1: Read the current file section to confirm exact insertion point**

Read `prisma/schema.prisma` lines 2900-2955 to find the exact text immediately after the
`IpdAdmissionPackage` model's closing `}` and before `model IpdEstimate {`.

- [ ] **Step 2: Insert the new model**

Using the `Edit` tool, find this exact existing text (the end of `IpdAdmissionPackage` and
start of `IpdEstimate`):

```prisma
  @@index([admission_id])
  @@index([organizationId])
  @@index([admission_id, status])
  @@map("ipd_admission_packages")
}

model IpdEstimate {
```

Replace it with:

```prisma
  @@index([admission_id])
  @@index([organizationId])
  @@index([admission_id, status])
  @@map("ipd_admission_packages")
}

// TPA-specific package pricing — one row per (package, provider). A package with
// no row here for a given provider falls back to IpdPackage.total_amount (the
// cash rate) when applied to an admission. See applyPackageToAdmission /
// resolvePackagePrice in ipd-finance-actions.ts.
model IpdPackageTpaRate {
  id             Int      @id @default(autoincrement())
  package_id     Int
  provider_id    Int
  tpa_amount     Decimal
  organizationId String
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  package      IpdPackage          @relation(fields: [package_id], references: [id])
  provider     insurance_providers @relation(fields: [provider_id], references: [id])
  organization Organization        @relation(fields: [organizationId], references: [id])

  @@unique([package_id, provider_id, organizationId])
  @@index([organizationId])
  @@index([provider_id])
  @@map("ipd_package_tpa_rates")
}

model IpdEstimate {
```

- [ ] **Step 3: Add the reverse relation on `IpdPackage`**

Find this exact text (the `IpdPackage` model, `admission_packages` line):

```prisma
  admission_packages IpdAdmissionPackage[]
  organization       Organization          @relation(fields: [organizationId], references: [id])

  @@unique([package_code, organizationId])
  @@index([organizationId])
  @@index([organizationId])
  @@map("ipd_packages")
}
```

If the two `@@index([organizationId])` lines above don't match exactly (re-check by reading
`prisma/schema.prisma:2905-2924` first — the actual current text has only ONE
`@@index([organizationId])`), use this corrected find/replace instead:

Find:
```prisma
  admission_packages IpdAdmissionPackage[]
  organization       Organization          @relation(fields: [organizationId], references: [id])

  @@unique([package_code, organizationId])
  @@index([organizationId])
  @@map("ipd_packages")
}
```

Replace:
```prisma
  admission_packages IpdAdmissionPackage[]
  tpa_rates          IpdPackageTpaRate[]
  organization       Organization          @relation(fields: [organizationId], references: [id])

  @@unique([package_code, organizationId])
  @@index([organizationId])
  @@map("ipd_packages")
}
```

- [ ] **Step 4: Add the reverse relation on `insurance_providers`**

Find this exact text (end of the `insurance_providers` model):

```prisma
  organization       Organization         @relation(fields: [organizationId], references: [id])
  policies           insurance_policies[]
  insurance_receipts InsuranceReceipt[]
  sla_configs        PayerSlaConfig[]
  preauths           InsurancePreAuth[]

  @@index([organizationId])
}
```

Replace with:

```prisma
  organization       Organization         @relation(fields: [organizationId], references: [id])
  policies           insurance_policies[]
  insurance_receipts InsuranceReceipt[]
  sla_configs        PayerSlaConfig[]
  preauths           InsurancePreAuth[]
  package_rates      IpdPackageTpaRate[]

  @@index([organizationId])
}
```

- [ ] **Step 5: Add the reverse relation on `Organization`**

Read `prisma/schema.prisma` around line 11-100 to find the `Organization` model's list of
back-relations (it will have many `SomeModel[]` lines — e.g. `insurance_providers
insurance_providers[]` around line 55). Find the line:

```prisma
  insurance_providers           insurance_providers[]
```

Replace with:

```prisma
  insurance_providers           insurance_providers[]
  ipd_package_tpa_rates         IpdPackageTpaRate[]
```

(If the exact surrounding whitespace/alignment differs from what's shown here, match
whatever the file actually contains — read the surrounding 10 lines first and preserve the
existing column alignment style used by neighboring relation fields in that model.)

- [ ] **Step 6: Validate the schema parses (no DB touch)**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (or equivalent success message,
no errors). This only parses the schema file — it does not connect to or modify the database.

- [ ] **Step 7: Regenerate the Prisma client (type generation only, no DB write)**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx prisma generate`
Expected: success message, no errors. Confirms the new `db.ipdPackageTpaRate` accessor
compiles into the generated client types before Task 2 relies on it.

- [ ] **Step 8: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add IpdPackageTpaRate model for TPA-specific package pricing

Schema-only change — no migration applied. Stores one price row per
(package, provider), consumed by applyPackageToAdmission's price
resolution and the new Packages-tab rate-sheet UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend actions — `listPackageTpaRates`, `bulkUpsertPackageTpaRates`

**Files:**
- Modify: `app/actions/service-master-actions.ts` (add after `deletePackage`, which ends
  around line 261, before the `// ---- Radiology/Imaging` comment)

**Interfaces:**
- Consumes: `requireTenantContext()` (`app/actions/service-master-actions.ts:2`), `serialize()`
  (`service-master-actions.ts:5-8`), `db.ipdPackage`, `db.ipdPackageTpaRate` (from Task 1),
  `db.system_audit_logs`.
- Produces:
  - `listPackageTpaRates(providerId: number): Promise<{ success: true; data: { package_id: number; package_code: string; package_name: string; total_amount: number; tpa_amount: number | null }[] } | { success: false; error: string }>`
  - `bulkUpsertPackageTpaRates(providerId: number, rates: { package_id: number; tpa_amount: number | null }[]): Promise<{ success: true; data: { upserted: number; deleted: number } } | { success: false; error: string }>`

- [ ] **Step 1: Read current end-of-file section to confirm insertion point**

Read `app/actions/service-master-actions.ts` lines 245-270 to find the exact text of
`deletePackage`'s closing and the `// ---- Radiology/Imaging` comment that follows.

- [ ] **Step 2: Add `listPackageTpaRates`**

Using the `Edit` tool, find this exact text:

```ts
export async function deletePackage(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.ipdPackage.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_PACKAGE', module: 'master-data',
      details: `Deleted package ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Radiology/Imaging (radiology_imaging) ----
```

Replace with:

```ts
export async function deletePackage(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.ipdPackage.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_PACKAGE', module: 'master-data',
      details: `Deleted package ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Package TPA Rates (IpdPackageTpaRate) ----
// Provider-first rate sheet: pick a TPA, see/edit its negotiated price for every
// active package. A package with no row here falls back to IpdPackage.total_amount
// when applied (see resolvePackagePrice in ipd-finance-actions.ts).

export async function listPackageTpaRates(providerId: number) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const packages = await db.ipdPackage.findMany({
      where: { organizationId, is_active: true },
      orderBy: { package_name: 'asc' },
      select: { id: true, package_code: true, package_name: true, total_amount: true },
    });
    const rates = await db.ipdPackageTpaRate.findMany({
      where: { organizationId, provider_id: providerId },
      select: { package_id: true, tpa_amount: true },
    });
    const rateByPackageId = new Map(rates.map((r: any) => [r.package_id, r.tpa_amount]));
    const rows = packages.map((p: any) => ({
      package_id: p.id,
      package_code: p.package_code,
      package_name: p.package_name,
      total_amount: p.total_amount,
      tpa_amount: rateByPackageId.has(p.id) ? rateByPackageId.get(p.id) : null,
    }));
    return { success: true, data: serialize(rows) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function bulkUpsertPackageTpaRates(
  providerId: number,
  rates: { package_id: number; tpa_amount: number | null }[],
) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };

    let upserted = 0;
    let deleted = 0;
    await db.$transaction(async (tx: any) => {
      for (const r of rates) {
        if (r.tpa_amount === null || r.tpa_amount === undefined) {
          const del = await tx.ipdPackageTpaRate.deleteMany({
            where: { package_id: r.package_id, provider_id: providerId, organizationId },
          });
          deleted += del.count;
          continue;
        }
        await tx.ipdPackageTpaRate.upsert({
          where: {
            package_id_provider_id_organizationId: {
              package_id: r.package_id, provider_id: providerId, organizationId,
            },
          },
          create: {
            package_id: r.package_id, provider_id: providerId, organizationId,
            tpa_amount: r.tpa_amount,
          },
          update: { tpa_amount: r.tpa_amount },
        });
        upserted += 1;
      }
    });

    await db.system_audit_logs.create({ data: {
      action: 'BULK_UPSERT_PACKAGE_TPA_RATES', module: 'master-data',
      details: `Updated ${upserted} TPA rate(s), removed ${deleted} for provider ${providerId}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});

    return { success: true, data: { upserted, deleted } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Radiology/Imaging (radiology_imaging) ----
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors referencing `service-master-actions.ts`. (Pre-existing unrelated
errors elsewhere in the repo, if any, are not this task's concern — only check for new ones
in this file.)

- [ ] **Step 4: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/actions/service-master-actions.ts
git commit -m "$(cat <<'EOF'
feat(billing): add TPA package rate-sheet server actions

listPackageTpaRates(providerId) returns every active package with its
cash rate and (if set) TPA rate. bulkUpsertPackageTpaRates persists a
batch of edits in one transaction, deleting rows whose amount was
cleared rather than storing them as zero.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Packages tab UI — TPA Rates sub-view

**Files:**
- Modify: `app/admin/master/services/page.tsx`

**Interfaces:**
- Consumes: `listPackageTpaRates`, `bulkUpsertPackageTpaRates` (Task 2, imported from
  `@/app/actions/service-master-actions`); `getInsuranceProviders` (new import from
  `@/app/actions/insurance-actions`, existing action at `app/actions/insurance-actions.ts:39-52`,
  returns `{ success: true; data: { id: number; provider_name: string; provider_code?: string | null; is_active: boolean }[] }`).
- Produces: no new exports (page component only); adds local state `pkgView`,
  `tpaRateProviderId`, `tpaRateRows`, `tpaRateEdits`, `tpaProviders`.

- [ ] **Step 1: Read current imports and Packages-tab section**

Read `app/admin/master/services/page.tsx` lines 1-50 (imports/top-level state) and re-read
lines 900-1085 (current Packages tab JSX — note: these line numbers may have shifted since
this file was last read during research; re-read before editing) to get exact current text
for anchoring edits.

- [ ] **Step 2: Add the `getInsuranceProviders` import**

Find this exact text near the top of the file:

```ts
import {
  listServices, createService, updateService, deactivateService, deleteService,
  listLabTests, createLabTest, updateLabTest, deleteLabTest,
  listPackages, createPackage, updatePackage, deletePackage,
  listRadiologyImaging, createRadiologyImaging, updateRadiologyImaging, deleteRadiologyImaging,
  exportRadiologyImaging,
} from '@/app/actions/service-master-actions';
```

Replace with:

```ts
import {
  listServices, createService, updateService, deactivateService, deleteService,
  listLabTests, createLabTest, updateLabTest, deleteLabTest,
  listPackages, createPackage, updatePackage, deletePackage,
  listPackageTpaRates, bulkUpsertPackageTpaRates,
  listRadiologyImaging, createRadiologyImaging, updateRadiologyImaging, deleteRadiologyImaging,
  exportRadiologyImaging,
} from '@/app/actions/service-master-actions';
import { getInsuranceProviders } from '@/app/actions/insurance-actions';
```

- [ ] **Step 3: Add TPA-rates local state next to the existing Packages state**

Find this exact text:

```ts
  const [pkgMode, setPkgMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [pkgEditingId, setPkgEditingId] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState<any>(EMPTY_PACKAGE);
  const [pkgSubmitting, setPkgSubmitting] = useState(false);
```

Replace with:

```ts
  const [pkgMode, setPkgMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [pkgEditingId, setPkgEditingId] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState<any>(EMPTY_PACKAGE);
  const [pkgSubmitting, setPkgSubmitting] = useState(false);

  // ---- TPA Rates sub-view state (nested inside Packages tab) ----
  const [pkgView, setPkgView] = useState<'list' | 'tpa_rates'>('list');
  const [tpaProviders, setTpaProviders] = useState<{ id: number; provider_name: string; provider_code?: string | null }[]>([]);
  const [tpaRateProviderId, setTpaRateProviderId] = useState<number | ''>('');
  const [tpaRateRows, setTpaRateRows] = useState<{ package_id: number; package_code: string; package_name: string; total_amount: number; tpa_amount: number | null }[]>([]);
  const [tpaRateEdits, setTpaRateEdits] = useState<Record<number, string>>({}); // package_id -> raw input value
  const [tpaRateLoading, setTpaRateLoading] = useState(false);
  const [tpaRateSaving, setTpaRateSaving] = useState(false);
```

- [ ] **Step 4: Load providers once, and load rates when the selected provider changes**

Find this exact text (the existing `useEffect(() => { loadPackages(); }, [loadPackages]);`
line — confirm its exact surrounding text by reading the file first, since other `useEffect`
calls for other tabs sit nearby):

```ts
  useEffect(() => { loadPackages(); }, [loadPackages]);
```

Replace with:

```ts
  useEffect(() => { loadPackages(); }, [loadPackages]);

  useEffect(() => {
    getInsuranceProviders().then(res => {
      if (res.success) setTpaProviders((res.data as any[]) || []);
    });
  }, []);

  const loadTpaRates = useCallback(async (providerId: number) => {
    setTpaRateLoading(true);
    const res = await listPackageTpaRates(providerId);
    if (res.success) {
      setTpaRateRows((res.data as any[]) || []);
      setTpaRateEdits({});
    } else {
      toast.error(res.error || 'Failed to load TPA rates');
    }
    setTpaRateLoading(false);
  }, []);

  useEffect(() => {
    if (pkgView === 'tpa_rates' && tpaRateProviderId !== '') {
      loadTpaRates(Number(tpaRateProviderId));
    }
  }, [pkgView, tpaRateProviderId, loadTpaRates]);
```

- [ ] **Step 5: Add save-all handler next to the other Package handlers**

Find this exact text (end of `submitPkg`, which was previously read at lines ~321-346):

```ts
  const submitPkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setPkgSubmitting(true);
    try {
      const payload = {
        ...pkgForm,
        total_amount: Number(pkgForm.total_amount),
        validity_days: Number(pkgForm.validity_days),
        inclusions: pkgForm.inclusions.filter((inc: any) => inc.name.trim() !== '').map((inc: any) => ({ name: inc.name, qty: Number(inc.qty), ...(Number(inc.amount) > 0 ? { amount: Number(inc.amount) } : {}) })),
      };
      const res = pkgMode === 'create'
        ? await createPackage(payload)
        : await updatePackage(pkgEditingId!, payload);
      if (res.success) {
        toast.success(pkgMode === 'create' ? 'Package created' : 'Package updated');
        closePkg();
        loadPackages();
      } else {
        toast.error(res.error || 'Failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setPkgSubmitting(false);
    }
  };
```

Replace with the same block plus a new handler appended after it:

```ts
  const submitPkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setPkgSubmitting(true);
    try {
      const payload = {
        ...pkgForm,
        total_amount: Number(pkgForm.total_amount),
        validity_days: Number(pkgForm.validity_days),
        inclusions: pkgForm.inclusions.filter((inc: any) => inc.name.trim() !== '').map((inc: any) => ({ name: inc.name, qty: Number(inc.qty), ...(Number(inc.amount) > 0 ? { amount: Number(inc.amount) } : {}) })),
      };
      const res = pkgMode === 'create'
        ? await createPackage(payload)
        : await updatePackage(pkgEditingId!, payload);
      if (res.success) {
        toast.success(pkgMode === 'create' ? 'Package created' : 'Package updated');
        closePkg();
        loadPackages();
      } else {
        toast.error(res.error || 'Failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setPkgSubmitting(false);
    }
  };

  // ---- TPA Rates handlers ----
  const tpaRateEditCount = Object.keys(tpaRateEdits).length;

  const setTpaRateEdit = (packageId: number, raw: string) => {
    setTpaRateEdits(prev => ({ ...prev, [packageId]: raw }));
  };

  const saveTpaRates = async () => {
    if (tpaRateProviderId === '' || tpaRateEditCount === 0) return;
    setTpaRateSaving(true);
    try {
      const rates = Object.entries(tpaRateEdits).map(([packageIdStr, raw]) => ({
        package_id: Number(packageIdStr),
        tpa_amount: raw.trim() === '' ? null : Number(raw),
      }));
      const res = await bulkUpsertPackageTpaRates(Number(tpaRateProviderId), rates);
      if (res.success) {
        toast.success(`Saved ${(res.data as any).upserted} rate(s)`);
        await loadTpaRates(Number(tpaRateProviderId));
      } else {
        toast.error(res.error || 'Failed to save TPA rates');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setTpaRateSaving(false);
    }
  };
```

- [ ] **Step 6: Read the current Packages tab JSX section to find the exact insertion point**

Read `app/admin/master/services/page.tsx` from the line containing
`{activeSubTab === 'packages' && (` through the matching closing `)}` (previously at lines
908-1081, but re-read now since the file may have shifted) to get the exact current text for
Step 7's find/replace.

- [ ] **Step 7: Add the view toggle and TPA Rates table, wrapping the existing package-list JSX**

Find this exact text (the opening of the Packages tab body and its search/action bar):

```tsx
      {activeSubTab === 'packages' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={pkgSearchInput}
                onChange={e => setPkgSearchInput(e.target.value)}
                placeholder="Search by package name"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
```

Replace with:

```tsx
      {activeSubTab === 'packages' && (
        <>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            <button
              onClick={() => setPkgView('list')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${pkgView === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Package List
            </button>
            <button
              onClick={() => setPkgView('tpa_rates')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${pkgView === 'tpa_rates' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              TPA Rates
            </button>
          </div>

          {pkgView === 'tpa_rates' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 max-w-sm">
                  <label className="block text-xs font-bold text-gray-600 mb-1">TPA / Insurance Provider</label>
                  <select
                    value={tpaRateProviderId}
                    onChange={e => setTpaRateProviderId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a provider…</option>
                    {tpaProviders.map(p => (
                      <option key={p.id} value={p.id}>{p.provider_name}{p.provider_code ? ` (${p.provider_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                {tpaRateProviderId !== '' && (
                  <button
                    onClick={saveTpaRates}
                    disabled={tpaRateEditCount === 0 || tpaRateSaving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {tpaRateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save All Changes{tpaRateEditCount > 0 ? ` (${tpaRateEditCount})` : ''}
                  </button>
                )}
              </div>

              {tpaRateProviderId === '' ? (
                <div className="text-center py-16 text-gray-400 text-sm">Select a provider to view or edit its package rates.</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        {['Code', 'Name', 'Cash Rate', 'TPA Rate'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tpaRateLoading ? (
                        <tr><td colSpan={4} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                      ) : tpaRateRows.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-12 text-gray-400">No active packages found</td></tr>
                      ) : tpaRateRows.map(r => (
                        <tr key={r.package_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.package_code}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{r.package_name}</td>
                          <td className="px-4 py-3 text-gray-500">₹{Number(r.total_amount).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number" min={0} step="0.01"
                              value={tpaRateEdits[r.package_id] ?? (r.tpa_amount != null ? String(r.tpa_amount) : '')}
                              onChange={e => setTpaRateEdit(r.package_id, e.target.value)}
                              placeholder={String(Number(r.total_amount).toFixed(2))}
                              className="w-32 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={pkgSearchInput}
                onChange={e => setPkgSearchInput(e.target.value)}
                placeholder="Search by package name"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
```

- [ ] **Step 8: Close the new wrapping fragment at the end of the Packages tab**

Find this exact text (the end of the Packages tab, matching the original closing seen in
research at lines ~1079-1081 — re-verify exact text by reading the file, since surrounding
whitespace matters for an exact match):

```tsx
          )}
        </>
      )}
    </div>
  );
}
```

This closing sequence is shared by multiple sub-tabs in the file (each `activeSubTab ===
'...' && (<>...</>)` block ends similarly), so do **not** blind-replace on this snippet alone
— first locate it by reading forward from the Step 7 insertion point to confirm this is the
`packages` block's own closing (it will be the first occurrence of this exact 5-line sequence
after the text inserted in Step 7). Once confirmed, replace with:

```tsx
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}
```

This adds one extra `</>` and closing `)}` to close the ternary opened in Step 7
(`pkgView === 'tpa_rates' ? (...) : (<>...` ).

- [ ] **Step 9: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors in `app/admin/master/services/page.tsx`. JSX fragment mismatches
(unclosed tags) will surface here as syntax errors — fix any before proceeding.

- [ ] **Step 10: Build check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run build`
Expected: build succeeds (or fails only on pre-existing unrelated errors — compare against a
build run before this task's changes if uncertain). This is the most reliable signal that the
JSX structure (Step 7/8's nested fragments) is balanced correctly.

- [ ] **Step 11: Manual smoke check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run dev` (or use the
project's `run` skill if available), navigate to `/admin/master/services`, click the
"Packages" sub-tab, then toggle to "TPA Rates". Confirm: provider dropdown populates, selecting
a provider loads a table of active packages with blank/placeholder TPA-rate inputs, typing a
value and clicking "Save All Changes" persists it (reload the page and re-select the same
provider to confirm the value now shows as the input's value, not just the placeholder).
Stop the dev server after confirming.

- [ ] **Step 12: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/admin/master/services/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add TPA Rates sub-view to Packages tab

Nested toggle inside the existing Packages tab: pick a TPA provider,
see every active package's cash rate alongside an editable TPA-rate
cell (blank with cash rate as placeholder when unset), and persist all
edits in one Save All Changes action.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `resolvePackagePrice` helper + wire into `applyPackageToAdmission`

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts`

**Interfaces:**
- Consumes: `db.insurance_policies`, `db.ipdPackageTpaRate` (Task 1), existing
  `requireTenantContext()` destructure already present in `applyPackageToAdmission`.
- Produces: `async function resolvePackagePrice(db: any, organizationId: string, patientId: string, packageId: number, fallbackAmount: number): Promise<{ amount: number; providerId: number | null; isTpaRate: boolean }>` — a module-private (not exported) helper used by this task and Task 5.

- [ ] **Step 1: Re-read the current `applyPackageToAdmission` to confirm exact text**

Read `app/actions/ipd-finance-actions.ts` lines 780-890 (this file has no pending local diff
per the working-tree check done during planning, so line numbers should match, but confirm
before editing).

- [ ] **Step 2: Add the `resolvePackagePrice` helper immediately before `applyPackageToAdmission`**

Find this exact text:

```ts
export async function applyPackageToAdmission(admissionId: string, packageId: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const pkg = await db.ipdPackage.findUnique({ where: { id: packageId } });
        if (!pkg) return { success: false, error: 'Package not found' };
```

Replace with:

```ts
// Resolve the price to charge for a package on a given patient: if the patient
// has a most-recently-created Active insurance_policies row, and that provider
// has a negotiated rate for this package (IpdPackageTpaRate), use it. Otherwise
// fall back to the package's cash total_amount. Mirrors the provider-resolution
// pattern used for discharge-settlement TPA approval (see the tpa_provider_id
// resolution block further down this file).
async function resolvePackagePrice(
    db: any,
    organizationId: string,
    patientId: string,
    packageId: number,
    fallbackAmount: number,
): Promise<{ amount: number; providerId: number | null; isTpaRate: boolean }> {
    const policy = await db.insurance_policies.findFirst({
        where: { patient_id: patientId, status: 'Active' },
        orderBy: { created_at: 'desc' },
        select: { provider_id: true },
    });
    if (!policy) return { amount: fallbackAmount, providerId: null, isTpaRate: false };

    const rate = await db.ipdPackageTpaRate.findUnique({
        where: {
            package_id_provider_id_organizationId: {
                package_id: packageId,
                provider_id: policy.provider_id,
                organizationId,
            },
        },
    });
    return rate
        ? { amount: Number(rate.tpa_amount), providerId: policy.provider_id, isTpaRate: true }
        : { amount: fallbackAmount, providerId: policy.provider_id, isTpaRate: false };
}

export async function applyPackageToAdmission(admissionId: string, packageId: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        const pkg = await db.ipdPackage.findUnique({ where: { id: packageId } });
        if (!pkg) return { success: false, error: 'Package not found' };
```

- [ ] **Step 3: Resolve the price and fetch the patient_id needed for resolution**

Find this exact text (still inside `applyPackageToAdmission`, right after the "bill still
open" check and before creating the admission-package record):

```ts
        // The package can only be applied while the bill is still open.
        const openInvoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });
        if (isBillClosedForCharges(openInvoice)) {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }

        // Create admission package record
        const admPkg = await db.ipdAdmissionPackage.create({
            data: {
                admission_id: admissionId,
                package_id: packageId,
                applied_amount: pkg.total_amount,
                applied_by: session.id,
                status: ADMISSION_PACKAGE_STATUS.ACTIVE,
                organizationId,
            },
        });
```

Replace with:

```ts
        // The package can only be applied while the bill is still open.
        const openInvoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });
        if (isBillClosedForCharges(openInvoice)) {
            return { success: false, error: BILL_FINALIZED_INTENT_MSG };
        }

        const admissionForPricing = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { patient_id: true },
        });
        const priceResolution = await resolvePackagePrice(
            db, organizationId, admissionForPricing?.patient_id ?? '', packageId, Number(pkg.total_amount),
        );
        const resolvedAmount = priceResolution.amount;

        // Create admission package record
        const admPkg = await db.ipdAdmissionPackage.create({
            data: {
                admission_id: admissionId,
                package_id: packageId,
                applied_amount: resolvedAmount,
                applied_by: session.id,
                status: ADMISSION_PACKAGE_STATUS.ACTIVE,
                organizationId,
            },
        });
```

- [ ] **Step 4: Use the resolved amount for the posted invoice line**

Find this exact text:

```ts
        // Post as a single line item to the IPD bill
        const packageLine = await postChargeToIpdBill({
            admission_id: admissionId,
            source_module: 'package',
            source_ref_id: String(admPkg.id),
            description: `Package: ${pkg.package_name}`,
            quantity: 1,
            unit_price: Number(pkg.total_amount),
            tax_rate: packageTaxRate,
            service_category: PACKAGE_SERVICE_CATEGORY,
        });
```

Replace with:

```ts
        // Post as a single line item to the IPD bill
        const packageLine = await postChargeToIpdBill({
            admission_id: admissionId,
            source_module: 'package',
            source_ref_id: String(admPkg.id),
            description: `Package: ${pkg.package_name}`,
            quantity: 1,
            unit_price: resolvedAmount,
            tax_rate: packageTaxRate,
            service_category: PACKAGE_SERVICE_CATEGORY,
        });
```

- [ ] **Step 5: Use the resolved amount in the audit log**

Find this exact text:

```ts
        await logAudit({
            action: 'APPLY_IPD_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admPkg.id),
            details: JSON.stringify({
                package_name: pkg.package_name,
                amount: Number(pkg.total_amount),
                migrated_to_consumption: migration.absorbedCount,
                migrated_amount: migration.absorbedAmount,
                kept_as_billable_extras: migration.extrasCount,
            }),
        });
```

Replace with:

```ts
        await logAudit({
            action: 'APPLY_IPD_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_admission_package',
            entity_id: String(admPkg.id),
            details: JSON.stringify({
                package_name: pkg.package_name,
                amount: resolvedAmount,
                cash_amount: Number(pkg.total_amount),
                tpa_provider_id: priceResolution.providerId,
                is_tpa_rate: priceResolution.isTpaRate,
                migrated_to_consumption: migration.absorbedCount,
                migrated_amount: migration.absorbedAmount,
                kept_as_billable_extras: migration.extrasCount,
            }),
        });
```

- [ ] **Step 6: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors in `app/actions/ipd-finance-actions.ts`.

- [ ] **Step 7: Manual smoke check of the resolution helper logic**

This repo has no test runner, so verify by code inspection plus a manual scenario walk:
read the final `applyPackageToAdmission` function top to bottom and confirm: (a) a patient
with no Active `insurance_policies` row gets `fallbackAmount` (cash rate) — `resolvePackagePrice`
returns early; (b) a patient with an Active policy but no matching `IpdPackageTpaRate` row
also gets the fallback; (c) a patient with both gets `Number(rate.tpa_amount)`. Confirm all
three paths read cleanly from the diff.

- [ ] **Step 8: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/actions/ipd-finance-actions.ts
git commit -m "$(cat <<'EOF'
feat(billing): resolve TPA-specific package price in applyPackageToAdmission

New resolvePackagePrice() helper looks up the patient's most-recent
Active insurance policy, then the matching IpdPackageTpaRate; falls
back to the package's cash total_amount when either is missing. Wired
into all three places that previously read pkg.total_amount directly:
the admission-package's applied_amount, the posted invoice line's
unit_price, and the audit log detail.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `getPackagesForAdmission` action

**Files:**
- Modify: `app/actions/ipd-finance-actions.ts` (add near `applyPackageToAdmission`, after
  Task 4's edits)

**Interfaces:**
- Consumes: `resolvePackagePrice` (Task 4, same file — module-private, directly callable),
  `db.ipdPackage`, `db.admissions`, `db.insurance_providers`.
- Produces: `export async function getPackagesForAdmission(admissionId: string): Promise<{ success: true; data: { id: number; package_code: string; package_name: string; validity_days: number; total_amount: number; resolved_amount: number; is_tpa_rate: boolean; tpa_provider_name: string | null }[] } | { success: false; error: string }>`

- [ ] **Step 1: Read the current end of `applyPackageToAdmission` to find the insertion point**

Read `app/actions/ipd-finance-actions.ts` around the end of `applyPackageToAdmission` (after
Task 4's edits, its closing `}` is followed by the `removeAdmissionPackage` comment block —
confirm exact text before editing).

- [ ] **Step 2: Add `getPackagesForAdmission`**

Find this exact text (the closing of `applyPackageToAdmission` and the comment introducing
`removeAdmissionPackage`):

```ts
        return { success: true, data: serialize({ ...admPkg, migration }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Remove the package from an admission's bill. Because the package line is
```

Replace with:

```ts
        return { success: true, data: serialize({ ...admPkg, migration }) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// All active packages for the package picker on the admission page, each
// annotated with the price that would actually be charged if applied right now
// (resolved via resolvePackagePrice) so the picker never shows a price different
// from what applyPackageToAdmission will actually post.
export async function getPackagesForAdmission(admissionId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { patient_id: true },
        });
        if (!admission) return { success: false, error: 'Admission not found' };

        const policy = await db.insurance_policies.findFirst({
            where: { patient_id: admission.patient_id, status: 'Active' },
            orderBy: { created_at: 'desc' },
            select: {
                provider_id: true,
                provider: { select: { provider_name: true } },
            },
        });

        const packages = await db.ipdPackage.findMany({
            where: { organizationId, is_active: true },
            orderBy: { package_name: 'asc' },
        });

        let ratesByPackageId = new Map<number, number>();
        if (policy) {
            const rates = await db.ipdPackageTpaRate.findMany({
                where: { organizationId, provider_id: policy.provider_id },
                select: { package_id: true, tpa_amount: true },
            });
            ratesByPackageId = new Map(rates.map((r: any) => [r.package_id, Number(r.tpa_amount)]));
        }

        const data = packages.map((pkg: any) => {
            const cashAmount = Number(pkg.total_amount);
            const tpaRate = policy ? ratesByPackageId.get(pkg.id) : undefined;
            const isTpaRate = tpaRate !== undefined;
            return {
                id: pkg.id,
                package_code: pkg.package_code,
                package_name: pkg.package_name,
                validity_days: pkg.validity_days,
                total_amount: cashAmount,
                resolved_amount: isTpaRate ? tpaRate : cashAmount,
                is_tpa_rate: isTpaRate,
                tpa_provider_name: policy?.provider?.provider_name ?? null,
            };
        });

        return { success: true, data: serialize(data) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Remove the package from an admission's bill. Because the package line is
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors in `app/actions/ipd-finance-actions.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/actions/ipd-finance-actions.ts
git commit -m "$(cat <<'EOF'
feat(billing): add getPackagesForAdmission for TPA-aware package picker

Returns every active package annotated with resolved_amount (the
price that would actually be charged for this admission's patient
right now), is_tpa_rate, and the resolved provider's name — so the
IPD admission page's package picker can show real prices before
selection instead of the flat cash rate.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `provider_id` in `getAdmissionFullDetails`

**Files:**
- Modify: `app/actions/ipd-actions.ts` (this file has pre-existing uncommitted local
  changes from unrelated prior work — anchor by exact text, not line number, and re-read
  before editing)

**Interfaces:**
- Consumes: none new.
- Produces: `getAdmissionFullDetails`'s returned `data.patient.insurance_policies[0].provider`
  now includes `id: number` alongside the existing `provider_name: string`.

- [ ] **Step 1: Re-read the current `getAdmissionFullDetails` function**

Read `app/actions/ipd-actions.ts` around line 1543 onward (confirmed unaffected by this
file's local diff, per the pre-flight check done during planning — but re-confirm by reading
before editing, since the local diff elsewhere in the file could theoretically have shifted
downstream line numbers if it's positioned before line 1543).

- [ ] **Step 2: Add `id` to the provider select**

Find this exact text:

```ts
            insurance_policies: {
              where: { status: "Active" },
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                policy_number: true,
                plan_name: true,
                provider: { select: { provider_name: true } },
              },
            },
```

Replace with:

```ts
            insurance_policies: {
              where: { status: "Active" },
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                policy_number: true,
                plan_name: true,
                provider: { select: { id: true, provider_name: true } },
              },
            },
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors in `app/actions/ipd-actions.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/actions/ipd-actions.ts
git commit -m "$(cat <<'EOF'
feat(ipd): expose provider id on admission's active insurance policy

getAdmissionFullDetails already selected the active policy's provider
name; add the provider's numeric id so client code can reference the
resolved TPA provider without a second round trip. Convenience field
only — package pricing resolution is done server-side by
getPackagesForAdmission, not derived from this on the client.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note: this commit will include ONLY the `insurance_policies.provider` select change — if
`git status` shows this file has other uncommitted hunks from prior unrelated work, do not
stage or commit those; use `git add -p app/actions/ipd-actions.ts` if `git add
app/actions/ipd-actions.ts` would otherwise stage unrelated hunks, and select only the hunk
containing this task's change.

---

### Task 7: Admission page picker — TPA-aware pricing + fallback warning

**Files:**
- Modify: `app/ipd/admission/[id]/page.tsx` (pre-existing uncommitted local changes present
  — anchor by exact text, not line number; re-read immediately before editing since Task 3-6
  commits don't touch this file but its own baseline may have shifted since the last read in
  this planning session)

**Interfaces:**
- Consumes: `getPackagesForAdmission` (Task 5, from `@/app/actions/ipd-finance-actions`).
- Produces: no new exports; `packages` state now holds objects shaped
  `{ id, package_code, package_name, validity_days, total_amount, resolved_amount, is_tpa_rate, tpa_provider_name }`.

- [ ] **Step 1: Re-read the current file's package-related imports, state, effect, and JSX**

Read `app/ipd/admission/[id]/page.tsx`:
- The imports block (to find the `listPackages` import line — likely still near where it
  was during research, but confirm)
- The `useEffect` that calls `listPackages({ limit: 200 })`
- The `handlePostCharge` function's package branch
- The package picker dropdown JSX (search input, results list, price display)

Do this in one read pass across a wide enough range (e.g. lines 1-50, 225-245, 695-725,
2310-2395 as starting points — but confirm actual current line numbers first with a grep for
`listPackages`, `selectedPkgId`, `chargeMode === 'package'`, `pkg.total_amount` before
reading, since prior tasks in this plan don't touch this file but time has passed since the
last read).

- [ ] **Step 2: Swap the `listPackages` import for `getPackagesForAdmission`**

Find this exact text:

```ts
import { listPackages } from '@/app/actions/service-master-actions';
```

Replace with:

```ts
import { getPackagesForAdmission } from '@/app/actions/ipd-finance-actions';
```

If `ipd-finance-actions` functions are already imported elsewhere in this file via a
different import statement (check for an existing `from '@/app/actions/ipd-finance-actions'`
import block first), add `getPackagesForAdmission` to that existing import list instead of
creating a new import statement, and skip adding the standalone import line above. Remove
the `listPackages` import entirely only if nothing else in this file still calls
`listPackages` (grep the file for other `listPackages(` call sites before removing the
import — if any remain, keep the import and add `getPackagesForAdmission` as a second
import from the other module).

- [ ] **Step 3: Swap the package-loading effect**

Find this exact text:

```ts
    useEffect(() => {
        listPackages({ limit: 200 }).then(res => { if (res.success) setPackages(res.data.rows || []); });
    }, []);
```

Replace with:

```ts
    useEffect(() => {
        if (!data?.admission_id) return;
        getPackagesForAdmission(data.admission_id).then(res => { if (res.success) setPackages((res.data as any[]) || []); });
    }, [data?.admission_id]);
```

Note: `getPackagesForAdmission` returns a flat array directly in `data` (see Task 5's
interface), unlike `listPackages` which returned `data.rows` — this is why `res.data.rows`
becomes `res.data as any[]` directly. Double check against Task 5's actual returned shape
before finalizing this edit.

- [ ] **Step 4: Update the picker's price display in the dropdown list and on selection**

Find this exact text (the package button's `onClick` and its price display, plus the
dropdown-empty-state check just above it — re-locate exact current text via the Step 1 read,
since this snippet is reproduced from the original research read and line numbers/whitespace
may have shifted slightly):

```tsx
                                                            {packages
                                                                .filter(p => !pkgSearch || p.package_name?.toLowerCase().includes(pkgSearch.toLowerCase()) || p.package_code?.toLowerCase().includes(pkgSearch.toLowerCase()))
                                                                .map((pkg: any) => (
                                                                    <button
                                                                        key={pkg.id}
                                                                        type="button"
                                                                        onMouseDown={e => e.preventDefault()}
                                                                        onClick={() => {
                                                                            setChargeDesc(pkg.package_name);
                                                                            setChargeRate(String(Number(pkg.total_amount ?? 0)));
                                                                            setChargeCategory('Package');
                                                                            setPkgSearch(pkg.package_name);
                                                                            setSelectedPkgId(pkg.id);
                                                                            setShowPkgDropdown(false);
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-b-0"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="min-w-0">
                                                                                <p className="text-xs font-bold text-gray-800 truncate">{pkg.package_name}</p>
                                                                                <p className="text-[10px] text-gray-500 font-mono">{pkg.package_code} · {pkg.validity_days}d validity</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                <span
                                                                                    role="button"
                                                                                    title="Print package breakup"
                                                                                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                                                                    onClick={e => { e.stopPropagation(); window.open(`/api/ipd/package-breakup/${pkg.id}`, '_blank'); }}
                                                                                    className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded transition-colors cursor-pointer"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                                                                </span>
                                                                                <p className="text-xs font-black text-orange-700 whitespace-nowrap">₹{Number(pkg.total_amount).toLocaleString()}</p>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
```

Replace with:

```tsx
                                                            {packages
                                                                .filter(p => !pkgSearch || p.package_name?.toLowerCase().includes(pkgSearch.toLowerCase()) || p.package_code?.toLowerCase().includes(pkgSearch.toLowerCase()))
                                                                .map((pkg: any) => (
                                                                    <button
                                                                        key={pkg.id}
                                                                        type="button"
                                                                        onMouseDown={e => e.preventDefault()}
                                                                        onClick={() => {
                                                                            setChargeDesc(pkg.package_name);
                                                                            setChargeRate(String(Number(pkg.resolved_amount ?? pkg.total_amount ?? 0)));
                                                                            setChargeCategory('Package');
                                                                            setPkgSearch(pkg.package_name);
                                                                            setSelectedPkgId(pkg.id);
                                                                            setShowPkgDropdown(false);
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-b-0"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="min-w-0">
                                                                                <p className="text-xs font-bold text-gray-800 truncate">{pkg.package_name}</p>
                                                                                <p className="text-[10px] text-gray-500 font-mono">{pkg.package_code} · {pkg.validity_days}d validity</p>
                                                                                {pkg.tpa_provider_name && !pkg.is_tpa_rate && (
                                                                                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                                                                                        Standard rate — no {pkg.tpa_provider_name} price set
                                                                                    </p>
                                                                                )}
                                                                                {pkg.is_tpa_rate && (
                                                                                    <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                                                                        {pkg.tpa_provider_name} negotiated rate
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                <span
                                                                                    role="button"
                                                                                    title="Print package breakup"
                                                                                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                                                                    onClick={e => { e.stopPropagation(); window.open(`/api/ipd/package-breakup/${pkg.id}`, '_blank'); }}
                                                                                    className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded transition-colors cursor-pointer"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                                                                </span>
                                                                                <p className="text-xs font-black text-orange-700 whitespace-nowrap">₹{Number(pkg.resolved_amount ?? pkg.total_amount).toLocaleString()}</p>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npx tsc --noEmit`
Expected: no new errors in `app/ipd/admission/[id]/page.tsx`.

- [ ] **Step 6: Build check**

Run: `cd /Users/parikshitkaushal/Downloads/hospital-os-main && npm run build`
Expected: build succeeds (or only pre-existing unrelated errors remain).

- [ ] **Step 7: Manual smoke check — end to end**

Run: `npm run dev`, open an IPD admission for a patient with an Active `insurance_policies`
row pointing at a provider that HAS a `IpdPackageTpaRate` for some package (set one up via
the Task 3 UI first if none exists), go to that admission's "Post Manual Charge" → Package
mode, search for that package: confirm the dropdown shows the TPA-negotiated price and the
green "[Provider] negotiated rate" label, and confirm the "Amount" field populates with that
same resolved price on selection. Then repeat for a package with no TPA rate set for that
provider: confirm the amber "Standard rate — no [Provider] price set" label appears and the
cash `total_amount` is shown/used. Finally repeat for a patient with no Active policy at all:
confirm no label appears and cash rate is used silently (no warning, since there's no TPA
context to warn about). Click "Apply Package" in the TPA-negotiated-rate case and confirm the
resulting bill line item shows the TPA amount, not the cash amount. Stop the dev server after
confirming.

- [ ] **Step 8: Commit**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
git add app/ipd/admission/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(ipd): show TPA-resolved package price in admission package picker

Package picker now sources data from getPackagesForAdmission instead
of the flat listPackages, so both the dropdown list and the amount
field show the price that will actually be charged: the patient's
TPA-negotiated rate when one exists, else the cash rate with a visible
"Standard rate — no [Provider] price set" warning when the patient has
an active TPA but no rate was configured for this package.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note: as with Task 6, if `git status` shows other unrelated uncommitted hunks in this file,
use `git add -p app/ipd/admission/[id]/page.tsx` and select only this task's hunks.

---

## Plan Self-Review

**1. Spec coverage** — walking spec sections §3 through §8:
- §3 (data model) → Task 1.
- §4 (backend actions) → Task 2.
- §5 (Packages tab UI) → Task 3.
- §6 (resolution logic) → Task 4.
- §7 (new read action for picker) → Task 5.
- §8 (admission page picker + `getAdmissionFullDetails` provider_id) → Tasks 6 and 7.
- §9 (out of scope) → deliberately no task added for import/export, `removeAdmissionPackage`,
  discharge-settlement, or `IpdEstimate` — confirmed no task in this plan touches those.
- §10 (files touched) → matches this plan's File Structure table exactly (6 files, same set).

**2. Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" found in any task. Task 7
Step 2 and Step 4 include explicit "confirm before finalizing" instructions rather than
blind find/replace, because this plan cannot see the file's true current state at execution
time (two files have pre-existing local diffs) — these are legitimate re-verification
instructions, not vague placeholders, since each gives the exact target text to search for
and the exact reasoning for why a literal line-number anchor would be unsafe.

**3. Type consistency** — `resolvePackagePrice` return shape
`{ amount: number; providerId: number | null; isTpaRate: boolean }` is defined in Task 4 and
consumed only within Task 4 itself (no cross-task consumer of this exact return type).
`getPackagesForAdmission`'s row shape (`{ id, package_code, package_name, validity_days,
total_amount, resolved_amount, is_tpa_rate, tpa_provider_name }`, defined in Task 5) is
consumed in Task 7 Steps 3-4, and the field names used in Task 7's JSX (`pkg.resolved_amount`,
`pkg.is_tpa_rate`, `pkg.tpa_provider_name`) match Task 5's definition exactly.
`listPackageTpaRates`'s row shape (`{ package_id, package_code, package_name, total_amount,
tpa_amount }`, Task 2) matches the field names used in Task 3's table JSX
(`r.package_id`, `r.package_code`, `r.package_name`, `r.total_amount`, `tpaRateEdits[r.package_id]`).
`bulkUpsertPackageTpaRates(providerId, rates)` signature (Task 2) matches the call site in
Task 3 Step 5 (`bulkUpsertPackageTpaRates(Number(tpaRateProviderId), rates)`). No mismatches
found.
