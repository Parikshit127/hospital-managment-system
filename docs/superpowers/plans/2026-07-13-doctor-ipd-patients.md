# Doctor Portal — IPD Patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "IPD Patients" section to the doctor portal so doctors can see all currently-admitted (incl. semi-discharged) IPD patients hospital-wide, view a read-only clinical snapshot, edit diagnosis, and author the discharge summary — with no billing or admission/discharge actions exposed.

**Architecture:** Two new routes under `app/doctor/ipd-patients/` (list + `[admissionId]` detail), each a thin `page.tsx` wrapper around a client `*Content.tsx` component, following the existing `app/doctor/pending-approvals/` pattern. Both pages call **only existing** server actions (`getIPDAdmissions`, `getAdmissionFullDetails`, `updateAdmissionDiagnosis`, `getIPDVitalsHistory`, `getNursingAssessments`) and mount the **existing** `DischargeSummaryEditor` and `VitalsChart` components unchanged. No new server actions, no schema changes, no edits to `app/ipd/admission/[id]/page.tsx` or any billing file.

**Tech Stack:** Next.js (App Router), React client components, Prisma via existing server actions, Tailwind CSS, lucide-react icons.

## Global Constraints

- Reuse existing server actions verbatim — do not create new ones (spec: "no new server action").
- Do not modify `app/ipd/admission/[id]/page.tsx`, any billing page, or any admit/discharge/undischarge action.
- Follow the existing doctor-portal page pattern: `page.tsx` wraps `<AppShell>` + `<Suspense>`, delegates to a client `*Content.tsx` component (matches `app/doctor/pending-approvals/page.tsx`).
- This repo has no automated test framework (no `test` script in `package.json`, no `*.test.*`/`*.spec.*` files under `app/doctor` or `app/components/ipd`). Verification is `tsc --noEmit` plus a manual browser walkthrough, matching the project's established convention for recent features.
- Match existing Tailwind conventions: `rounded-2xl` cards, `border-gray-200`, `bg-gray-50` page background, `font-black` uppercase micro-labels, teal/orange accent colors (see `app/doctor/dashboard/page.tsx`, `app/doctor/pending-approvals/PendingApprovalsContent.tsx`).
- The "Admitted" status alone covers both regular and semi-discharged admissions (semi-discharge is derived as `status === "Admitted" && discharge_date != null`, per `app/actions/ipd-actions.ts:1081`) — no extra filter logic needed.

---

### Task 1: Add "IPD Patients" nav entry to the doctor sidebar

**Files:**
- Modify: `app/components/layout/Sidebar.tsx` (doctor nav array, "Clinical" section, ~lines 178-184)

**Interfaces:**
- Consumes: nothing new.
- Produces: a working `/doctor/ipd-patients` link in the sidebar (route doesn't exist yet until Task 2 — link will 404 until then, which is fine mid-plan).

- [ ] **Step 1: Add the nav entry**

In `app/components/layout/Sidebar.tsx`, find the doctor array's "Clinical" section:

```typescript
  doctor: [
    {
      title: "Clinical",
      items: [
        { label: "Dashboard", href: "/doctor/overview", icon: LayoutDashboard },
        { label: "My Patients", href: "/doctor/dashboard", icon: Stethoscope },
        { label: "Video Consultations", href: "/doctor/video-calls", icon: MonitorPlay },
        { label: "Schedule", href: "/doctor/schedule", icon: CalendarClock },
        { label: "Templates", href: "/doctor/templates", icon: FileStack },
        { label: "Follow-Ups", href: "/doctor/follow-ups", icon: UserCheck },
      ],
    },
```

Change it to:

```typescript
  doctor: [
    {
      title: "Clinical",
      items: [
        { label: "Dashboard", href: "/doctor/overview", icon: LayoutDashboard },
        { label: "My Patients", href: "/doctor/dashboard", icon: Stethoscope },
        { label: "IPD Patients", href: "/doctor/ipd-patients", icon: BedDouble },
        { label: "Video Consultations", href: "/doctor/video-calls", icon: MonitorPlay },
        { label: "Schedule", href: "/doctor/schedule", icon: CalendarClock },
        { label: "Templates", href: "/doctor/templates", icon: FileStack },
        { label: "Follow-Ups", href: "/doctor/follow-ups", icon: UserCheck },
      ],
    },
```

`BedDouble` is already imported at the top of the file — no new import needed. Confirm with:

Run: `grep -n "BedDouble" app/components/layout/Sidebar.tsx | head -3`
Expected: at least one match in the `import { ... } from "lucide-react"` block.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this change.

- [ ] **Step 3: Commit**

```bash
git add app/components/layout/Sidebar.tsx
git commit -m "feat(doctor): add IPD Patients nav entry"
```

---

### Task 2: IPD Patients list page

**Files:**
- Create: `app/doctor/ipd-patients/page.tsx`
- Create: `app/doctor/ipd-patients/IpdPatientsContent.tsx`

**Interfaces:**
- Consumes: `getIPDAdmissions(statusFilter?: string)` from `app/actions/ipd-actions.ts`, returning `{ success: true, data: Array<{ admission_id, patient_id, status, diagnosis, doctor_name, admission_date, bed_id, ward_id, daysAdmitted, wardName, patient: { full_name, patient_id, age, gender, phone } }> } | { success: false, error: string }`.
- Produces: the `/doctor/ipd-patients` route, linking each row to `/doctor/ipd-patients/[admission_id]` (consumed by Task 3).

- [ ] **Step 1: Create the page wrapper**

Create `app/doctor/ipd-patients/page.tsx`:

```typescript
'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import IpdPatientsContent from './IpdPatientsContent';

export default function IpdPatientsPage() {
    return (
        <AppShell pageTitle="IPD Patients">
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
            }>
                <IpdPatientsContent />
            </Suspense>
        </AppShell>
    );
}
```

- [ ] **Step 2: Create the list content component**

Create `app/doctor/ipd-patients/IpdPatientsContent.tsx`:

```typescript
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, BedDouble, Loader2, Users } from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

interface IpdAdmissionRow {
    admission_id: string;
    patient_id: string;
    status: string;
    diagnosis: string | null;
    doctor_name: string | null;
    admission_date: string;
    daysAdmitted: number;
    wardName: string;
    bed_id: string | null;
    patient: {
        full_name: string;
        patient_id: string;
        age: string | null;
        gender: string | null;
    };
}

export default function IpdPatientsContent() {
    const toast = useToast();
    const [admissions, setAdmissions] = useState<IpdAdmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const res = await getIPDAdmissions('Admitted');
            if (cancelled) return;
            if (res.success) {
                setAdmissions(res.data as IpdAdmissionRow[]);
            } else {
                toast.error(res.error || 'Failed to load IPD patients');
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return admissions;
        return admissions.filter((a) =>
            a.patient.full_name.toLowerCase().includes(term) ||
            a.patient.patient_id.toLowerCase().includes(term)
        );
    }, [admissions, searchTerm]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                    <BedDouble className="h-6 w-6 text-teal-500" /> IPD Patients
                </h1>
                <span className="bg-orange-500/10 text-teal-600 text-xs px-3 py-1 rounded-lg font-black border border-orange-500/20">
                    {filtered.length} Admitted
                </span>
            </div>

            <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                    type="text"
                    placeholder="Search by patient name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900"
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading IPD patients...
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-gray-200" />
                    No IPD patients currently admitted.
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">
                                <th className="px-5 py-3">Patient</th>
                                <th className="px-5 py-3">Ward / Bed</th>
                                <th className="px-5 py-3">Admitted</th>
                                <th className="px-5 py-3">Diagnosis</th>
                                <th className="px-5 py-3">Attending Doctor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((a) => (
                                <tr key={a.admission_id} className="border-b border-gray-100 last:border-0 hover:bg-orange-500/5 transition-colors">
                                    <td className="px-5 py-4">
                                        <Link href={`/doctor/ipd-patients/${a.admission_id}`} className="font-bold text-gray-900 hover:text-orange-600 hover:underline underline-offset-2">
                                            {a.patient.full_name}
                                        </Link>
                                        <div className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                            {a.patient.patient_id}
                                            {a.patient.age ? ` • ${a.patient.age}y` : ''}
                                            {a.patient.gender ? ` / ${a.patient.gender}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {a.wardName}{a.bed_id ? ` • ${a.bed_id}` : ''}
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {new Date(a.admission_date).toLocaleDateString('en-GB')}
                                        <div className="text-[10px] text-gray-400 font-semibold">{a.daysAdmitted} day{a.daysAdmitted === 1 ? '' : 's'}</div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium max-w-xs truncate">
                                        {a.diagnosis || <span className="text-gray-300">Not recorded</span>}
                                    </td>
                                    <td className="px-5 py-4 text-gray-600 font-medium">
                                        {a.doctor_name || <span className="text-gray-300">Unassigned</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in the two new files.

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`), log in as a `doctor`-role user, open `/doctor/ipd-patients`.
Expected: list of currently-admitted patients loads, search filters by name/ID, empty state shows if none admitted.

- [ ] **Step 5: Commit**

```bash
git add app/doctor/ipd-patients/page.tsx app/doctor/ipd-patients/IpdPatientsContent.tsx
git commit -m "feat(doctor): add IPD patients list page"
```

---

### Task 3: Detail page shell with Profile and Diagnosis tabs

**Files:**
- Create: `app/doctor/ipd-patients/[admissionId]/page.tsx`
- Create: `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`

**Interfaces:**
- Consumes: `getAdmissionFullDetails(admissionId: string)` returning `{ success: true, data: AdmissionFullDetails } | { success: false, error: string }` where `AdmissionFullDetails` includes (from `app/actions/ipd-actions.ts:1543-1592`): all scalar `admissions` fields (`admission_id, patient_id, status, diagnosis, primary_diagnosis_icd, secondary_diagnoses, doctor_name, admission_date, discharge_date, bed_id, ward_id, ...`), `patient: { full_name, patient_id, age, gender, phone, address, corporate, insurance_policies }`, `bed: { bed_id, bed_name, wards: { ward_name, ward_type } }`, `medical_notes: Array<{ id, note_type, details, created_at }>`, `ward_rounds: Array<{ id, doctor_id, subjective, objective, assessment, plan, round_type, created_at }>`, `diet_plans`, `bed_transfers`, `nursing_tasks`.
- Consumes: `updateAdmissionDiagnosis(data: { admission_id: string; diagnosis?: string; primary_diagnosis_icd?: string; secondary_diagnoses?: string[]; discharge_type?: string; discharge_disposition?: string; patient_class?: string; isolation_type?: string; })` returning `{ success: true } | { success: false, error: string }`, from `app/actions/ipd-actions.ts:1797`. This action only calls `requireTenantContext()` (no role restriction), so a `doctor`-role caller is already permitted.
- Produces: `IpdPatientDetailContent` component with internal `activeTab` state (`'profile' | 'diagnosis' | 'clinical' | 'vitals' | 'nursing' | 'discharge'`) that Tasks 4-7 extend by adding more tab bodies to the same file. Produces exported type `AdmissionFullDetails` (informal, inlined as `any`-typed local state is acceptable here since this mirrors the existing codebase's convention of using `any` for full-admission blobs — see `app/doctor/dashboard/page.tsx` throughout).

- [ ] **Step 1: Create the page wrapper**

Create `app/doctor/ipd-patients/[admissionId]/page.tsx`:

```typescript
'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import IpdPatientDetailContent from './IpdPatientDetailContent';

export default function IpdPatientDetailPage() {
    const params = useParams<{ admissionId: string }>();
    const admissionId = String(params?.admissionId || '');

    return (
        <AppShell pageTitle="IPD Patient">
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
            }>
                <IpdPatientDetailContent admissionId={admissionId} />
            </Suspense>
        </AppShell>
    );
}
```

This follows the codebase's established convention for client-component dynamic routes (e.g. `app/doctor/patient/[patientId]/page.tsx` uses `useParams<{ patientId: string }>()`) rather than destructuring a `params` prop — necessary because Next.js 16 (this repo's version) passes `params` as a Promise, which client components can't destructure directly.

- [ ] **Step 2: Create the detail content component with Profile + Diagnosis tabs**

Create `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`:

```typescript
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    User, Stethoscope, ClipboardList, HeartPulse, Shield, FileText,
    Loader2, Save, ArrowLeft,
} from 'lucide-react';
import { getAdmissionFullDetails, updateAdmissionDiagnosis } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

type TabKey = 'profile' | 'diagnosis' | 'clinical' | 'vitals' | 'nursing' | 'discharge';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
    { key: 'clinical', label: 'Clinical', icon: ClipboardList },
    { key: 'vitals', label: 'Vitals', icon: HeartPulse },
    { key: 'nursing', label: 'Nursing', icon: Shield },
    { key: 'discharge', label: 'Discharge Summary', icon: FileText },
];

export default function IpdPatientDetailContent({ admissionId }: { admissionId: string }) {
    const toast = useToast();
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('profile');

    const [diagnosis, setDiagnosis] = useState('');
    const [primaryIcd, setPrimaryIcd] = useState('');
    const [secondaryDx, setSecondaryDx] = useState('');
    const [savingDiagnosis, setSavingDiagnosis] = useState(false);

    const loadDetails = useCallback(async () => {
        setLoading(true);
        const res = await getAdmissionFullDetails(admissionId);
        if (res.success && res.data) {
            setData(res.data);
            setDiagnosis(res.data.diagnosis || '');
            setPrimaryIcd(res.data.primary_diagnosis_icd || '');
            setSecondaryDx(Array.isArray(res.data.secondary_diagnoses) ? res.data.secondary_diagnoses.join(', ') : '');
        } else {
            toast.error((res as any).error || 'IPD admission not found');
            router.replace('/doctor/ipd-patients');
        }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admissionId]);

    useEffect(() => {
        if (!admissionId) {
            router.replace('/doctor/ipd-patients');
            return;
        }
        loadDetails();
    }, [admissionId, loadDetails, router]);

    const handleSaveDiagnosis = async () => {
        setSavingDiagnosis(true);
        try {
            const res = await updateAdmissionDiagnosis({
                admission_id: admissionId,
                diagnosis: diagnosis.trim() || undefined,
                primary_diagnosis_icd: primaryIcd.trim() || undefined,
                secondary_diagnoses: secondaryDx.trim()
                    ? secondaryDx.split(',').map((s) => s.trim()).filter(Boolean)
                    : [],
            });
            if (res.success) {
                toast.success('Diagnosis saved');
                loadDetails();
            } else {
                toast.error(res.error || 'Failed to save diagnosis');
            }
        } finally {
            setSavingDiagnosis(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading patient...
            </div>
        );
    }

    if (!data) return null;

    const inputCls = "w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-medium text-gray-900";
    const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] block mb-1.5";

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <button
                onClick={() => router.push('/doctor/ipd-patients')}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-orange-600 mb-4"
            >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to IPD Patients
            </button>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
                <h1 className="text-2xl font-black text-gray-900">{data.patient?.full_name}</h1>
                <div className="flex gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.patient?.patient_id}</span>
                    {data.patient?.age && <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.patient.age}y / {data.patient?.gender || 'N/A'}</span>}
                    <span className="bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">{data.bed?.wards?.ward_name || 'Ward N/A'} • Bed {data.bed?.bed_id || 'N/A'}</span>
                    <span className="bg-orange-500/10 text-teal-600 px-2 py-0.5 rounded-lg border border-orange-500/20 font-black">{data.status}</span>
                </div>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <Icon className="h-3.5 w-3.5" /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'profile' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className={labelCls}>Admission Date</p>
                        <p className="font-bold text-gray-800">{new Date(data.admission_date).toLocaleString('en-GB')}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Attending Doctor</p>
                        <p className="font-bold text-gray-800">{data.doctor_name || 'Not specified'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Phone</p>
                        <p className="font-bold text-gray-800">{data.patient?.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Admission Type</p>
                        <p className="font-bold text-gray-800">{data.admission_type || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Line of Treatment</p>
                        <p className="font-bold text-gray-800">{data.line_of_treatment || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={labelCls}>Code Status</p>
                        <p className="font-bold text-gray-800">{data.code_status || 'N/A'}</p>
                    </div>
                </div>
            )}

            {activeTab === 'diagnosis' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 max-w-2xl">
                    <div>
                        <label className={labelCls}>Diagnosis</label>
                        <textarea
                            className={inputCls}
                            rows={3}
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                            placeholder="Working / confirmed diagnosis..."
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Primary ICD Code</label>
                        <input
                            className={inputCls}
                            value={primaryIcd}
                            onChange={(e) => setPrimaryIcd(e.target.value)}
                            placeholder="e.g. J18.9"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Secondary Diagnoses (comma-separated)</label>
                        <input
                            className={inputCls}
                            value={secondaryDx}
                            onChange={(e) => setSecondaryDx(e.target.value)}
                            placeholder="e.g. Hypertension, Type 2 Diabetes"
                        />
                    </div>
                    <button
                        onClick={handleSaveDiagnosis}
                        disabled={savingDiagnosis}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 disabled:opacity-50"
                    >
                        {savingDiagnosis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Diagnosis
                    </button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (note: `clinical`, `vitals`, `nursing`, `discharge` tabs currently render nothing — that's expected until Tasks 4-7 add their bodies).

- [ ] **Step 4: Manual verification**

From the list page, click a patient row. Expected: detail page loads, Profile tab shows admission info, Diagnosis tab loads existing values, editing and saving diagnosis shows a success toast and the saved values persist on reload. Confirm no Billing/TPA tab exists anywhere on this page.

- [ ] **Step 5: Commit**

```bash
git add app/doctor/ipd-patients/[admissionId]/page.tsx app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx
git commit -m "feat(doctor): add IPD patient detail page with profile and diagnosis tabs"
```

---

### Task 4: Clinical tab (read-only medical notes + ward rounds)

**Files:**
- Modify: `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`

**Interfaces:**
- Consumes: `data.medical_notes: Array<{ id: number; note_type: string; details: string; created_at: string }>` and `data.ward_rounds: Array<{ id: number; doctor_id: string; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; round_type: string; created_at: string }>`, both already present on `data` from Task 3's `getAdmissionFullDetails` call — no new fetch needed.
- Produces: nothing consumed by later tasks (this tab is a leaf).

- [ ] **Step 1: Add the Clinical tab body**

In `IpdPatientDetailContent.tsx`, immediately after the `{activeTab === 'diagnosis' && ( ... )}` block (and before the closing `</div>` of the component), add:

```typescript
            {activeTab === 'clinical' && (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="font-black text-gray-700 mb-4 text-sm uppercase tracking-wide">Medical Notes</h3>
                        {data.medical_notes?.length ? (
                            <div className="space-y-3">
                                {data.medical_notes.map((note: any) => (
                                    <div key={note.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-black text-teal-600 uppercase">{note.note_type}</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">{new Date(note.created_at).toLocaleString('en-GB')}</span>
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.details}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">No medical notes recorded.</p>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="font-black text-gray-700 mb-4 text-sm uppercase tracking-wide">Ward Rounds</h3>
                        {data.ward_rounds?.length ? (
                            <div className="space-y-3">
                                {data.ward_rounds.map((round: any) => (
                                    <div key={round.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-black text-teal-600 uppercase">{round.round_type}</span>
                                            <span className="text-[10px] text-gray-400 font-semibold">{new Date(round.created_at).toLocaleString('en-GB')}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                                            {round.subjective && <p><span className="font-bold text-gray-500">S:</span> {round.subjective}</p>}
                                            {round.objective && <p><span className="font-bold text-gray-500">O:</span> {round.objective}</p>}
                                            {round.assessment && <p><span className="font-bold text-gray-500">A:</span> {round.assessment}</p>}
                                            {round.plan && <p><span className="font-bold text-gray-500">P:</span> {round.plan}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">No ward rounds recorded.</p>
                        )}
                    </div>
                </div>
            )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Open a patient with existing medical notes / ward rounds (or add one via an existing nurse/doctor flow first). Expected: Clinical tab shows them read-only; empty states render correctly for a patient with none.

- [ ] **Step 4: Commit**

```bash
git add app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx
git commit -m "feat(doctor): add read-only Clinical tab to IPD patient detail"
```

---

### Task 5: Vitals tab (lazy-loaded, reuses VitalsChart)

**Files:**
- Modify: `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`

**Interfaces:**
- Consumes: `getIPDVitalsHistory(admissionId: string)` from `app/actions/ipd-nursing-actions.ts:149`, returning `{ success: true, data: Array<{ bp_systolic, bp_diastolic, heart_rate, temperature, respiratory_rate, spo2, pain_score, consciousness, blood_sugar, urine_output_ml, news_score, news_level, recorded_by, created_at }> } | { success: false, error: string }`. Consumes `VitalsChart` from `app/components/ipd/VitalsChart.tsx`, props `{ vitals: VitalEntry[]; mode?: 'vitals' | 'news' }` where `VitalEntry` needs `recorded_at` — map `created_at` to `recorded_at` when passing data in.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add vitals state and lazy-load effect**

In `IpdPatientDetailContent.tsx`, add the import at the top:

```typescript
import { getIPDVitalsHistory } from '@/app/actions/ipd-nursing-actions';
import { VitalsChart } from '@/app/components/ipd/VitalsChart';
```

Add state alongside the existing `diagnosis`/`primaryIcd` state declarations:

```typescript
    const [vitals, setVitals] = useState<any[]>([]);
    const [loadingVitals, setLoadingVitals] = useState(false);
    const [vitalsLoaded, setVitalsLoaded] = useState(false);
```

Add an effect below the existing `useEffect` that calls `loadDetails()`:

```typescript
    useEffect(() => {
        if (activeTab !== 'vitals' || vitalsLoaded) return;
        setLoadingVitals(true);
        getIPDVitalsHistory(admissionId).then((res) => {
            if (res.success) setVitals(res.data as any[]);
            else toast.error(res.error || 'Failed to load vitals');
            setLoadingVitals(false);
            setVitalsLoaded(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, admissionId, vitalsLoaded]);
```

- [ ] **Step 2: Add the Vitals tab body**

Add this block after the Clinical tab block:

```typescript
            {activeTab === 'vitals' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    {loadingVitals ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vitals...
                        </div>
                    ) : vitals.length === 0 ? (
                        <p className="text-sm text-gray-400">No vitals recorded yet.</p>
                    ) : (
                        <VitalsChart
                            vitals={vitals.map((v) => ({ ...v, recorded_at: v.created_at }))}
                            mode="vitals"
                        />
                    )}
                </div>
            )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open a patient with recorded vitals. Expected: switching to the Vitals tab shows a loading spinner then the chart; switching tabs and back does not re-fetch (guarded by `vitalsLoaded`).

- [ ] **Step 5: Commit**

```bash
git add app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx
git commit -m "feat(doctor): add lazy-loaded Vitals tab to IPD patient detail"
```

---

### Task 6: Nursing tab (lazy-loaded, custom read-only cards)

**Files:**
- Modify: `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`

**Interfaces:**
- Consumes: `getNursingAssessments(admissionId: string)` from `app/actions/ipd-nursing-actions.ts:475`, returning `{ success: true, data: Array<{ id: number; assessment_type: string; consciousness: string | null; pain_score: number | null; fall_risk_score: number | null; braden_score: number | null; nutrition_screen: string | null; mobility: string | null; continence: string | null; assessed_by: string | null; created_at: string }> } | { success: false, error: string }`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add nursing state and lazy-load effect**

Add the import:

```typescript
import { getNursingAssessments } from '@/app/actions/ipd-nursing-actions';
```

Add state next to the vitals state:

```typescript
    const [nursingAssessments, setNursingAssessments] = useState<any[]>([]);
    const [loadingNursing, setLoadingNursing] = useState(false);
    const [nursingLoaded, setNursingLoaded] = useState(false);
```

Add an effect next to the vitals effect:

```typescript
    useEffect(() => {
        if (activeTab !== 'nursing' || nursingLoaded) return;
        setLoadingNursing(true);
        getNursingAssessments(admissionId).then((res) => {
            if (res.success) setNursingAssessments(res.data as any[]);
            else toast.error(res.error || 'Failed to load nursing assessments');
            setLoadingNursing(false);
            setNursingLoaded(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, admissionId, nursingLoaded]);
```

- [ ] **Step 2: Add the Nursing tab body**

Add this block after the Vitals tab block:

```typescript
            {activeTab === 'nursing' && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    {loadingNursing ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading nursing assessments...
                        </div>
                    ) : nursingAssessments.length === 0 ? (
                        <p className="text-sm text-gray-400">No nursing assessments recorded.</p>
                    ) : (
                        <div className="space-y-3">
                            {nursingAssessments.map((a) => (
                                <div key={a.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black text-teal-600 uppercase">{a.assessment_type}</span>
                                        <span className="text-[10px] text-gray-400 font-semibold">{new Date(a.created_at).toLocaleString('en-GB')}</span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                                        <div><span className="font-bold text-gray-400 block">Consciousness</span>{a.consciousness || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Pain Score</span>{a.pain_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Fall Risk</span>{a.fall_risk_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Braden Score</span>{a.braden_score ?? 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Mobility</span>{a.mobility || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Continence</span>{a.continence || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Nutrition</span>{a.nutrition_screen || 'N/A'}</div>
                                        <div><span className="font-bold text-gray-400 block">Assessed By</span>{a.assessed_by || 'N/A'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open a patient with recorded nursing assessments. Expected: Nursing tab shows cards read-only; no edit controls present anywhere on this tab.

- [ ] **Step 5: Commit**

```bash
git add app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx
git commit -m "feat(doctor): add lazy-loaded Nursing tab to IPD patient detail"
```

---

### Task 7: Discharge Summary tab (reuses existing editor)

**Files:**
- Modify: `app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx`

**Interfaces:**
- Consumes: `DischargeSummaryEditor` from `app/components/ipd/DischargeSummaryEditor.tsx`, props `{ admissionId: string }`. This component already handles its own data loading, saving, printing, and server-side role gating (`doctor/admin/ipd_manager/superadmin` in `app/actions/discharge-summary-actions.ts`) — mount it as-is with no wrapper logic.
- Produces: nothing consumed by later tasks (final tab).

- [ ] **Step 1: Add the import**

```typescript
import { DischargeSummaryEditor } from '@/app/components/ipd/DischargeSummaryEditor';
```

- [ ] **Step 2: Add the Discharge Summary tab body**

Add this block after the Nursing tab block:

```typescript
            {activeTab === 'discharge' && (
                <DischargeSummaryEditor admissionId={admissionId} />
            )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open the Discharge Summary tab as a doctor-role user. Expected: the existing NABH discharge summary form loads and is editable/printable exactly as it is on the reception/IPD-manager side.

**Known blocker (pre-existing, not introduced by this plan):** if the `20260622140000_discharge_summary_structured` migration has not been applied to the target database yet, `DischargeSummaryEditor` will throw when loading/saving. If so, this step will surface that error — it is not a regression from this feature; flag it separately rather than debugging it here.

- [ ] **Step 5: Commit**

```bash
git add app/doctor/ipd-patients/[admissionId]/IpdPatientDetailContent.tsx
git commit -m "feat(doctor): add Discharge Summary tab to IPD patient detail"
```

---

### Task 8: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole repo.

- [ ] **Step 2: Confirm no changes to excluded files**

Run: `git diff main --stat -- app/ipd/admission app/billing app/ipd/billing app/ipd/discharge-settlement`
Expected: empty output (no changes to the shared admission chart page, billing, or discharge-settlement UI).

- [ ] **Step 3: End-to-end manual walkthrough as a doctor-role user**

1. Log in as a `doctor`-role user; confirm "IPD Patients" appears in the sidebar under Clinical.
2. Open `/doctor/ipd-patients`; confirm the list shows all currently-admitted (and semi-discharged) patients hospital-wide, with working search.
3. Click into a patient; confirm Profile, Diagnosis, Clinical, Vitals, Nursing, and Discharge Summary tabs all render, and that no Billing/TPA tab or admit/discharge action exists anywhere on the page.
4. Edit and save the diagnosis; reload the page and confirm it persisted.
5. Author (or view) the discharge summary and confirm print works (subject to the migration caveat in Task 7).
6. As a non-doctor role (e.g. reception), confirm `/doctor/ipd-patients` is still blocked by the existing `/doctor` role gate.

- [ ] **Step 4: Report completion**

No commit — this task is verification-only. If all checks pass, the feature is complete.
