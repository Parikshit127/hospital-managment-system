# Hospital OS - System Context & Architecture for AI Agents

**Target AI Agent:** Please read this entire document to fully understand the architectural patterns, tech stack, and scalability goals of "Hospital OS" before proposing changes or planning new features.

## 🛠 Tech Stack
- **Framework**: Next.js 15 (App Router, React Server Components, Server Actions)
- **Styling**: Tailwind CSS, Lucide React (for iconography)
- **Database ORM**: Prisma
- **Database**: SQLite (Local Dev) / Ready for PostgreSQL (Production)
- **Language**: TypeScript (Strict typing)
- **Security & Comm**: bcryptjs (passwords), nodemailer (SMTP emails), JWT / Cookie-based sessions.

## 📂 Project Structure Overview (App Router)
Hospital OS is rigidly structured by **Role-Based Access Modules**. Most backend logic is abstracted away from API routes into standalone Next.js Server Actions.

```text
hospital-os-main/
├── app/
│   ├── actions/                  # 🧠 CORE BACKEND: Next.js Server Actions
│   │   ├── admin-actions.ts      # Staff CRUD, Audit logs
│   │   ├── doctor-actions.ts     # Clinical notes, lab orders, admissions, doctor queue
│   │   ├── triage-actions.ts     # AI-powered symptom triage & priority mapping
│   │   ├── register-patient.ts   # Core OPD manual registration & doctor auto-assignment
│   │   ├── ipd-actions.ts        # Ward/Bed assignment & IPD management
│   │   ├── pharmacy-actions.ts   # Prescriptions, inventory, drug dispensing
│   │   ├── lab-actions.ts        # Pathology lab queues, results entry
│   │   └── finance-actions.ts    # Centralized billing, invoices, payments
│   │
│   ├── admin/                    # Admin Dashboard (Staff management, System Audit)
│   ├── doctor/                   # Doctor Panel (Queue, EHR, Orders, Soap Notes)
│   ├── patient/                  # Public Patient Portal (Session protected, dashboard)
│   ├── pharmacy/                 # Pharmacist Dashboard (Orders, Inventory)
│   ├── reception/                # Front Desk (Walk-ins, AI Triage Kiosk)
│   ├── lab/                      # Pathology/Lab Technician Dashboard
│   ├── ipd/                      # IPD Manager Dashboard (Bed Matrix, Ward allocations)
│   ├── finance/                  # Finance & Billing Dashboard
│   ├── api/                      # Legacy/Third-party REST Endpoints (Razorpay webhooks)
│   ├── components/               # Global / reusable UI components (AppShell, Sidebar)
│   └── globals.css               # Main Tailwind imports
│
├── prisma/
│   ├── schema.prisma             # Master Database Schema
│   └── dev.db                    # Local SQLite Database
│
└── middleware.ts                 # Global edge router. Enforces Role-Based routing security.
```

## 🗄️ Database Schema Summary (`prisma/schema.prisma`)
The system is heavily relational and revolves around these interwoven modules:
1. **Users (`User`)**: Unifies all staff roles (`admin`, `doctor`, `receptionist`, `lab_technician`, `pharmacist`, `finance`, `ipd_manager`). Tracks sub-specialties.
2. **Registration & Appointments (`OPD_REG`, `appointments`)**: Tracks patient profiles and their queue status across departments.
3. **Clinical / EHR (`Clinical_EHR`, `triage_results`)**: AI triage summaries, vitals, and Doctor doctor diagnosis notes.
4. **IPD & Wards (`ipd_wards`, `ipd_beds`, `admissions`)**: Physical hospital spatial mapping and active patient admissions.
5. **Laboratory (`lab_orders`, `lab_test_inventory`)**: Pathology test queues and pricing.
6. **Pharmacy (`pharmacy_medicine_master`, `pharmacy_batch_inventory`, `pharmacy_orders`)**: Drug tracking, batch expiry, and patient prescription fulfillment queues.
7. **Billing (`invoices`, `insurance_policies`)**: Real-time aggregation of lab tests, pharmacy orders, and room charges into a master ledger.

## 🚀 Key Workflows & Architectural Rules
*Use these guidelines when generating future features for this system.*

1. **AI Auto-Routing**: We use an AI Engine (OpenAI + Fallback rules) in `triage-actions.ts` to assess walk-in symptoms. The AI determines a `Triage Level` (Emergency, Urgent, Normal) and a `Department`. The system then **auto-assigns** the patient to an active `User` (Doctor) matching that specialty.
2. **Server Actions First**: Do NOT build `/api/` endpoints unless integrating a third-party webhook (like Razorpay) or returning raw files (PDFs). All DB mutations should be built as functions in `app/actions/` and called directly by React Client Components.
3. **Cross-Module Communication**: The hospital operations are interconnected via DB statuses. 
   - *Example:* Doctor clicks "Order Blood Test" -> Creates `lab_order` -> The `/lab` dashboard dynamically updates -> Lab Tech submits result -> Result flows back to `/doctor/dashboard` -> Cost pushes to `/finance`.
4. **Auditing**: All clinical and financial state mutations must log an entry via `prisma.system_audit_logs.create()` for compliance.
5. **Modern Aesthetics**: The UI utilizes glassmorphism, gradient buttons, absolute positioning for ambient background glows, and highly polished, premium-feeling Tailwind token combinations. Do not use generic, unstyled HTML tables.
