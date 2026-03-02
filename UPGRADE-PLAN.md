# Hospital OS - Production-Grade Portal Upgrade Plan

## Context

Hospital OS is a multi-tenant Hospital Management System built with **Next.js 16, React 19, Prisma (SQLite), TailwindCSS**. It currently has **28 Prisma models**, **15 server action files (~5,134 LOC)**, and pages for 10+ modules. However, most portals have only 1-2 pages with basic functionality. The goal is to upgrade every portal to be **production-grade** with complete workflows, proper UX, and missing features filled in.

The upgrade is structured in **4 phases**, each independently deployable. We will work portal-by-portal within each phase.

---

## Phase 1: Complete Existing Portal Workflows (6 portals)

### 1.1 Reception / Front Desk Portal

**Current:** `/reception` (patient list), `/reception/register`, `/reception/triage`, `/opd/display`
**Gap:** No appointment calendar, no live queue board, no scheduling UI

**New pages:**
- `/reception/appointments` - Day/week appointment calendar with doctor slot management
- `/reception/queue` - Live queue management per doctor (reorder, skip, re-queue)
- `/reception/token-display` - Full-screen TV-mode token board for waiting rooms (auto-refresh)
- `/reception/patient/[id]` - Full patient profile with visit history

**Schema changes (`prisma/schema.prisma`):**
- Add `Department` model (id, name, slug, head_doctor_id?, is_active, organizationId)
- Add `slot_type` field (walkin/scheduled/blocked) to `AppointmentSlot`
- Add `cancellation_reason` field to `appointments`

**New server actions (in `app/actions/reception-actions.ts`):**
- `getAppointmentCalendar(date, doctorId?)`, `bookAppointment(patientId, slotId)`, `rescheduleAppointment()`, `cancelAppointment(id, reason)`, `createBulkSlots(doctorId, dateRange, pattern)`, `getDepartmentList()`

**Reuse:** `KPICard`, `Table`, `Badge`, `Modal`, `AppShell`, `LoadingState`

---

### 1.2 Doctor Portal

**Current:** `/doctor/dashboard` - monolithic 895-line consultation console with queue, SOAP notes, AI assistant, lab/pharmacy ordering
**Gap:** No schedule management, no prescription templates, no patient timeline, no follow-ups

**New pages:**
- `/doctor/schedule` - View/manage own availability, block time slots
- `/doctor/patient/[id]` - Full patient timeline (visits, labs, prescriptions, admissions chronologically)
- `/doctor/templates` - Reusable SOAP note and prescription templates (create, edit, apply)
- `/doctor/follow-ups` - Track patients needing follow-up with reminder triggers

**Schema changes:**
- New `PrescriptionTemplate` model (id, doctor_id, name, type, content JSON, organizationId)
- New `FollowUp` model (id, patient_id, doctor_id, scheduled_date, status, notes, organizationId)
- Add `follow_up_date` to `appointments`

**New server actions (in `app/actions/doctor-actions.ts`):**
- `getDoctorSchedule()`, `updateDoctorAvailability()`, `getPatientTimeline(patientId)`, `saveTemplate()`, `getTemplates()`, `applyTemplate()`, `scheduleFollowUp()`, `getFollowUpsDue()`

**Refactor:** Extract tab content from the monolithic dashboard page into separate component files under `app/doctor/components/`

---

### 1.3 Lab Technician Portal

**Current:** `/lab/technician` - single page with pending/completed orders, result upload
**Gap:** No dashboard KPIs, no sample tracking, no batch processing, no QC, no inventory

**New pages:**
- `/lab/dashboard` - KPIs (TAT, pending, completed, critical alerts)
- `/lab/worklist` - Enhanced worklist with barcode scanner input, filters, batch processing
- `/lab/sample/[barcode]` - Individual sample detail with status timeline and result entry
- `/lab/inventory` - Reagent and consumable inventory management
- `/lab/reports` - Daily summary, test-wise counts, TAT analysis

**Schema changes:**
- New `LabSampleTracking` model (id, barcode, status enum, collected_at, received_at, processed_at, completed_at, notes, organizationId)
- New `LabReagentInventory` model (id, reagent_name, current_stock, unit, min_threshold, expiry_date, organizationId)
- Add `normal_range_min`, `normal_range_max`, `unit`, `category`, `sample_type` to `lab_test_inventory`
- Add `is_critical` Boolean and `critical_notified_at` to `lab_orders`

**New server actions (in `app/actions/lab-actions.ts`):**
- `getLabDashboardStats()`, `updateSampleStatus()`, `batchUploadResults()`, `getLabTATReport()`, `getLabInventory()`, `updateLabInventory()`, `flagCriticalResult()`

---

### 1.4 Pharmacist Portal

**Current:** `/pharmacy/billing` - queue from doctor orders, inventory with batch tracking, drug interaction check
**Gap:** No dashboard, no purchase orders, no supplier management, no returns, no stock alerts UI

**New pages:**
- `/pharmacy/dashboard` - KPIs (pending orders, low stock, expiring batches, revenue)
- `/pharmacy/orders` - Enhanced prescription queue with status tracking
- `/pharmacy/dispense/[orderId]` - Detailed dispensing with batch selection and interaction warnings
- `/pharmacy/inventory` - Full inventory management with search, filters, low-stock view
- `/pharmacy/purchase-orders` - Create and track purchase orders to suppliers
- `/pharmacy/suppliers` - Supplier CRUD
- `/pharmacy/returns` - Patient returns and expired stock processing
- `/pharmacy/reports` - Sales, stock movement, expiry reports

**Schema changes:**
- New `PharmacySupplier` model (id, name, contact_person, phone, email, gst_no, is_active, organizationId)
- New `PurchaseOrder` model (id, po_number, supplier_id, status, total_amount, ordered_at, received_at, organizationId)
- New `PurchaseOrderItem` model (id, po_id, medicine_id, quantity_ordered, quantity_received, unit_price)
- New `PharmacyReturn` model (id, return_type, medicine_id, batch_id, quantity, reason, processed_by, organizationId)
- Add `category`, `manufacturer` to `pharmacy_medicine_master`

**New server actions (in `app/actions/pharmacy-actions.ts`):**
- `getPharmacyDashboardStats()`, `dispenseMedicine()`, `searchMedicine()`, `getLowStockAlerts()`, `getExpiringBatches()`, `createPurchaseOrder()`, `receivePurchaseOrder()`, `processReturn()`, `getSalesReport()`

---

### 1.5 IPD Manager Portal

**Current:** `/ipd` (admission list), `/ipd/bed-matrix`, `/discharge/admin`. Has ward/bed management, medical notes.
**Gap:** No nursing station, no diet management, no ward rounds, no inter-ward transfer

**New pages:**
- `/ipd/admission/[id]` - Detailed admission view with notes timeline, vitals trends, invoices
- `/ipd/transfer` - Inter-ward/bed transfer workflow
- `/ipd/nursing-station` - Per-ward patient list with pending tasks and medication schedule
- `/ipd/diet` - Diet plan assignment and tracking
- `/ipd/ward-rounds` - Ward round documentation (observations, plan changes)
- `/ipd/census` - Real-time ward-wise occupancy and LOS stats

**Schema changes:**
- New `BedTransfer` model (id, admission_id, from_bed_id, to_bed_id, reason, transferred_by, organizationId)
- New `DietPlan` model (id, admission_id, diet_type, instructions, is_active, created_by, organizationId)
- New `WardRound` model (id, admission_id, doctor_id, observations, plan_changes, organizationId)
- New `NursingTask` model (id, admission_id, task_type, description, scheduled_at, completed_at, assigned_to, status, organizationId)

**New server actions (in `app/actions/ipd-actions.ts`):**
- `transferPatient()`, `assignDietPlan()`, `recordWardRound()`, `getNursingTasks()`, `completeNursingTask()`, `getIPDCensus()`

---

### 1.6 Patient Portal

**Current:** `/patient/dashboard`, `/patient/appointments`, `/patient/labs`, `/patient/payments`, `/patient/assessment/[orgSlug]`
**Gap:** No online booking, no prescription downloads, no profile management, no medical records, no vitals history

**New pages:**
- `/patient/appointments/book` - Self-service appointment booking (department > doctor > date > slot)
- `/patient/profile` - View/edit personal info, emergency contacts
- `/patient/prescriptions` - All prescriptions with download
- `/patient/records` - Downloadable clinical notes and discharge summaries
- `/patient/vitals` - Vitals history with trend charts
- `/patient/insurance` - View policies and claim status
- `/patient/feedback` - Post-visit feedback and rating

**Schema changes:**
- New `PatientFeedback` model (id, patient_id, appointment_id?, rating Int, comments, organizationId)
- Add `emergency_contact_name`, `emergency_contact_phone`, `blood_group`, `date_of_birth` to `OPD_REG`

**New server actions (new file `app/actions/patient-actions.ts`):**
- `getAvailableSlots()`, `bookAppointmentOnline()`, `getPatientProfile()`, `updatePatientProfile()`, `getPatientPrescriptions()`, `getPatientMedicalRecords()`, `getPatientVitalsHistory()`, `submitFeedback()`

---

## Phase 2: Admin, Finance & SuperAdmin Upgrades (3 portals)

### 2.1 Admin Portal

**Current:** `/admin/dashboard` (KPIs, charts), `/admin/staff` (CRUD), `/admin/audit`, `/admin/mfa-setup`
**Gap:** No department management, no org settings UI, no report hub

**New pages:**
- `/admin/departments` - Department CRUD (name, head doctor, fees, active/inactive)
- `/admin/settings` - Organization settings (name, address, timezone, integrations toggle)
- `/admin/settings/branding` - Logo, colors, portal title
- `/admin/reports` - Report hub (footfall, revenue, department performance, staff activity)

**New server actions (in `app/actions/admin-actions.ts`):**
- `getDepartments()`, `createDepartment()`, `updateDepartment()`, `getOrganizationSettings()`, `updateOrganizationSettings()`, `updateOrganizationBranding()`, `generateReport()`

---

### 2.2 Finance Portal

**Current:** `/finance/dashboard` (KPIs, revenue breakdown). Full invoice CRUD, payment recording, charge catalog.
**Gap:** No payment ledger view, no cash closure, no refunds, no TPA reconciliation, no reports page

**New pages:**
- `/finance/invoices` - Enhanced invoice list with search, filters, status tracking
- `/finance/invoices/[id]` - Detailed invoice view with payments and claims
- `/finance/payments` - All payments ledger with filters
- `/finance/cash-closure` - Daily cash drawer reconciliation
- `/finance/revenue` - Revenue analytics with trends and breakdowns
- `/finance/refunds` - Refund request and processing
- `/finance/tpa-reconciliation` - Insurance claim settlement tracking
- `/finance/reports` - Financial reports (P&L summary, collection, aging)

**Schema changes:**
- New `CashClosure` model (id, closure_date, cash_total, card_total, online_total, notes, closed_by, organizationId)
- New `Refund` model (id, payment_id, invoice_id, amount, reason, status, processed_by, organizationId)

**New server actions (in `app/actions/finance-actions.ts`):**
- `getPaymentLedger()`, `performCashClosure()`, `getRevenueAnalytics()`, `processRefund()`, `getTPAReconciliation()`, `exportFinancialReport()`

---

### 2.3 SuperAdmin Portal

**Current:** `/superadmin` (dashboard), `/superadmin/organizations` (list + create new)
**Gap:** No detailed org view, no cross-org analytics, no user management

**New pages:**
- `/superadmin/organizations/[id]` - Detailed org view with stats, config, user count
- `/superadmin/analytics` - Platform-wide analytics (total patients, revenue across orgs)
- `/superadmin/users` - Cross-org user search

**New server actions (in `app/actions/superadmin-actions.ts`):**
- `getOrganizationDetails()`, `getPlatformAnalytics()`, `getOrganizationUsers()`

---

## Phase 3: New Modules (3 new portals)

### 3.1 Nurse Portal (NEW)

**New role:** `nurse` added to User model role enum

**Pages:**
- `/nurse/dashboard` - Assigned ward, patient count, pending tasks
- `/nurse/patients` - Ward patient list with quick vitals/task view
- `/nurse/patient/[id]` - Patient care view (vitals, medications, nursing notes)
- `/nurse/vitals` - Vitals recording with auto-alerting for abnormal values
- `/nurse/medications` - Medication Administration Record (MAR)
- `/nurse/tasks` - Task list (vitals due, medication due, procedures)
- `/nurse/handover` - Shift handover report

**Schema changes:**
- New `NursingNote` model (id, admission_id, nurse_id, note_type, details, organizationId)
- New `MedicationAdministration` model (id, admission_id, medication_name, dose, route, scheduled_time, administered_at, status, organizationId)
- New `ShiftHandover` model (id, ward_id, from_nurse_id, to_nurse_id, shift_date, summary JSON, organizationId)
- Add `assigned_ward_id` to `User` model

**Infrastructure changes:**
- Add `nurse` to `ROLE_ROUTES` in `middleware.ts` (line 12-23)
- Add `nurse` to `NAV_BY_ROLE` in `app/components/layout/Sidebar.tsx` (line 18-58)
- Add `nurse` to `roleLabelMap` in Sidebar (line 79-87)
- Add `nurse` redirect in middleware `redirectMap` (line 101-109)

**New server actions (new file `app/actions/nurse-actions.ts`):**
- `getNurseDashboard()`, `getWardPatients()`, `recordVitals()`, `getMedicationSchedule()`, `administerMedication()`, `addNursingNote()`, `generateHandoverReport()`

---

### 3.2 OPD Manager Portal (NEW)

**New role:** `opd_manager` added to User model role enum

**Pages:**
- `/opd-manager/dashboard` - Real-time queue status, doctor utilization, wait times
- `/opd-manager/queues` - Live queue management across all doctors, re-assign patients
- `/opd-manager/doctors` - Doctor availability overview
- `/opd-manager/appointments` - No-show tracking, overbooking detection
- `/opd-manager/reports` - Footfall, wait time, peak hours analysis

**Schema changes:**
- New `OPDConfig` model (id, max_wait_minutes, escalation_threshold, organizationId)

**Infrastructure changes:**
- Add `/opd-manager` to `ROLE_ROUTES` in `middleware.ts`
- Add `opd_manager` to `NAV_BY_ROLE` and `roleLabelMap` in Sidebar
- Add `opd_manager` redirect in middleware `redirectMap`

**New server actions (new file `app/actions/opd-manager-actions.ts`):**
- `getOPDManagerDashboard()`, `getAllDoctorQueues()`, `reassignPatient()`, `getDoctorUtilization()`, `getWaitTimeAnalytics()`, `getNoShowReport()`

---

### 3.3 HR Management Portal (NEW)

**New role:** `hr` added to User model role enum

**Pages:**
- `/hr/dashboard` - Headcount, department breakdown, recent hires
- `/hr/employees` - Employee directory with search and filters
- `/hr/employees/[id]` - Employee profile (personal info, role, department, leave history)
- `/hr/employees/new` - New employee onboarding form
- `/hr/attendance` - Check-in/check-out tracking, monthly view
- `/hr/leave` - Leave management (apply, approve, balance tracking)
- `/hr/shifts` - Shift scheduling and roster creation
- `/hr/reports` - Turnover, attendance %, headcount trends

**Schema changes (major):**
- New `Employee` model (id, user_id, employee_code, designation, department_id, date_of_joining, salary_basic, is_active, organizationId)
- New `Attendance` model (id, employee_id, date, check_in, check_out, total_hours, status, organizationId)
- New `LeaveType` model (id, name, days_per_year, carry_forward, organizationId)
- New `LeaveRequest` model (id, employee_id, leave_type_id, from_date, to_date, reason, status, approved_by, organizationId)
- New `ShiftPattern` model (id, name, start_time, end_time, organizationId)
- New `ShiftAssignment` model (id, employee_id, shift_pattern_id, date, organizationId)

**Infrastructure changes:**
- Add `/hr` to `ROLE_ROUTES` in `middleware.ts`
- Add `hr` to `NAV_BY_ROLE` and `roleLabelMap` in Sidebar
- Add `hr` redirect in middleware `redirectMap`

**New server actions (new file `app/actions/hr-actions.ts`):**
- `getHRDashboard()`, `getEmployeeList()`, `createEmployee()`, `updateEmployee()`, `recordAttendance()`, `applyLeave()`, `approveLeave()`, `getLeaveBalance()`, `createShiftRoster()`

---

## Phase 4: Cross-Cutting Upgrades (all portals)

### 4.1 Notification Center
- New `Notification` model (id, user_id, title, body, type, is_read, link, organizationId)
- `NotificationBell` component in AppShell header
- `/notifications` page for full notification list
- Triggers: lab result ready, appointment booked, payment received, critical vitals

### 4.2 Report & PDF Generation Module
- Shared PDF templates using `@react-pdf/renderer` (already installed)
- API routes under `/api/reports/[type]/pdf`
- CSV export utility for tabular data
- Report types: Invoice, Lab Report, Discharge Summary, Prescription, Financial Report

### 4.3 Responsive Mobile Views
- Audit all pages for mobile responsiveness
- `BottomNavBar` component for patient portal mobile
- Responsive table patterns (horizontal scroll or card-on-mobile)

### 4.4 Error Handling & Loading Consistency
- Shared `ErrorBoundary` component
- `PageSkeleton` loading components per portal
- Standardize server action responses: `{ success: boolean, error?: string, data?: any }`

---

## New Prisma Models Summary (30 total)

| # | Model | Phase |
|---|-------|-------|
| 1 | Department | 1 |
| 2 | PrescriptionTemplate | 1 |
| 3 | FollowUp | 1 |
| 4 | LabSampleTracking | 1 |
| 5 | LabReagentInventory | 1 |
| 6 | PharmacySupplier | 1 |
| 7 | PurchaseOrder | 1 |
| 8 | PurchaseOrderItem | 1 |
| 9 | PharmacyReturn | 1 |
| 10 | BedTransfer | 1 |
| 11 | DietPlan | 1 |
| 12 | WardRound | 1 |
| 13 | NursingTask | 1 |
| 14 | PatientFeedback | 1 |
| 15 | CashClosure | 2 |
| 16 | Refund | 2 |
| 17 | NursingNote | 3 |
| 18 | MedicationAdministration | 3 |
| 19 | ShiftHandover | 3 |
| 20 | OPDConfig | 3 |
| 21 | Employee | 3 |
| 22 | Attendance | 3 |
| 23 | LeaveType | 3 |
| 24 | LeaveRequest | 3 |
| 25 | ShiftPattern | 3 |
| 26 | ShiftAssignment | 3 |
| 27 | Notification | 4 |

---

## Critical Files to Modify

| File | What Changes |
|------|-------------|
| `prisma/schema.prisma` | All new models + field additions to existing models |
| `middleware.ts` | New role routes for nurse, opd_manager, hr |
| `app/components/layout/Sidebar.tsx` | Nav items for all new/expanded roles in `NAV_BY_ROLE` |
| `app/lib/validations.ts` | Zod schemas for all new forms |
| `app/lib/session.ts` | Support new roles in session type |
| `backend/db.ts` | Add new models to tenant-scoped list in `getTenantPrisma()` |
| `backend/tenant.ts` | Ensure `requireTenantContext()` covers new action files |

---

## Implementation Approach

We will work **one portal at a time**, in this order within each phase:
1. Schema changes first (add models, run `prisma db push`)
2. Server actions next (business logic)
3. Pages and UI last (consuming the actions)

Each portal is a self-contained unit of work that can be committed and deployed independently.

---

## Verification

After each portal upgrade:
1. Run `npx prisma db push` to apply schema changes
2. Run `npm run build` to verify no TypeScript errors
3. Start dev server with `npm run dev` and manually test each new page
4. Verify role-based access: login as the specific role and confirm sidebar navigation works
5. Test the full workflow end-to-end (e.g., for reception: register patient > book appointment > view in queue > token display)
