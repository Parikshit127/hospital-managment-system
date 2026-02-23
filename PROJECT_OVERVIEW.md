# HospitalOS: Comprehensive Project Overview

**Avani Enterprise HospitalOS** is a robust, production-grade Hospital Management System (HMS) built with **Next.js 15, TailwindCSS, and Prisma (PostgreSQL)**. 

The application is structured to handle everything from outpatient registrations (OPD) to complex, multi-day inpatient admissions (IPD), enterprise-grade financial billing, insurance claim management, and AI-assisted clinical triage.

---

## 1. System Roles (RBAC)
The system is divided into modular dashboards, accessible via a secure, role-based login:
*   **Receptionist:** Handles patient intake, OPD registration, and initial fee collection.
*   **Doctor / Physician:** Manages clinical diagnoses, EHR notes, lab/pharmacy orders, and discharge summaries.
*   **Lab Technician:** Processes pathology/radiology tests and uploads diagnostic results.
*   **Pharmacist:** Manages medicine inventory and dispenses prescriptions.
*   **IPD Manager / Nurse (New):** Manages ward occupancy, allocates beds, tracks patient vitals, and records daily nursing notes.
*   **Finance Admin (New):** Manages enterprise billing, advance deposits, final settlements, and insurance claims.
*   **System Admin:** Oversees all operations, users, and audit logs.

---

## 2. Core Modules & End-to-End Workflows

### Phase 1: Outpatient Department (OPD) Workflow
_The standard path for walk-in patients or scheduled visits._

1.  **Patient Registration (`/reception/register`)**
    *   Receptionist captures patient demographics (Aadhar Card, Phone, Gender, etc.) via the `OPD_REG` table.
    *   An appointment is booked for a specific doctor/department in the `appointments` table.
    *   *(Finance Hook)*: A Consultation Charge is instantly pushed to the `invoice_items` table under an open OPD `invoice`.
2.  **AI Triage (Optional)**
    *   Intake symptoms are processed via OpenAI. The AI generates a `triage_level` (Emergency, Urgent, Routine), recommended tests, and a `clinical_summary` for the doctor.

### Phase 2: Clinical Care (OPD & IPD)
_The doctor handles medical charting and ordering._

1.  **Doctor's Dashboard (`/doctor/dashboard`)**
    *   Doctor views the patient queue and opens the patient's Clinical EHR.
    *   **Charting:** Doctor inputs diagnosis and notes (`Clinical_EHR`, `medical_notes`).
    *   **Orders:** Doctor can assign tests to the Lab (`lab_orders`) and prescribe medications to the Pharmacy (`pharmacy_orders`).
    *   **Admission Request:** If the patient requires hospitalization, the doctor triggers an IPD Admission request.

### Phase 3: Diagnostic & Pharmacy Workflows
_Ancillary services fulfill the doctor's orders._

1.  **Laboratory (`/lab/technician`)**
    *   Tech sees pending `lab_orders`, conducts the test, and uploads the `result_value` or PDF URL.
    *   *(Finance Hook)*: Completion triggers a charge in `invoice_items`.
2.  **Pharmacy (`/pharmacy/billing`)**
    *   Pharmacist fulfills `pharmacy_orders` from stock batches (`pharmacy_batch_inventory`).
    *   *(Finance Hook)*: Dispensing medicines automatically adds to the patient's running bill.

### Phase 4: Inpatient Department (IPD) Workflow (Enterprise Update)
_Complex workflow for multi-day stays._

1.  **Bed Allocation:** The IPD manager assigns the patient to an available Bed within a Ward (`beds`, `wards`), updating the bed status to `Occupied`.
2.  **Daily Charting:** Nurses log `vital_signs` (BP, HR, SpO2) and `medical_notes` multiple times a day.
3.  **Provisional Billing (Run Rate):** As the days pass, the system automatically accrues Room Charges, Nursing Charges, and recurring Doctor Visits into the patient's Draft `invoices`.

### Phase 5: Finance & Insurance Engine (Enterprise Update)
_A unified, dynamic billing approach ensuring accurate revenue tracking._

1.  **Modular Invoicing (`invoices` & `invoice_items`)**
    *   Instead of scattered bills, every patient interaction (Consultation, Lab, Pharmacy, Room Stay) rolls up into a master Invoice.
2.  **Advance Deposits (`payments`)**
    *   Patients can pay an upfront deposit (e.g., $5,000 for a surgery). This is recorded as an `Advance` payment in the `payments` table and applied against the final bill.
3.  **Insurance & TPAs (`insurance_policies`, `insurance_claims`)**
    *   If the patient has corporate insurance, the Finance Admin submits a claim. The invoice tracks `claimed_amount` vs `approved_amount`.
4.  **Final Settlement (Razorpay Integration)**
    *   At discharge, the Final Bill is locked. The balance can be settled via Cash, UPI, or a Razorpay payment gateway.

### Phase 6: Discharge & Audit
_The patient leaves the facility._

1.  **Discharge Summary (`/discharge/admin`)**
    *   The system aggregates the Admission Notes, Lab Results, Pharmacy Orders, and Doctor's Final Notes into a structured JSON/HTML `discharge_summary`.
2.  **Bed Release:** The `bed` status transitions to `Cleaning`, then back to `Available`.
3.  **Audit Trail (`system_audit_logs`)**
    *   Every critical action (Admission, Discharge, Payment Reversals, Discount Waivers) is permanently recorded with the User ID, timestamp, and IP address for compliance.

---

## 3. Technology Stack & Design System
*   **Frontend:** React 19 / Next.js 15 App Router.
*   **Styling:** Tailwind CSS (`@tailwindcss/postcss`). The visual language (Teal & Slate) enforces a premium, Trustworthy enterprise aesthetic.
*   **Database ORM:** Prisma Client (`@prisma/client` v5+).
*   **Authentication & Storage:** Supabase.
*   **Security:** Passwords hashed via `bcryptjs`, JSON Web Tokens via `jose`.

## 4. Current State & Next Steps
We have successfully mapped out the **Enterprise Schema Upgrade**, shifting from a basic system to a scalable SaaS framework. 

**Immediate Tasks:**
1. Execute the database migration switching to PostgreSQL and applying the new `invoices`, `insurance`, and IPD status tables.
2. Build the visual **Bed Matrix Dashboard**.
3. Develop the **Finance Dashboard** with Razorpay integration and Advance Deposit capabilities.
