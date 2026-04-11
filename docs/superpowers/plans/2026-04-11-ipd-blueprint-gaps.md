# IPD Blueprint Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining gaps from the IPD Module Blueprint audit across 7 focused tasks.

**Architecture:** Each task is self-contained — schema additions → server actions → UI. All tasks follow the existing multi-tenant pattern (`requireTenantContext()` → `{ db, session, organizationId }`). No new dependencies beyond what's installed (`chart.js` + `react-chartjs-2` for VitalsChart).

**Tech Stack:** Next.js App Router, Prisma 5 + Supabase, TypeScript, Tailwind CSS, `chart.js` / `react-chartjs-2`, `lucide-react`

---

## Gap Recap (what's missing)

| # | Gap | Severity |
|---|-----|----------|
| T1 | Structured SOAP fields in WardRound | P1 |
| T2 | Pre-discharge checklist auto-population | P1 |
| T3 | Deposit-alerts + interim-billing cron endpoints | P2 |
| T4 | Running bill dashboard full rebuild | P2 |
| T5 | TPA claim lifecycle actions + UI | P2 |
| T6 | VitalsChart component (chart.js) | P3 |
| T7 | PatientTimeline component | P3 |

---

## Task 1: SOAP Fields in WardRound — Schema + Action + UI

**Files:**
- Modify: `prisma/schema.prisma` (WardRound model, lines 1640-1656)
- Modify: `app/actions/ipd-actions.ts` (`recordWardRound` function, line 886)
- Modify: `app/ipd/admission/[id]/page.tsx` (ward rounds form + display)

### Step 1.1 — Add SOAP fields to WardRound schema

In `prisma/schema.prisma`, replace the WardRound model:

```prisma
model WardRound {
  id                   Int      @id @default(autoincrement())
  admission_id         String
  doctor_id            String
  // Legacy free-text (keep for backward compat)
  observations         String?
  plan_changes         String?
  // SOAP structured fields (NEW)
  subjective           String?
  objective            String?
  assessment           String?
  plan                 String?
  icd_codes            Json?
  orders_placed        Json?
  round_type           String   @default("Attending")  // Attending | Consulting | Nursing | Specialist
  next_review_in_hours Int?
  escalation_required  Boolean  @default(false)
  // Billing
  charge_posted        Boolean  @default(false)
  visit_fee            Decimal  @default(0)
  organizationId       String
  created_at           DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  admission    admissions   @relation(fields: [admission_id], references: [admission_id])

  @@index([organizationId])
  @@map("ward_rounds")
}
```

- [ ] **Step 1.2 — Run prisma generate**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 1.3 — Update `recordWardRound` action**

In `app/actions/ipd-actions.ts`, replace the `recordWardRound` function (line 886):

```typescript
export async function recordWardRound(data: {
  admission_id: string;
  // Legacy
  observations?: string;
  plan_changes?: string;
  // SOAP
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  icd_codes?: any[];
  orders_placed?: any[];
  round_type?: string;
  next_review_in_hours?: number;
  escalation_required?: boolean;
  visit_fee?: number;
}) {
  try {
    const { db, session, organizationId } = await requireTenantContext();
    const visitFee = data.visit_fee || 0;

    const round = await db.wardRound.create({
      data: {
        admission_id: data.admission_id,
        doctor_id: session.id,
        observations: data.observations || data.subjective,
        plan_changes: data.plan_changes || data.plan,
        subjective: data.subjective,
        objective: data.objective,
        assessment: data.assessment,
        plan: data.plan,
        icd_codes: data.icd_codes ?? undefined,
        orders_placed: data.orders_placed ?? undefined,
        round_type: data.round_type ?? 'Attending',
        next_review_in_hours: data.next_review_in_hours,
        escalation_required: data.escalation_required ?? false,
        visit_fee: visitFee,
        charge_posted: visitFee > 0,
        organizationId,
      },
    });

    if (visitFee > 0) {
      const { postChargeToIpdBill } = await import('./ipd-finance-actions');
      await postChargeToIpdBill({
        admission_id: data.admission_id,
        source_module: 'ward_round',
        source_ref_id: String(round.id),
        description: `Doctor Visit - ${data.round_type ?? 'Attending'} Round`,
        quantity: 1,
        unit_price: visitFee,
        service_category: 'Doctor Charges',
        tax_rate: 0,
      });
    }

    revalidatePath(`/ipd/admission/${data.admission_id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 1.4 — Upgrade ward rounds form in admission detail page**

In `app/ipd/admission/[id]/page.tsx`, find the ward rounds form section (search for `handleRecordRound`). Add SOAP state variables near the existing `roundObs`/`roundPlan` state:

```typescript
// Add after existing round state (roundObs, roundPlan, roundFee)
const [roundType, setRoundType] = useState('Attending');
const [roundSubjective, setRoundSubjective] = useState('');
const [roundObjective, setRoundObjective] = useState('');
const [roundAssessment, setRoundAssessment] = useState('');
const [roundPlanSoap, setRoundPlanSoap] = useState('');
const [roundEscalation, setRoundEscalation] = useState(false);
const [roundNextReview, setRoundNextReview] = useState('');
const [soapMode, setSoapMode] = useState(false);
```

Update `handleRecordRound`:

```typescript
const handleRecordRound = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const hasContent = soapMode
        ? roundSubjective.trim() || roundObjective.trim()
        : roundObs.trim();
    if (!hasContent) { toast.error('Enter observations or SOAP notes'); return; }
    setSavingRound(true);
    const res = await recordWardRound({
        admission_id: data.admission_id,
        ...(soapMode ? {
            subjective: roundSubjective,
            objective: roundObjective,
            assessment: roundAssessment,
            plan: roundPlanSoap,
            escalation_required: roundEscalation,
            next_review_in_hours: roundNextReview ? Number(roundNextReview) : undefined,
        } : {
            observations: roundObs,
            plan_changes: roundPlan,
        }),
        round_type: roundType,
        visit_fee: roundFee ? Number(roundFee) : 0,
    });
    setSavingRound(false);
    if (res.success) {
        toast.success('Ward round recorded');
        setRoundObs(''); setRoundPlan(''); setRoundFee('');
        setRoundSubjective(''); setRoundObjective(''); setRoundAssessment('');
        setRoundPlanSoap(''); setRoundEscalation(false); setRoundNextReview('');
        loadData(); setBill(null);
    } else {
        toast.error(res.error || 'Failed');
    }
};
```

Find the ward rounds form JSX and replace the form body with:

```tsx
{/* SOAP toggle */}
<div className="flex items-center gap-3 mb-3">
    <select value={roundType} onChange={e => setRoundType(e.target.value)}
        className="text-xs border rounded-lg px-2 py-1.5 bg-white">
        <option>Attending</option>
        <option>Consulting</option>
        <option>Nursing</option>
        <option>Specialist</option>
    </select>
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={soapMode} onChange={e => setSoapMode(e.target.checked)} />
        SOAP Mode
    </label>
</div>

{soapMode ? (
    <div className="space-y-2">
        <textarea rows={2} placeholder="S — Subjective (patient-reported symptoms, pain)"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundSubjective} onChange={e => setRoundSubjective(e.target.value)} />
        <textarea rows={2} placeholder="O — Objective (exam findings, vitals summary)"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundObjective} onChange={e => setRoundObjective(e.target.value)} />
        <textarea rows={2} placeholder="A — Assessment (diagnosis update, differential)"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundAssessment} onChange={e => setRoundAssessment(e.target.value)} />
        <textarea rows={2} placeholder="P — Plan (treatment changes, orders)"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundPlanSoap} onChange={e => setRoundPlanSoap(e.target.value)} />
        <div className="flex items-center gap-3">
            <input type="number" min={1} max={48} placeholder="Review in (hours)"
                className="text-xs border rounded-lg px-2 py-1.5 w-36"
                value={roundNextReview} onChange={e => setRoundNextReview(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs text-red-600 cursor-pointer font-semibold">
                <input type="checkbox" checked={roundEscalation} onChange={e => setRoundEscalation(e.target.checked)} />
                Escalation Required
            </label>
        </div>
    </div>
) : (
    <div className="space-y-2">
        <textarea rows={3} placeholder="Observations / Clinical findings"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundObs} onChange={e => setRoundObs(e.target.value)} />
        <textarea rows={2} placeholder="Plan changes / Orders"
            className="w-full text-xs border rounded-lg p-2 resize-none"
            value={roundPlan} onChange={e => setRoundPlan(e.target.value)} />
    </div>
)}
<div className="flex items-center gap-2 mt-2">
    <input type="number" min={0} step={50} placeholder="Visit fee (₹)"
        className="text-xs border rounded-lg px-2 py-1.5 w-32"
        value={roundFee} onChange={e => setRoundFee(e.target.value)} />
    <button type="submit" disabled={savingRound}
        className="flex-1 bg-blue-600 text-white text-xs font-bold rounded-lg py-2">
        {savingRound ? 'Saving…' : 'Record Round'}
    </button>
</div>
```

Also update the ward rounds display in the timeline to show SOAP fields when present:

```tsx
// In the ward_round timeline item display, after existing observations text:
{r.subjective && (
    <div className="mt-1 space-y-0.5 text-[10px] text-gray-600">
        {r.subjective && <p><span className="font-bold text-blue-600">S:</span> {r.subjective}</p>}
        {r.objective && <p><span className="font-bold text-green-600">O:</span> {r.objective}</p>}
        {r.assessment && <p><span className="font-bold text-orange-600">A:</span> {r.assessment}</p>}
        {r.plan && <p><span className="font-bold text-purple-600">P:</span> {r.plan}</p>}
        {r.escalation_required && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-black">
                ⚠ Escalation Required
            </span>
        )}
    </div>
)}
```

- [ ] **Step 1.5 — Verify TypeScript compiles**

```bash
cd /Users/parikshitkaushal/Downloads/hospital-os-main
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors related to WardRound.

- [ ] **Step 1.6 — Commit**

```bash
git add prisma/schema.prisma app/actions/ipd-actions.ts "app/ipd/admission/[id]/page.tsx"
git commit -m "feat(ipd): structured SOAP fields in WardRound schema + UI toggle"
```

---

## Task 2: Pre-Discharge Checklist Automation

**Files:**
- Modify: `app/actions/ipd-nursing-actions.ts` (`markFitForDischarge`, + new `getPreDischargeChecklist`, `updateDischargeChecklistItem`)
- Create: `app/components/ipd/PreDischargeChecklist.tsx`
- Modify: `app/ipd/admission/[id]/page.tsx` (discharge tab)

- [ ] **Step 2.1 — Update `markFitForDischarge` to auto-populate checklist**

In `app/actions/ipd-nursing-actions.ts`, replace `markFitForDischarge`:

```typescript
const DEFAULT_DISCHARGE_CHECKLIST = [
    { id: 'lab_results', label: 'All pending lab results received', done: false },
    { id: 'meds_reconciled', label: 'Medications reconciled (discharge vs inpatient)', done: false },
    { id: 'charges_posted', label: 'All pending charges posted', done: false },
    { id: 'tpa_submitted', label: 'TPA final bill submitted (if applicable)', done: false },
    { id: 'followup_booked', label: 'Follow-up appointment booked', done: false },
    { id: 'patient_education', label: 'Patient education completed', done: false },
    { id: 'transport_arranged', label: 'Transport arranged (if needed)', done: false },
    { id: 'discharge_summary', label: 'AI discharge summary drafted and reviewed', done: false },
    { id: 'bill_settled', label: 'Final bill settled or payment plan agreed', done: false },
];

export async function markFitForDischarge(admissionId: string, doctorId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true },
        });
        // Only auto-populate if checklist is empty
        const existingChecklist = admission?.discharge_checklist as any[];
        const checklist = (existingChecklist && existingChecklist.length > 0)
            ? existingChecklist
            : DEFAULT_DISCHARGE_CHECKLIST;

        await db.admissions.update({
            where: { admission_id: admissionId },
            data: {
                fit_for_discharge_at: new Date(),
                fit_for_discharge_by: doctorId,
                discharge_checklist: checklist,
            },
        });
        revalidatePath(`/ipd/admission/${admissionId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPreDischargeChecklist(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true, fit_for_discharge_at: true, fit_for_discharge_by: true },
        });
        return {
            success: true,
            data: {
                checklist: (admission?.discharge_checklist as any[]) ?? [],
                fit_for_discharge_at: admission?.fit_for_discharge_at ?? null,
                fit_for_discharge_by: admission?.fit_for_discharge_by ?? null,
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateDischargeChecklistItem(admissionId: string, itemId: string, done: boolean) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            select: { discharge_checklist: true },
        });
        const checklist = ((admission?.discharge_checklist as any[]) ?? []).map((item: any) =>
            item.id === itemId ? { ...item, done } : item
        );
        await db.admissions.update({
            where: { admission_id: admissionId },
            data: { discharge_checklist: checklist },
        });
        revalidatePath(`/ipd/admission/${admissionId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 2.2 — Create `PreDischargeChecklist` component**

Create `app/components/ipd/PreDischargeChecklist.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { CheckCircle, Circle, ClipboardList } from 'lucide-react';
import { updateDischargeChecklistItem } from '@/app/actions/ipd-nursing-actions';

interface ChecklistItem {
    id: string;
    label: string;
    done: boolean;
}

interface PreDischargeChecklistProps {
    admissionId: string;
    items: ChecklistItem[];
    onUpdate?: () => void;
}

export function PreDischargeChecklist({ admissionId, items, onUpdate }: PreDischargeChecklistProps) {
    const [localItems, setLocalItems] = useState<ChecklistItem[]>(items);
    const [saving, setSaving] = useState<string | null>(null);

    const doneCount = localItems.filter(i => i.done).length;
    const allDone = doneCount === localItems.length && localItems.length > 0;

    async function toggle(item: ChecklistItem) {
        setSaving(item.id);
        const newDone = !item.done;
        setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, done: newDone } : i));
        await updateDischargeChecklistItem(admissionId, item.id, newDone);
        setSaving(null);
        onUpdate?.();
    }

    if (localItems.length === 0) {
        return (
            <div className="text-xs text-gray-400 italic flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Mark patient fit for discharge to activate checklist
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Pre-Discharge Checklist</p>
                <span className={`text-xs font-black ${allDone ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {doneCount}/{localItems.length} done
                </span>
            </div>
            {allDone && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    All items cleared — patient ready for discharge
                </div>
            )}
            <div className="space-y-1.5">
                {localItems.map(item => (
                    <button key={item.id} onClick={() => toggle(item)} disabled={saving === item.id}
                        className="w-full flex items-center gap-2 text-left text-xs hover:bg-gray-50 rounded-lg p-1.5 transition-colors">
                        {item.done
                            ? <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                            : <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />}
                        <span className={item.done ? 'line-through text-gray-400' : 'text-gray-700'}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2.3 — Wire checklist into admission discharge tab**

In `app/ipd/admission/[id]/page.tsx`:

Add import at top:
```typescript
import { PreDischargeChecklist } from '@/app/components/ipd/PreDischargeChecklist';
import { getPreDischargeChecklist, updateDischargeChecklistItem } from '@/app/actions/ipd-nursing-actions';
```

Add state near other state declarations:
```typescript
const [dischargeChecklist, setDischargeChecklist] = useState<any[]>([]);
```

In `loadData()` or a separate `loadDischargeChecklist()` call, fetch the checklist:
```typescript
async function loadDischargeChecklist() {
    const res = await getPreDischargeChecklist(admissionId);
    if (res.success) setDischargeChecklist(res.data.checklist);
}
```

Call `loadDischargeChecklist()` inside `useEffect` alongside `loadData()`.

In the discharge tab JSX, replace the hardcoded static checklist with:
```tsx
<PreDischargeChecklist
    admissionId={data.admission_id}
    items={dischargeChecklist}
    onUpdate={loadDischargeChecklist}
/>
```

- [ ] **Step 2.4 — Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 2.5 — Commit**

```bash
git add app/actions/ipd-nursing-actions.ts app/components/ipd/PreDischargeChecklist.tsx "app/ipd/admission/[id]/page.tsx"
git commit -m "feat(ipd): pre-discharge checklist auto-populated on markFitForDischarge"
```

---

## Task 3: Deposit Alerts + Interim Billing Cron Endpoints

**Files:**
- Create: `app/api/ipd/deposit-alerts/route.ts`
- Create: `app/api/ipd/interim-billing/route.ts`

- [ ] **Step 3.1 — Create deposit alerts cron endpoint**

Create `app/api/ipd/deposit-alerts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDepositAlerts } from '@/app/actions/ipd-automation-actions';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await getDepositAlerts();
        if (!result.success) {
            return NextResponse.json({ ok: false, error: 'Failed to fetch deposit alerts' }, { status: 500 });
        }

        const alerts = result.data ?? [];
        const critical = alerts.filter((a: any) => a.alertLevel === 'critical' || a.alertLevel === 'blocked');
        const warning = alerts.filter((a: any) => a.alertLevel === 'warning');
        const info = alerts.filter((a: any) => a.alertLevel === 'info');

        return NextResponse.json({
            ok: true,
            timestamp: new Date().toISOString(),
            total: alerts.length,
            critical: critical.length,
            warning: warning.length,
            info: info.length,
            alerts,
        });
    } catch (error: any) {
        console.error('[CRON] Deposit alerts error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
```

- [ ] **Step 3.2 — Create interim billing cron endpoint**

Create `app/api/ipd/interim-billing/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill } from '@/app/actions/ipd-finance-actions';

const INTERIM_BILLING_INTERVAL_DAYS = 7;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (process.env.CRON_SECRET && authHeader !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const admissionsRes = await getIPDAdmissions('Admitted');
        if (!admissionsRes.success) {
            return NextResponse.json({ ok: false, error: 'Failed to fetch admissions' }, { status: 500 });
        }

        const admissions = admissionsRes.data ?? [];
        const now = new Date();
        let processed = 0, eligible = 0, succeeded = 0, failed = 0;

        for (const admission of admissions) {
            processed++;
            const admittedAt = new Date(admission.admitted_at);
            const daysSinceAdmission = Math.floor((now.getTime() - admittedAt.getTime()) / (1000 * 60 * 60 * 24));

            // Only generate interim bill if patient has been admitted >= 7 days
            // and today is a 7-day boundary (day 7, 14, 21, etc.)
            if (daysSinceAdmission > 0 && daysSinceAdmission % INTERIM_BILLING_INTERVAL_DAYS === 0) {
                eligible++;
                const result = await generateInterimBill(admission.admission_id);
                if (result.success) succeeded++;
                else failed++;
            }
        }

        return NextResponse.json({
            ok: true,
            timestamp: now.toISOString(),
            processed,
            eligible,
            succeeded,
            failed,
        });
    } catch (error: any) {
        console.error('[CRON] Interim billing error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
```

- [ ] **Step 3.3 — Commit**

```bash
git add app/api/ipd/deposit-alerts/route.ts app/api/ipd/interim-billing/route.ts
git commit -m "feat(ipd): deposit-alerts and interim-billing cron endpoints"
```

---

## Task 4: Running Bill Dashboard — Full Rebuild

**Files:**
- Modify: `app/ipd/billing/page.tsx` (enhance with KPI cards, charge breakdown by category, DepositTracker)

- [ ] **Step 4.1 — Read the current full billing page**

Read `app/ipd/billing/page.tsx` completely to understand existing structure before editing.

- [ ] **Step 4.2 — Add DepositTracker import and KPI section**

At top of `app/ipd/billing/page.tsx`, add import:
```typescript
import { DepositTracker } from '@/app/components/ipd/DepositTracker';
```

Add `daysAdmitted` computed value inside `selectAdmission` or derived from `billData`:
```typescript
const daysAdmitted = selectedAdmission
    ? Math.max(1, Math.floor((Date.now() - new Date(selectedAdmission.admitted_at).getTime()) / 86400000))
    : 0;
```

Replace the summary tab content with a proper KPI grid + DepositTracker:

```tsx
{activeTab === 'summary' && billData && (
    <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
                { label: 'Days Admitted', value: daysAdmitted, suffix: 'd', color: 'text-blue-700' },
                { label: 'Total Charges', value: `₹${Number(billData.invoice?.total_amount || 0).toLocaleString('en-IN')}`, color: 'text-gray-900' },
                { label: 'Amount Paid', value: `₹${Number(billData.invoice?.amount_paid || 0).toLocaleString('en-IN')}`, color: 'text-emerald-700' },
                { label: 'Balance Due', value: `₹${Math.max(0, Number(billData.invoice?.total_amount || 0) - Number(billData.invoice?.amount_paid || 0)).toLocaleString('en-IN')}`, color: 'text-red-700' },
            ].map(kpi => (
                <div key={kpi.label} className="bg-white border rounded-2xl p-3 shadow-sm">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">{kpi.label}</p>
                    <p className={`text-lg font-black mt-0.5 ${kpi.color}`}>{kpi.value}{kpi.suffix ?? ''}</p>
                </div>
            ))}
        </div>

        {/* Deposit Tracker */}
        <DepositTracker
            totalDeposit={billData.totalDeposit ?? 0}
            totalCharged={Number(billData.invoice?.total_amount ?? 0)}
        />

        {/* Charge Breakdown by Category */}
        {billData.categories && (
            <div className="bg-white border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b">
                    <p className="text-xs font-bold text-gray-700">Charges by Category</p>
                </div>
                <div className="divide-y">
                    {Object.entries(billData.categories as Record<string, any>).map(([cat, catData]: [string, any]) => (
                        <div key={cat} className="flex items-center justify-between px-4 py-2.5">
                            <div>
                                <p className="text-xs font-semibold text-gray-800">{cat}</p>
                                <p className="text-[10px] text-gray-400">{catData.count} item{catData.count !== 1 ? 's' : ''}</p>
                            </div>
                            <p className="text-xs font-black text-gray-900">
                                ₹{Number(catData.total).toLocaleString('en-IN')}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* GST Summary */}
        {billData.gstSummary && billData.gstSummary.length > 0 && (
            <div className="bg-white border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b">
                    <p className="text-xs font-bold text-gray-700">GST Summary</p>
                </div>
                <div className="divide-y">
                    {billData.gstSummary.map((g: any, i: number) => (
                        <div key={i} className="flex justify-between px-4 py-2 text-xs">
                            <span className="text-gray-600">GST {g.rate}%</span>
                            <span className="font-bold">₹{Number(g.amount).toLocaleString('en-IN')}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
)}
```

- [ ] **Step 4.3 — Verify build compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors in billing page.

- [ ] **Step 4.4 — Commit**

```bash
git add app/ipd/billing/page.tsx
git commit -m "feat(ipd): running bill dashboard with KPI cards, DepositTracker, category breakdown"
```

---

## Task 5: TPA Claim Lifecycle — Actions + UI

**Files:**
- Modify: `app/actions/ipd-nursing-actions.ts` (add `submitTPAClaim`, `recordTPAQuery`, `recordTPASettlement`)
- Modify: `app/ipd/admission/[id]/page.tsx` (TPA tab with lifecycle UI)

- [ ] **Step 5.1 — Check InsurancePreAuth schema fields**

Run:
```bash
grep -A 30 "model InsurancePreAuth" prisma/schema.prisma
```

Expected output: shows all fields including status, approved_amount, etc.

- [ ] **Step 5.2 — Add TPA lifecycle actions**

In `app/actions/ipd-nursing-actions.ts`, after the existing `getAdmissionPreAuths` function, add:

```typescript
export async function submitTPAClaim(preAuthId: string, data: {
    final_claimed_amount: number;
    claim_documents?: string[];
    remarks?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: 'Claimed',
                requested_amount: data.final_claimed_amount,
                notes: data.remarks,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function recordTPAQuery(preAuthId: string, data: {
    query_text: string;
    response_text?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const existing = await db.insurancePreAuth.findUnique({
            where: { id: preAuthId },
            select: { notes: true },
        });
        const history = existing?.notes ? existing.notes + '\n\n' : '';
        const entry = `[QUERY ${new Date().toISOString()}]\nQ: ${data.query_text}${data.response_text ? '\nA: ' + data.response_text : ''}`;
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: data.response_text ? 'QueryResponded' : 'Query',
                notes: history + entry,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function recordTPASettlement(preAuthId: string, data: {
    settled_amount: number;
    settlement_date: string;
    settlement_reference?: string;
    remarks?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        await db.insurancePreAuth.update({
            where: { id: preAuthId },
            data: {
                status: 'Settled',
                approved_amount: data.settled_amount,
                notes: data.remarks,
            },
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 5.3 — Add TPA lifecycle UI in admission detail page**

In `app/ipd/admission/[id]/page.tsx`, add imports:
```typescript
import { submitTPAClaim, recordTPAQuery, recordTPASettlement } from '@/app/actions/ipd-nursing-actions';
```

Find the existing TPA/pre-auth section (search for `InsurancePreAuth` or `preauths`). After the existing pre-auth list, add a claim lifecycle panel per pre-auth:

```tsx
{/* TPA Lifecycle Actions — per pre-auth */}
{preauths.map((pa: any) => (
    <div key={pa.id} className="border rounded-xl p-3 space-y-2 bg-white mt-2">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs font-black text-gray-800">{pa.tpa_name}</p>
                <p className="text-[10px] text-gray-400">{pa.submission_type} · {new Date(pa.created_at).toLocaleDateString()}</p>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                pa.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                pa.status === 'Denied' ? 'bg-red-100 text-red-700' :
                pa.status === 'Settled' ? 'bg-blue-100 text-blue-700' :
                pa.status === 'Claimed' ? 'bg-purple-100 text-purple-700' :
                pa.status === 'Query' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
            }`}>{pa.status}</span>
        </div>
        <p className="text-[10px] text-gray-600">
            Requested: ₹{Number(pa.requested_amount).toLocaleString('en-IN')}
            {pa.approved_amount && ` · Approved: ₹${Number(pa.approved_amount).toLocaleString('en-IN')}`}
        </p>
        {/* Action buttons based on status */}
        <div className="flex flex-wrap gap-1.5">
            {pa.status === 'Approved' && (
                <button onClick={async () => {
                    const amount = prompt('Enter final claimed amount:');
                    if (!amount) return;
                    await submitTPAClaim(pa.id, { final_claimed_amount: Number(amount) });
                    loadData();
                }} className="text-[10px] font-bold px-2.5 py-1 bg-purple-600 text-white rounded-lg">
                    Submit Claim
                </button>
            )}
            {(pa.status === 'Submitted' || pa.status === 'Claimed' || pa.status === 'QueryResponded') && (
                <button onClick={async () => {
                    const q = prompt('Enter TPA query / note:');
                    if (!q) return;
                    await recordTPAQuery(pa.id, { query_text: q });
                    loadData();
                }} className="text-[10px] font-bold px-2.5 py-1 bg-amber-600 text-white rounded-lg">
                    Log Query
                </button>
            )}
            {pa.status === 'Claimed' && (
                <button onClick={async () => {
                    const amount = prompt('Enter settlement amount:');
                    if (!amount) return;
                    await recordTPASettlement(pa.id, {
                        settled_amount: Number(amount),
                        settlement_date: new Date().toISOString(),
                    });
                    loadData();
                }} className="text-[10px] font-bold px-2.5 py-1 bg-emerald-600 text-white rounded-lg">
                    Record Settlement
                </button>
            )}
        </div>
        {pa.notes && (
            <details className="text-[10px] text-gray-500">
                <summary className="cursor-pointer font-semibold">History</summary>
                <pre className="mt-1 whitespace-pre-wrap font-mono">{pa.notes}</pre>
            </details>
        )}
    </div>
))}
```

- [ ] **Step 5.4 — Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5.5 — Commit**

```bash
git add app/actions/ipd-nursing-actions.ts "app/ipd/admission/[id]/page.tsx"
git commit -m "feat(ipd): TPA claim lifecycle — submitClaim, logQuery, recordSettlement + UI"
```

---

## Task 6: VitalsChart Component (chart.js)

**Files:**
- Create: `app/components/ipd/VitalsChart.tsx`
- Modify: `app/ipd/vitals/[admissionId]/page.tsx` (add chart above history table)

- [ ] **Step 6.1 — Create VitalsChart component**

Create `app/components/ipd/VitalsChart.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

interface VitalsChartProps {
    vitals: Array<{
        recorded_at: string;
        heart_rate?: number | null;
        bp_systolic?: number | null;
        bp_diastolic?: number | null;
        spo2?: number | null;
        temperature?: number | null;
        respiratory_rate?: number | null;
        news_score?: number | null;
    }>;
    mode?: 'vitals' | 'news';
}

export function VitalsChart({ vitals, mode = 'vitals' }: VitalsChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) chartRef.current.destroy();

        const sorted = [...vitals].sort((a, b) =>
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );
        const labels = sorted.map(v =>
            new Date(v.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) +
            '\n' + new Date(v.recorded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        );

        const datasets = mode === 'news'
            ? [{
                label: 'NEWS Score',
                data: sorted.map(v => v.news_score ?? null),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.08)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: sorted.map(v =>
                    (v.news_score ?? 0) >= 7 ? '#dc2626' :
                    (v.news_score ?? 0) >= 5 ? '#f97316' : '#22c55e'
                ),
            }]
            : [
                {
                    label: 'Heart Rate',
                    data: sorted.map(v => v.heart_rate ?? null),
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: 'BP Systolic',
                    data: sorted.map(v => v.bp_systolic ?? null),
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: 'BP Diastolic',
                    data: sorted.map(v => v.bp_diastolic ?? null),
                    borderColor: '#93c5fd',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    borderDash: [4, 2],
                    pointRadius: 2,
                },
                {
                    label: 'SpO₂ %',
                    data: sorted.map(v => v.spo2 ?? null),
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3,
                },
            ];

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { font: { size: 10 }, boxWidth: 12 } },
                    tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } },
                },
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    y: { ticks: { font: { size: 10 } } },
                },
            },
        });

        return () => { chartRef.current?.destroy(); };
    }, [vitals, mode]);

    if (vitals.length < 2) {
        return (
            <div className="h-40 flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-xl border">
                Record at least 2 vitals entries to see trend chart
            </div>
        );
    }

    return (
        <div className="bg-white border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold text-gray-700 flex-1">
                    {mode === 'news' ? 'NEWS Score Trend' : 'Vitals Trend'}
                </p>
            </div>
            <div className="h-52">
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
}
```

- [ ] **Step 6.2 — Add VitalsChart to vitals page**

In `app/ipd/vitals/[admissionId]/page.tsx`, add import:
```typescript
import { VitalsChart } from '@/app/components/ipd/VitalsChart';
```

Add chart tabs above the history table (after the latest vitals summary grid):
```tsx
{/* Chart toggle */}
{(() => {
    const [chartMode, setChartMode] = useState<'vitals' | 'news'>('vitals');
    return (
        <div className="space-y-3">
            <div className="flex gap-1.5">
                <button onClick={() => setChartMode('vitals')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg ${chartMode === 'vitals' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Vitals
                </button>
                <button onClick={() => setChartMode('news')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg ${chartMode === 'news' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    NEWS Trend
                </button>
            </div>
            <VitalsChart vitals={history} mode={chartMode} />
        </div>
    );
})()}
```

Note: If the vitals page is a server component, extract the chart section into a client sub-component or add `'use client'` to the page. Read the current page structure first.

- [ ] **Step 6.3 — Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6.4 — Commit**

```bash
git add app/components/ipd/VitalsChart.tsx "app/ipd/vitals/[admissionId]/page.tsx"
git commit -m "feat(ipd): VitalsChart component with chart.js line charts and NEWS trend mode"
```

---

## Task 7: PatientTimeline Component

**Files:**
- Create: `app/components/ipd/PatientTimeline.tsx`
- Modify: `app/ipd/admission/[id]/page.tsx` (use component instead of inline timeline)

- [ ] **Step 7.1 — Create PatientTimeline component**

Create `app/components/ipd/PatientTimeline.tsx`:

```typescript
'use client';

import { Activity, Pill, FlaskConical, Stethoscope, FileText, ArrowRightLeft, User, AlertTriangle } from 'lucide-react';

type TimelineEventType = 'ward_round' | 'note' | 'transfer' | 'vitals' | 'medication' | 'lab' | 'admission' | 'discharge';

interface TimelineEvent {
    _type: TimelineEventType;
    _date: Date;
    [key: string]: any;
}

interface PatientTimelineProps {
    events: TimelineEvent[];
    maxItems?: number;
}

const EVENT_CONFIG: Record<TimelineEventType, { icon: any; color: string; label: string }> = {
    ward_round: { icon: Stethoscope, color: 'bg-blue-100 text-blue-700', label: 'Ward Round' },
    note: { icon: FileText, color: 'bg-gray-100 text-gray-700', label: 'Clinical Note' },
    transfer: { icon: ArrowRightLeft, color: 'bg-purple-100 text-purple-700', label: 'Bed Transfer' },
    vitals: { icon: Activity, color: 'bg-green-100 text-green-700', label: 'Vitals' },
    medication: { icon: Pill, color: 'bg-amber-100 text-amber-700', label: 'Medication' },
    lab: { icon: FlaskConical, color: 'bg-cyan-100 text-cyan-700', label: 'Lab' },
    admission: { icon: User, color: 'bg-emerald-100 text-emerald-700', label: 'Admitted' },
    discharge: { icon: User, color: 'bg-red-100 text-red-700', label: 'Discharged' },
};

function eventSummary(event: TimelineEvent): string {
    switch (event._type) {
        case 'ward_round':
            return event.subjective
                ? `SOAP — ${event.round_type ?? 'Attending'}${event.escalation_required ? ' ⚠ Escalation' : ''}`
                : (event.observations || 'Ward round documented');
        case 'note':
            return `${event.note_type ?? 'Note'}: ${(event.details || '').slice(0, 80)}${(event.details || '').length > 80 ? '…' : ''}`;
        case 'transfer':
            return `Transferred to ${event.to_bed_id ?? 'new bed'}`;
        case 'vitals':
            return `HR ${event.heart_rate ?? '?'} · BP ${event.bp_systolic ?? '?'}/${event.bp_diastolic ?? '?'} · SpO₂ ${event.spo2 ?? '?'}% · NEWS ${event.news_score ?? '?'}`;
        case 'medication':
            return `${event.medication_name} — ${event.status}`;
        case 'lab':
            return event.test_type ?? 'Lab test';
        case 'admission':
            return 'Admission started';
        case 'discharge':
            return 'Patient discharged';
        default:
            return '';
    }
}

export function PatientTimeline({ events, maxItems = 50 }: PatientTimelineProps) {
    const sorted = [...events]
        .sort((a, b) => b._date.getTime() - a._date.getTime())
        .slice(0, maxItems);

    if (sorted.length === 0) {
        return <p className="text-xs text-gray-400 italic text-center py-4">No events yet</p>;
    }

    return (
        <div className="relative space-y-0">
            {sorted.map((event, idx) => {
                const cfg = EVENT_CONFIG[event._type] ?? EVENT_CONFIG.note;
                const Icon = cfg.icon;
                return (
                    <div key={idx} className="flex gap-3 group">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center">
                            <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.color}`}>
                                <Icon className="h-3.5 w-3.5" />
                            </span>
                            {idx < sorted.length - 1 && (
                                <div className="w-px flex-1 bg-gray-200 mt-1 mb-1 min-h-[1rem]" />
                            )}
                        </div>
                        {/* Content */}
                        <div className="pb-4 flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{cfg.label}</span>
                                <span className="text-[9px] text-gray-400">
                                    {event._date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    {' '}
                                    {event._date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                                {event.escalation_required && (
                                    <span className="text-[9px] font-black text-red-600 flex items-center gap-0.5">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Escalation
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-700 mt-0.5 truncate">{eventSummary(event)}</p>
                            {event._type === 'ward_round' && event.plan && (
                                <p className="text-[10px] text-purple-600 mt-0.5 line-clamp-1">P: {event.plan}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 7.2 — Replace inline timeline in admission page**

In `app/ipd/admission/[id]/page.tsx`, add import:
```typescript
import { PatientTimeline } from '@/app/components/ipd/PatientTimeline';
```

Find the existing `timelineEvents` array and the JSX that renders them inline. Replace the inline render with:
```tsx
<PatientTimeline events={timelineEvents} maxItems={100} />
```

The `timelineEvents` array already exists and merges `ward_rounds`, `bed_transfers`, and `medical_notes` with `_type` and `_date`. Keep that array construction as-is.

- [ ] **Step 7.3 — Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7.4 — Final build check**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully`

- [ ] **Step 7.5 — Commit**

```bash
git add app/components/ipd/PatientTimeline.tsx "app/ipd/admission/[id]/page.tsx"
git commit -m "feat(ipd): PatientTimeline component replaces inline timeline render"
```

---

## Self-Review Checklist

- [x] **T1** SOAP schema fields: `subjective`, `objective`, `assessment`, `plan`, `icd_codes`, `orders_placed`, `round_type`, `next_review_in_hours`, `escalation_required` — all covered in prisma + action + UI
- [x] **T2** Pre-discharge checklist: `DEFAULT_DISCHARGE_CHECKLIST` auto-populates on `markFitForDischarge`, interactive component, wired into admission page
- [x] **T3** Cron endpoints: `/api/ipd/deposit-alerts` (calls existing `getDepositAlerts()`), `/api/ipd/interim-billing` (7-day boundary check)
- [x] **T4** Running bill: KPI cards, `DepositTracker` integration, charge-by-category breakdown, GST summary
- [x] **T5** TPA lifecycle: `submitTPAClaim`, `recordTPAQuery`, `recordTPASettlement` actions + UI per pre-auth
- [x] **T6** VitalsChart: chart.js-based, two modes (vitals lines + NEWS trend), integrated in vitals page
- [x] **T7** PatientTimeline: event-type config map, escalation flags, replaces inline render

**Placeholder scan:** No TBDs, no "similar to Task N" references, all code blocks have actual implementation.

**Type consistency:** `InsurancePreAuth` model used consistently as `insurancePreAuth` (camelCase Prisma client). `WardRound` → `wardRound`. `getDepositAlerts()` → imported from `ipd-automation-actions`. `generateInterimBill()` → imported from `ipd-finance-actions`.

**Potential risk:** Task 6 step (VitalsChart in vitals page) — if the vitals page is a server component, the inline `useState` inside an IIFE won't work. Read the file first (step 6.2 note) and extract to a `VitalsChartSection` client sub-component if needed.
