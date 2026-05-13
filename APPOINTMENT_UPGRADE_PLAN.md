# Appointment Module Upgrade Plan

## Current State

HospitalOS covers ~50% of enterprise-grade appointment features. Core booking, slots, walk-ins, reschedule, cancellation, WhatsApp notifications, queue tokens, and patient portal with Razorpay are all functional. The gaps below need to be closed to match production HIMS standards.

---

## P0 — Critical (Must Have)

### 1. Overbooking Support

**Problem:** Currently if all slots are booked, no more patients can be scheduled. Real hospitals routinely overbook by 10-20% because of no-shows.

**Requirements:**
- Add `max_overbooking` field to doctor/department settings (e.g., 2 extra per slot block)
- Allow booking beyond slot capacity up to the overbook limit
- Show overbooking count visually on the calendar (e.g., "12/10 booked — 2 overbooked")
- Admin-configurable per doctor: some doctors allow overbooking, some don't
- Overbooked appointments get a flag/badge in the queue so reception knows

**Schema changes:**
```prisma
// Add to User (doctor) or a new DoctorSettings model
max_overbooking_per_slot  Int @default(0)
```

**Files to modify:**
- `prisma/schema.prisma` — add overbooking config
- `app/actions/reception-actions.ts` → `bookAppointment()` — allow booking past slot capacity
- `app/reception/appointments/page.tsx` — show overbook indicators
- `app/admin/opd-settings/OPDSettingsContent.tsx` — add overbooking toggle per doctor
- `app/patient/appointments/actions.ts` → `bookAppointment()` — respect overbook limits in portal

---

### 2. Call Center Module

**Problem:** No dedicated call center role or screen. Enterprise hospitals have a centralized booking desk that handles phone-based appointments separately from reception.

**Requirements:**
- New role: `call_center` with its own dashboard
- Call center screen: patient search by phone/name → book appointment flow
- If patient not found, inline quick-registration (name + phone + gender only)
- Call log tracking: who called, when, outcome (booked/cancelled/enquiry)
- Prescription reminder: flag if the test requires a prescription upload later
- SMS/WhatsApp confirmation sent on booking
- Separate reporting: call center bookings vs walk-in vs portal bookings

**New files to create:**
- `app/call-center/page.tsx` — main dashboard
- `app/call-center/book/page.tsx` — booking flow
- `app/call-center/logs/page.tsx` — call history
- `app/actions/call-center-actions.ts` — server actions
- Add `CALL_CENTER` to role enum in schema

**Schema changes:**
```prisma
model CallLog {
  id             String   @id @default(uuid())
  organizationId String
  agent_id       String
  patient_phone  String
  patient_name   String?
  outcome        String   // BOOKED, CANCELLED, ENQUIRY, NO_ANSWER
  appointment_id String?
  notes          String?
  created_at     DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  agent        User         @relation(fields: [agent_id], references: [id])

  @@index([organizationId])
  @@index([agent_id])
  @@index([patient_phone])
}
```

---

### 3. Prescription Mandatory Gate (Pre Check-in)

**Problem:** Certain diagnostic tests (MRI, CT, etc.) require a doctor's prescription by regulation. The BRD requires a popup/block at check-in if prescription is not uploaded.

**Requirements:**
- Admin can configure which services/tests require mandatory prescription
- During booking: show a soft reminder "prescription required for this test"
- At check-in: hard block with popup — "Prescription not uploaded. Cannot proceed."
- Patient can upload prescription via portal/app before arriving
- Reception can upload prescription on behalf of patient at the desk
- Once uploaded, check-in proceeds normally

**Schema changes:**
```prisma
// Add to service/test master
model ServiceMaster {
  id                      String  @id @default(uuid())
  organizationId          String
  name                    String
  department              String?
  prescription_mandatory  Boolean @default(false)
  // ... other fields
}

model PrescriptionUpload {
  id              String   @id @default(uuid())
  organizationId  String
  patient_id      String
  appointment_id  String?
  file_url        String
  uploaded_by     String   // patient or staff user id
  uploaded_at     DateTime @default(now())
  verified        Boolean  @default(false)

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([patient_id])
  @@index([appointment_id])
}
```

**Files to modify:**
- `app/actions/reception-actions.ts` → `checkInPatient()` — add prescription check
- `app/reception/check-in/page.tsx` — show block popup + upload option
- `app/patient/appointments/book/page.tsx` — show reminder during booking
- New: upload component for prescription files

---

## P1 — Important (Should Have)

### 4. Follow-up vs New OPD Appointment Type

**Problem:** No distinction between a new OPD visit and a follow-up. This affects billing (follow-ups are often free/discounted) and reporting.

**Requirements:**
- Add `appointment_type` field: `NEW_OPD`, `FOLLOW_UP`, `EHC`
- Follow-up auto-links to the previous visit (parent appointment)
- Doctor can mark "schedule follow-up" from consultation screen with pre-filled date
- Follow-up appointments can have different/zero consultation fee
- Patient portal shows "Book Follow-up" option on past appointments
- Reports distinguish new vs follow-up counts

**Schema changes:**
```prisma
// Add to appointments model
appointment_type    String  @default("NEW_OPD") // NEW_OPD, FOLLOW_UP, EHC
parent_appointment  String? // links follow-up to original visit
follow_up_fee       Float?  // override fee for follow-ups (null = use doctor default)
```

**Files to modify:**
- `prisma/schema.prisma` — add fields
- `app/actions/reception-actions.ts` → `bookAppointment()` — accept type parameter
- `app/reception/appointments/page.tsx` — type selector in book modal
- `app/doctor/patient/[patientId]/page.tsx` — "Schedule Follow-up" button
- `app/patient/appointments/page.tsx` — "Book Follow-up" on past visits
- `app/admin/reports/page.tsx` — split stats by type

---

### 5. Configurable Mandatory Fields

**Problem:** The BRD requires per-field on/off configuration for registration during appointment booking (e.g., last name mandatory on/off, gender options order).

**Requirements:**
- Admin settings page to toggle which fields are mandatory during booking
- Fields: first name, last name, email, phone, gender, DOB, address, ID proof
- Configuration stored per organization
- Registration form dynamically renders required/optional based on config
- Gender dropdown order configurable (Male/Female/Transgender)

**Schema changes:**
```prisma
model RegistrationConfig {
  id              String  @id @default(uuid())
  organizationId  String  @unique
  fields          Json    // { "last_name": { mandatory: true }, "email": { mandatory: false }, ... }
  gender_order    String  @default("Male,Female,Transgender")

  organization Organization @relation(fields: [organizationId], references: [id])
}
```

**Files to modify:**
- `app/admin/opd-settings/OPDSettingsContent.tsx` — add field config UI
- `app/reception/register/page.tsx` — read config and enforce
- `app/call-center/book/page.tsx` — same enforcement
- `app/patient/appointments/book/page.tsx` — portal registration respects config

---

### 6. Doctor-wise Patient List Report

**Problem:** No exportable report showing all patients booked for a specific doctor on a given date/range.

**Requirements:**
- Filter by doctor + date range
- Shows: patient name, phone, appointment time, status (scheduled/checked-in/completed/no-show)
- Export to Excel/PDF
- Accessible from OPD Manager reports section
- Can be printed for doctors who prefer paper lists

**Files to modify:**
- `app/opd-manager/reports/page.tsx` — add doctor-wise list tab
- `app/actions/reception-actions.ts` — new query function
- Add Excel export utility (openpyxl or client-side xlsx generation)

---

## P2 — Nice to Have (Can Wait)

### 7. EHC (Executive Health Check) Package Slots

**Problem:** No health check package booking flow. EHC appointments span multiple departments/tests in one visit and need a different slot structure.

**Requirements:**
- Admin defines EHC packages (e.g., "Cardiac Screening" = ECG + Blood + Treadmill + Consultation)
- Package has its own slot pool (separate from regular OPD)
- Booking an EHC auto-creates sub-appointments for each included test
- EHC calendar view showing package utilization
- No overbooking for EHC (BRD specifically states this)
- Pricing at package level, not individual test level

**Schema changes:**
```prisma
model HealthCheckPackage {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  description     String?
  price           Float
  duration_mins   Int      @default(240)
  is_active       Boolean  @default(true)
  tests           Json     // array of service IDs included
  created_at      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  slots        EHCSlot[]

  @@index([organizationId])
}

model EHCSlot {
  id              String   @id @default(uuid())
  organizationId  String
  package_id      String
  date            DateTime
  max_bookings    Int      @default(5)
  current_count   Int      @default(0)
  is_available    Boolean  @default(true)

  organization Organization @relation(fields: [organizationId], references: [id])
  package      HealthCheckPackage @relation(fields: [package_id], references: [id])

  @@index([organizationId, date])
}
```

---

### 8. Free vs Paid Slot Differentiation

**Problem:** Current slot_type is `walkin/scheduled/blocked`. BRD requires `free/paid` distinction for consultation slots.

**Requirements:**
- Slot can be marked as free (no consultation charge) or paid
- Free slots useful for: follow-ups, charity OPD hours, camp days
- Admin configures which time blocks are free vs paid per doctor
- Patient portal shows free/paid indicator when selecting slot
- Billing skips consultation fee for free slots

**Schema changes:**
```prisma
// Add to AppointmentSlot model
is_free  Boolean @default(false)
```

**Files to modify:**
- `prisma/schema.prisma` — add field
- `app/actions/reception-actions.ts` → `createBulkSlots()` — accept free/paid flag
- `app/reception/appointments/page.tsx` — show free/paid badge on slots
- `app/patient/appointments/book/page.tsx` — display indicator + skip payment for free
- `app/patient/appointments/actions.ts` → `bookAppointment()` — skip invoice for free slots

---

### 9. PAV (Pay at Visit) Mode

**Problem:** Portal booking currently requires online Razorpay payment. BRD requires a "Pay at Visit" option where patient books online but pays at reception counter.

**Requirements:**
- During portal booking: radio choice — "Pay Now (Online)" or "Pay at Visit"
- PAV bookings get status `CONFIRMED_PAV` (not pending payment)
- SMS/WhatsApp to patient: "Please pay at the counter on arrival"
- Reception check-in screen shows PAV flag with outstanding amount
- Payment collected at check-in before token generation

**Schema changes:**
```prisma
// Add to appointments model
payment_mode  String @default("ONLINE") // ONLINE, PAV (pay at visit), FREE
payment_status String @default("PENDING") // PENDING, PAID, WAIVED
```

**Files to modify:**
- `prisma/schema.prisma` — add fields
- `app/patient/appointments/book/page.tsx` — add PAV radio option
- `app/patient/appointments/actions.ts` → `bookAppointment()` — handle PAV flow
- `app/actions/reception-actions.ts` → `checkInPatient()` — collect payment if PAV
- `app/reception/check-in/page.tsx` — show PAV badge + payment button

---

## Implementation Order

```
Sprint 1 (Week 1-2):  Overbooking + Follow-up Type + Free/Paid Slots
Sprint 2 (Week 2-3):  Call Center Module + PAV Mode
Sprint 3 (Week 3-4):  Prescription Gate + Configurable Fields
Sprint 4 (Week 4-5):  Doctor-wise Report + EHC Packages
```

Each feature should be developed → tested → merged independently. Start with schema migrations first, then server actions, then UI.

---

## Files Summary (All Touches)

| File | Features Affected |
|------|-------------------|
| `prisma/schema.prisma` | ALL |
| `app/actions/reception-actions.ts` | 1, 3, 4, 6, 9 |
| `app/reception/appointments/page.tsx` | 1, 4, 8 |
| `app/reception/check-in/page.tsx` | 3, 9 |
| `app/patient/appointments/book/page.tsx` | 3, 4, 8, 9 |
| `app/patient/appointments/actions.ts` | 1, 4, 8, 9 |
| `app/admin/opd-settings/OPDSettingsContent.tsx` | 1, 5 |
| `app/opd-manager/reports/page.tsx` | 6 |
| `app/doctor/patient/[patientId]/page.tsx` | 4 |
| `app/call-center/*` (NEW) | 2 |
