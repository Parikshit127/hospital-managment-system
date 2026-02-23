# HospitalOS: IPD & Finance Implementation Plan

This document outlines a production-level execution plan for adding **Inpatient Department (IPD)** and **Finances/Billing** to the HospitalOS platform.

## 1. System Architecture & Database (Phase 1)
Our `prisma/schema.prisma` already includes the foundations for IPD and Finances (`admissions`, `beds`, `wards`, `vital_signs`, `medical_notes`, `discharge_summaries`, `billing_records`).

### Tasks:
- [ ] **Seed Data for Wards/Beds**: Write a seed script or migrations to populate initial wards (e.g., General, ICU, Maternity) and their associated beds.
- [ ] **Data Model Validation**: Ensure relationships (foreign keys) are fully defined and cascaded correctly, specifically between `billing_records` and the respective modules (`OPD_REG`, `lab_orders`, `admissions`).

---

## 2. Inpatient Department (IPD) Module (Phase 2)
IPD manages the patient's lifecycle from admission and bed allocation to daily charting and final discharge. We will create a dedicated `/ipd` route or integrate it into an "IPD Manager" view.

### A. Bed Management & Admission Workflow
- [ ] **Admission Dashboard (`app/ipd/page.tsx`)**: Displays all current admissions, ward occupancy rates, and pending bed requests.
- [ ] **Bed Allocation System**: Visual UI showing `wards` and their associated `beds`. Highlight available, occupied, and maintenance beds.
- [ ] **Admission Action (`actions/admit-patient.ts`)**: Server action to link a patient from `OPD_REG` to a `bed_id`, updating the `admissions` table and changing bed status to "Occupied".

### B. Inpatient Care (Nurse & Doctor Station)
- [ ] **Patient Chart (`app/ipd/patient/[id]/page.tsx`)**: A detailed view of an admitted patient.
- [ ] **Vitals Tracking**: A form and chart component to record and display entries in the `vital_signs` table (BP, HR, Temp, SpO2).
- [ ] **Medical Notes / Nursing Rounds**: A timeline view allowing doctors and nurses to append entries to the `medical_notes` table (Note Type: Admission Note, Routine Check, Nursing, etc.).
- [ ] **Integration with Lab & Pharma**: Ability to order lab tests or pharmacy items directly from the IPD patient chart.

### C. Discharge Workflow
- [ ] **Discharge Action**: Un-assign the bed, calculate total stay duration, and trigger a `billing_record` for the room charges. Generate entry in `discharge_summaries`.

---

## 3. Finance & Billing Module (Phase 3)
The Finance module centralizes all revenue streams: OPD consultations, Lab tests, Pharmacy sales, and IPD room/procedure charges.

### A. Centralized Billing Dashboard
- [ ] **Finance Dashboard (`app/finance/page.tsx`)**: High-level metrics showing Daily/Monthly Revenue, Outstanding Payments, and Department-wise breakdown (OPD vs IPD vs Lab).
- [ ] **Bills Data-Table**: A comprehensive paginated table querying `billing_records`, filterable by `status` (Pending/Paid), `department`, and `date`.

### B. Automated Billing Hooks (Integration)
We need to wire the existing modules to automatically create `billing_records`:
- [ ] **OPD Registration**: Trigger a `$500` (configurable) consultation charge upon successful `OPD_REG`.
- [ ] **Lab Orders**: Upon assigning a `lab_order`, fetch the test price from `lab_test_inventory` and generate a billing record.
- [ ] **Pharmacy Sales**: Hook into `pharmacy_orders` completion to record net sales amount.
- [ ] **IPD Stay**: Calculate `cost_per_day` * `length_of_stay` from the `wards` table during the discharge workflow.

### C. Payment Processing
- [ ] **Payment Action (`actions/process-payment.ts`)**: Server action handling the transition of a bill from "Pending" to "Paid", capturing `payment_method` (Cash, UPI, Card).
- [ ] **Invoice PDF Generation**: Provide a "Print Invoice" button that formats a detailed bill (Consultation + Meds + Tests + Room) into a printable/PDF format using a library like `react-to-print` or server-side PDF generation.

---

## 4. UI/UX & Security (Phase 4)
- [ ] **Role-Based Access Control (RBAC)**: Ensure only users with `role === "admin"` or `role === "finance"` can view the Finance dashboard. Create an "ipd_manager" or "nurse" role for IPD.
- [ ] **System Audit Logs**: Log high-risk actions (`PROCESS_PAYMENT`, `DISCHARGE_PATIENT`, `WAIVE_BILL`) in the `system_audit_logs` table.
- [ ] **Responsive Design**: Ensure dashboards follow the existing premium dark theme (Tailwind CSS) with responsive charts (e.g., using `recharts` for financial stats).

---

## Execution Strategy & Next Steps
1. **Approval**: Review this plan. Let me know if you want to adjust any scope (e.g., adding Insurance claim management or specific payment gateways like Stripe/Razorpay).
2. **Implementation Sequence**:
   - First, we'll build the **UI Shell & Navigation** for `/ipd` and `/finance`.
   - Then, we'll implement the **IPD Admission & Bed Management** logic so tests patients can be admitted.
   - Next, we'll implement the **Finance Dashboard & Billing Hooks**, ensuring data flows into the billing records accurately.
   - Finally, we'll link them together through the **Discharge Workflow**.

Let me know if you want me to start with Phase 1 / Phase 2 (IPD Bed Management UI)!
