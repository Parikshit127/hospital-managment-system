# HIMS Smoke Test — Findings & Fix Plan

_Date: 2026-06-09 · Branch: `main` · Scope: read-only audit, no code changed yet_

## Smoke test results

- ✅ **TypeScript:** `tsc --noEmit` passes **clean (0 errors)** across the whole project.
- ✅ **Production build:** `next build` succeeded on the server.
- ✅ TS being clean let us debunk several "missing function/import" claims (TS would have caught them).

---

## ❌ False alarms (verified — do NOT chase these)

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Missing `organizationId` in `createMedicine` / `addBatch` | **False** | org is passed — `medicine-master-actions.ts:94, 121` |
| `getPharmacyOrderDetails` / `recordSupplierPayment` don't exist | **False** | `tsc` is clean — imports resolve |
| Pharmacy invoices `'PHARMACY'` vs `'Pharmacy'` casing breaks list | **False** | `getInvoices` queries DB with correct `'Pharmacy'`; page's `'PHARMACY'` only flips the fetch flag |
| Inventory `searchMedicine('')` ignores user input | **False** | Intentional: fetch-all then filter client-side; `query` used below |

---

## ✅ Confirmed issues

### HIGH

**1. Null-optional Zod bug class (same bug we hit on lab tests — still live in 2 more places)**
Editing/saving a record with blank optional fields throws `expected string` because the schema uses `z.string()/z.number().optional()` on a nullable DB column that the form submits as `null`/`''`.
- `app/actions/medicine-master-actions.ts` — `medicineSchema`: `generic_name, category, manufacturer, strength, form, hsn_sac_code` (~lines 13–23); `batchSchema`: `cost_price, rack_location, supplier_name` (~lines 34–36).
- `app/actions/doctor-master-actions.ts` — `createDoctorSchema` uses `.optional()` while `updateDoctorSchema` correctly uses `.nullable().optional()` (inconsistent).
- **Impact:** Pharmacy Medicine Master and Doctor Master will fail to save exactly like the lab test did.
- **Fix:** Reuse the proven `optionalText` / `optionalNumber` preprocessor pattern from `service-master-actions.ts`.

**2. Dispensing is broken**
- `app/pharmacy/dispense/[orderId]/page.tsx:61–65` sends `{ medicine_name, quantity, batch_no }`, but `dispenseMedicine` (`app/actions/pharmacy-actions.ts:777`) needs `medicine_id` **or** `order_item_id` and throws *"Could not resolve medicine ID"*. The payload map drops the id.
- **Impact:** Every dispense action fails.
- **Fix:** Include `medicine_id` (and/or `order_item_id`) in the dispense payload.

### MEDIUM

**3. Access-control gaps in `proxy.ts`**
- Roles `crm_manager`, `counsellor`, `call_center` have sidebar nav but no entries in `ROLE_ROUTES` / `PERMISSION_ROUTES` / `redirectMap`.
- **Needs confirm:** that those roles + routes are actually live.
- **Fix:** Add their route, permission, and post-login redirect entries.

**4. Finance invoice list — LAB/PHARMACY rows have no View button**
- `app/finance/invoices/page.tsx:148` renders View only for non-LAB/non-PHARMACY rows. Not a dead link — a missing path. Those are viewable from their own modules.
- **Fix (optional):** Link LAB/PHARMACY rows to their respective view pages.

**5. `opd_manager` billing link inconsistent**
- `app/components/layout/Sidebar.tsx:426` uses `/opd/billing` while all other roles use `/billing` (lines 113, 200, 274, 346). Likely copy-paste.
- **Fix:** Confirm intent; align to `/billing` if unintended.

### LOW

**6. Money-format inconsistency** — some `toLocaleString()` calls omit `'en-IN'` / 2 decimals (e.g. `InvoiceDetailModal`). Cosmetic.

**7. Deploy config mismatch** — PM2 runs `next start` but `next.config` sets `output: 'standalone'` (prod log warning). Should run `node .next/standalone/server.js` or drop `standalone`.

---

## Fix plan & checkpoints

Each checkpoint = a small reviewable change set, shown before committing, then deployed and verified on `13.234.242.13`.

- [ ] **Checkpoint 1 — Null-optional bug class (HIGH).** Apply `optionalText`/`optionalNumber` to `medicineSchema`, `batchSchema`; align `createDoctorSchema`. Redeploy. _Biggest, most certain win._
- [ ] **Checkpoint 2 — Fix dispensing (HIGH).** Add `medicine_id` / `order_item_id` to the dispense payload; test end-to-end.
- [ ] **Checkpoint 3 — Access control (MED).** Confirm the 3 roles are live, add `proxy.ts` entries; resolve `opd_manager` billing link.
- [ ] **Checkpoint 4 — Polish (LOW).** Money-format helper consistency; optional finance→lab/pharmacy view links.
- [ ] **Checkpoint 5 — Deploy hardening (LOW).** Fix `standalone` vs `next start` mismatch.

---

## Notes / context

- Same DB-schema-drift class that broke prod (`invoices.doctor_id` missing migration) is worth a repo-wide guard: when editing `schema.prisma`, always generate the matching migration (`prisma migrate dev`).
- Prod runs on EC2 `13.234.242.13`, PM2 app `hospitalos` (cluster ×2), dir `/home/ubuntu/hospitalos`, RDS Postgres `ap-south-1`.
