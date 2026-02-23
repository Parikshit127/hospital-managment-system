# HOIS — Hospital Operating Intelligence System — Implementation Plan

## Status: Phase 1-3 Complete ✅

### Phase 1: Schema & Infrastructure ✅ DONE
- [x] New Prisma models: `system_audit_logs`, `beds` (aligned w/ existing DB), `wards`, `billing_records`, `triage_results`, `vital_signs`
- [x] Added `bed_id` relation on `admissions` → `beds`
- [x] `prisma generate` + `prisma db push` successful
- [x] Server Actions created:
  - `admin-actions.ts` — Dashboard stats, bed occupancy, revenue breakdown, patient flow, inventory alerts
  - `audit-actions.ts` — Log events, paginated audit logs, audit stats
  - `triage-actions.ts` — Rule-based AI triage engine with SOAP note generation
- [x] Enhanced `discharge-actions.ts` with `getAdmittedPatients()` and `processDischarge()`
- [x] Audit logging added to `login/actions.ts`, `register-patient.ts`, `discharge-actions.ts`

### Phase 2: Admin Intelligence Dashboard ✅ DONE
- [x] `/admin/dashboard` — Command Center with:
  - Real-time KPI cards (Patients Today, IPD Admissions, Lab Queue, Revenue)
  - Bed Occupancy ring chart with ward breakdown
  - Patient Flow bar chart (7-day trend)
  - Revenue Breakdown by department (horizontal bars)
  - Inventory Alerts (low stock + expiring soon)
  - Audit Trail live feed
  - Quick navigation to all modules
- [x] Admin role redirects to `/admin/dashboard` on login

### Phase 3: AI Triage System ✅ DONE
- [x] `/reception/triage` — AI Patient Intake with:
  - 3-step wizard (Patient Info → Symptoms → History & Vitals)
  - 24 clickable common symptoms + custom symptom input
  - Severity selector (Mild / Moderate / Severe)
  - Optional vitals capture (BP, HR, Temp, SpO2)
  - Rule-based triage engine with emergency/urgent/routine classification
  - Red-flag symptom detection & vitals-based escalation
  - SOAP clinical summary generation
  - Possible conditions, recommended tests, risk alerts
  - Results saved to DB + audit logged

### Phase 4: AI Co-Pilot for Doctors 🔜 NEXT
- [ ] Side panel in `/doctor/dashboard` for:
  - Patient history summarization
  - Drug interaction warnings
  - Evidence-based treatment suggestions
  - One-click test ordering from AI suggestions

### Phase 5: Audit Trail & Compliance 🔜 PLANNED
- [ ] Dedicated `/admin/audit` page with:
  - Filterable/paginated audit log viewer
  - Filter by module, action, user
  - Export functionality
  - Role-based access enforcement

### Phase 6: Enhanced UI/UX ✅ DONE
- [x] Premium dark theme with modern design system
- [x] Inter font from Google Fonts
- [x] Custom scrollbar, glassmorphism, gradient accents
- [x] Animated backgrounds (login page)
- [x] Updated layout metadata (SEO, description, title)
- [x] Login page redesigned with password toggle, role badges, security branding

---

## Routes Map
| Route | Module | Status |
|-------|--------|--------|
| `/login` | Auth | ✅ Redesigned |
| `/admin/dashboard` | Admin Intelligence | ✅ New |
| `/reception/register` | OPD Registration | ✅ Existing |
| `/reception/triage` | AI Triage | ✅ New |
| `/doctor/dashboard` | Doctor Console | ✅ Existing |
| `/lab/technician` | Lab Worklist | ✅ Existing |
| `/pharmacy/billing` | Pharmacy & Billing | ✅ Existing |
| `/discharge/admin` | Discharge Hub | ✅ Existing |

## Tech Stack
- Next.js 16.1.6 (Turbopack)
- Prisma 5.10.2 + Supabase PostgreSQL
- Tailwind CSS v4
- Lucide React icons
- Inter font (Google Fonts)
