# 🏥 HospitalOS — Complete Bug Fix & Improvement Plan
### Pari Kaushal | Avani Enterprise | March 2026
> This document is prepared based on HIMP.docx + HOS.pdf blueprint.  
> Every bug is clearly described + exact fix direction is provided.  
> Solve everything at once — follow sequentially.

---

## 🔴 PRIORITY LEGEND

| Tag | Meaning |
|-----|---------|
| `[P0 - CRITICAL]` | Production blocker — fix this first |
| `[P1 - HIGH]` | Core workflow is broken |
| `[P2 - MEDIUM]` | UX is bad but system is functional |
| `[P3 - LOW]` | Polish / Enhancement |

---

## ✅ SECTION 1: PATIENT PORTAL BUGS

### BUG-01 — Appointment Confirmation Email Not Being Sent `[P0 - CRITICAL]`

**Problem:**  
Patient books an appointment but receives no confirmation email. As per the blueprint, this is a mandatory feature.

**Expected Behavior:**  
As soon as appointment is booked, patient should receive an email containing:
- Appointment date, time, doctor name
- Hospital address
- Appointment ID / reference number
- Cancel/reschedule link

**Fix Direction:**
```
1. Check email service — whether Nodemailer / Resend is configured or not
2. Add email trigger in appointment creation API route (`/api/appointments`)
3. Create email template: appointment_confirmation.html
4. Check environment variables: whether SMTP credentials are set or not
5. Test: book an appointment → check inbox
```

---

### BUG-02 — Gender Field Not Displaying `[P1 - HIGH]`

**Problem:**  
Gender is selected during patient registration (e.g., Female for Anshu Hooda) but it does not show on profile/dashboard.

**Fix Direction:**
```
1. Check patient registration form — whether gender field is being saved properly in DB
2. Check Prisma schema: whether `gender` field exists in Patient model
3. Check patient profile display component — whether gender field is being rendered
4. Check API response: whether gender is coming in GET /api/patients/[id] response
5. Fix: add gender field display on the profile page
```

---

### BUG-03 — Patient Password Change Page Not Working `[P0 - CRITICAL]`

**Problem:**  
Hospital generates a card number for the patient + sends a login email with a "Set Password" option — but that page does not exist or is broken.

**Fix Direction:**
```
1. Check email template — what is the link for setting password?
2. Create the route for that link: /patient/set-password?token=xxx
3. Add token generation logic (secure, with expiry — 24 hours)
4. Create password set form with:
   - New Password field
   - Confirm Password field
   - Submit button
5. On submit: save hashed password in DB
6. Success redirect: /patient/login
7. Test: send email → click link → set password → login
```

---

### BUG-04 — Appointment Time Changes Automatically `[P0 - CRITICAL]`

**Problem:**  
The time selected while booking an appointment changes automatically.

**Fix Direction:**
```
1. Check appointment form — what is the type of time input? (text/time/datetime-local)
2. Check for timezone bug:
   - Server is saving in UTC
   - Frontend is displaying in IST → conversion mismatch
3. Fix: handle timezone clearly when saving to DB
   - Suggestion: store all times in UTC
   - Convert to Asia/Kolkata timezone when displaying
4. Add time validation in appointment creation API
5. Test: book a specific time → refresh → same time should be shown
```

---

### BUG-05 — Duplicates Appearing After Appointment Reschedule `[P1 - HIGH]`

**Problem:**  
After rescheduling an appointment, duplicate entries of the same appointment are showing.

**Fix Direction:**
```
1. Check reschedule API route
2. Bug: reschedule logic is creating a new appointment WITHOUT deleting the old one
3. Fix:
   - Old appointment should be given CANCEL/RESCHEDULED status
   - Create new appointment with the new time
   - Add original_appointment_id FK for rescheduled appointments
4. In UI: show only one active appointment, rescheduled history in a separate section
5. Improvement: show "Rescheduled from: [date]" label for rescheduled appointments
```

---

### BUG-06 — "Scheduled" Status Still Showing After Time Has Passed `[P2 - MEDIUM]`

**Problem:**  
Appointment time has passed (e.g., Pediatric appointments) but status still shows "Scheduled".

**Fix Direction:**
```
1. Add appointment status auto-update logic
2. Options:
   Option A (Simple): Check in frontend — if appointmentTime < now() then show "Expired"
   Option B (Backend): Cron job — mark past appointments as "Missed/Expired" every hour
3. Define status values clearly:
   - SCHEDULED
   - COMPLETED (marked by doctor)
   - MISSED (time passed, patient did not show) ← suggestion: "Not Visited"
   - CANCELLED
   - RESCHEDULED
4. From suggestion: "Not Visited" label is clearer — implement it
```

---

## ✅ SECTION 2: DOCTOR DASHBOARD BUGS

### BUG-07 — Patients from Wrong Department Showing to Doctor `[P0 - CRITICAL]`

**Problem:**  
- General patients are showing in Cardiology department
- Cardiology patients are appearing with Neurologist
- Any department's patient is visible to any doctor — there is no filtering at all

**Fix Direction:**
```
1. Check Doctor's "My Patients" query
2. Current query (broken):
   SELECT * FROM appointments WHERE doctorId = currentDoctorId
   -- This shows all appointments regardless of department

3. Fix — proper department filtering:
   SELECT appointments.* 
   FROM appointments
   JOIN doctors ON appointments.doctorId = doctors.id
   WHERE appointments.doctorId = currentDoctorId
   AND doctors.departmentId = currentDoctor.departmentId

4. Ensure in appointment creation:
   - Department ID is saved with the appointment
   - Doctor assignment is limited to doctors of the same department only

5. Test cases:
   - Cardiology doctor → should only see Cardiology patients
   - Neurology doctor → should only see Neurology patients
```

---

### BUG-08 — Side Space / Margin Issue in Doctor Dashboard `[P2 - MEDIUM]`

**Problem:**  
Extra/weird space is appearing on the side of all doctor dashboards — specifically clearly visible on Doctor 2 (Doc2) dashboard.

**Fix Direction:**
```
1. Check layout component (DoctorLayout / Sidebar component)
2. CSS issue likely:
   - Sidebar width is fixed but main content margin is not adjusting
   - Layout shift when sidebar open/close state changes
3. Fix:
   CSS: set main content area `ml-[sidebar-width]` dynamically
   Tailwind example:
   <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
4. Apply this fix to all dashboards — not just Doctor, but Admin, Pharmacy, IPD too
5. Test: open all role dashboards, check that layout is correct
```

---

### BUG-09 — Pharmacy Order — Medicine Name & Increment Button Issue `[P1 - HIGH]`

**Problem:**  
When a doctor writes a pharmacy order, the medicine name does not show properly and the quantity increment button is not working.

**Fix Direction:**
```
1. Check pharmacy order form component
2. Medicine name display:
   - Check whether medicine data is being fetched from API
   - What label is showing in medicine dropdown (id? name?)
   - Fix: display `medicine.generic_name` or `medicine.brand_name`
3. Increment button:
   - Check onClick handler
   - Whether state is being updated or not
   - Fix: 
     const [qty, setQty] = useState(1)
     <button onClick={() => setQty(prev => prev + 1)}>+</button>
4. Min quantity = 1, Max = available stock
```

---

### BUG-10 — Lab Result Remarks Not Showing Properly `[P1 - HIGH]`

**Problem:**  
The remarks added by the lab technician with results are not displaying properly in the doctor's view.

**Fix Direction:**
```
1. Check lab result display component (doctor side)
2. Check API response: whether `remarks` field is coming in GET /api/lab-results/[id]
3. Check DB Schema: whether `remarks` field exists in LabResult model
4. Fix — add in display component:
   {result.remarks && (
     <div className="remarks-section">
       <label>Technician Remarks:</label>
       <p>{result.remarks}</p>
     </div>
   )}
5. Test: add technician remarks → check in doctor view
```

---

### BUG-11 — Doc8 Login Error `[P1 - HIGH]`

**Problem:**  
An error is appearing when trying to login for Doc8.

**Fix Direction:**
```
1. Check Doc8 user in DB — whether properly created or not
2. Whether user's role is correctly set or not
3. Whether password hash is correct or not
4. Check auth middleware — whether there is any issue related to a specific doctor ID
5. Check error log — what is the specific error message
6. If account is corrupted: delete it and recreate
```

---

## ✅ SECTION 3: RECEPTION USER BUGS

### BUG-12 — Appointment Gets Created Immediately on Registration `[P1 - HIGH]`

**Problem:**  
When reception registers a patient, an appointment is automatically created — this is not the intended behavior.

**Fix Direction:**
```
1. Check patient registration flow
2. Registration and appointment — these should be two separate actions
3. Fix: separate the appointment creation logic from the registration form
4. Flow should be:
   Step 1: Register patient (basic details, generate UHID)
   Step 2: Book appointment separately (select doctor, date, time)
5. Keep "Book Appointment" as an optional button on the registration page
```

---

### BUG-13 — Patient Registration Time Showing 5:30 AM in Admin View `[P0 - CRITICAL]`

**Problem:**  
When registering a patient from reception, the registration time shows as 5:30 AM in the Admin dashboard (wrong time).

**Fix Direction:**
```
1. Timezone bug — same root cause as BUG-04
2. Server is saving in UTC, display is not converting to IST
3. Fix:
   - Backend: store in UTC (created_at: new Date())
   - Frontend: convert to IST when displaying:
     new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
4. Apply this fix to all timestamps across the entire application
```

---

## ✅ SECTION 4: ADMIN USER BUGS

### BUG-14 — Admin Being Forwarded to Wrong Page `[P1 - HIGH]`

**Problem:**  
When admin clicks on a feature, they get redirected to a wrong page/UI.

**Fix Direction:**
```
1. Check admin navigation routes
2. Specific: make a list of which button/link is causing the wrong redirect
3. Check router configuration:
   - Next.js: check app/admin/ routes
   - Middleware: check route protection for admin role
4. Fix: verify the href/route of every admin link
5. Test: click every admin menu item and verify correct page opens
```

---

### BUG-15 — Invoice Registry "View" Button Redirecting to Pharmacy `[P1 - HIGH]`

**Problem:**  
When admin clicks "View" in invoice registry, the pharmacy page opens instead of the invoice detail page.

**Fix Direction:**
```
1. Check the href/onClick of the "View" button in invoice table
2. Current (broken): href="/pharmacy/..."
3. Fix: href="/admin/invoices/[invoiceId]"
4. Create invoice detail page if it does not exist:
   - Invoice number
   - Patient details
   - Itemized charges
   - Payment status
   - Print button
```

---

### BUG-16 — HR Module Not Implemented `[P2 - MEDIUM]`

**Problem:**  
There is an HR link in admin panel but the module has not been implemented.

**What to Build (as per HOS.pdf Blueprint):**
```
Add these features in HR Module:

1. Staff Master
   - Employee ID, name, designation, department
   - Contact info, joining date, contract type
   - Doctor license number + expiry date

2. Attendance Tracking
   - Manual entry (daily in/out time)
   - Monthly attendance calendar view

3. Leave Management
   - Leave types: CL, SL, EL
   - Apply leave form
   - Manager approval workflow
   - Leave balance display

4. Basic Payroll View
   - Salary details per staff member
   - Month-wise payment record

Pages to create:
/admin/hr — Staff list
/admin/hr/add — Add new staff
/admin/hr/[id] — Staff profile + attendance + leaves
/admin/hr/leaves — Leave approval queue
```

---

## ✅ SECTION 5: PHARMACY USER BUGS

### BUG-17 — Out of Stock Medicines Not Showing in Orders `[P1 - HIGH]`

**Problem:**  
The pharmacist has no way of knowing which medicine is out of stock in the orders view.

**Fix Direction:**
```
1. Add stock status check in pharmacy orders list
2. When a doctor's order arrives, check the medicine's stock in pharmacy
3. Add in display:
   - Green badge: "In Stock (qty available)"
   - Red badge: "OUT OF STOCK"
   - Yellow badge: "Low Stock (qty)"
4. Logic:
   const stockStatus = medicine.currentStock <= 0 ? 'out' 
     : medicine.currentStock <= medicine.minThreshold ? 'low' : 'in'
5. Highlight out of stock medicines in orders with red row background
```

---

### BUG-18 — All Doctor-Ordered Medicines Showing as Out of Stock `[P0 - CRITICAL]`

**Problem:**  
Doctor has ordered medicines but all medicines are showing "Out of Stock" in pharmacy — even those that have available stock.

**Fix Direction:**
```
1. There is a bug in the stock check query
2. Check pharmacy inventory table:
   - Whether medicine_id is correctly mapped or not
   - Whether stock quantity field (currentStock / quantity) has the correct value
3. Possible bug: mismatch between medicine master ID and inventory record
4. Fix:
   SELECT pharmacy_inventory.quantity 
   FROM pharmacy_inventory 
   WHERE pharmacy_inventory.medicineId = order.medicineId
   AND pharmacy_inventory.branchId = currentBranchId  ← check branch filter
5. Test: manually add inventory → stock should show in order
```

---

### BUG-19 — Pharmacy Inventory Module Not Implemented `[P2 - MEDIUM]`

**Problem:**  
There is no inventory management in pharmacy — adding/removing stock is not possible.

**What to Build:**
```
Inventory Module:
1. Medicine Master List
   - Generic name, brand name, HSN code, drug schedule
   - Supplier details
   
2. Stock Management
   - Current stock quantity per medicine
   - Batch tracking (batch number, expiry date, purchase date)
   - FIFO dispensing logic (oldest batch dispensed first)

3. Alerts
   - Low stock alert (stock < min_threshold)
   - Expiry alert (30/60/90 days in advance)

4. GRN (Goods Receipt Note)
   - Form for receiving stock
   - Batch verification
   - Auto stock update on GRN save

5. Pages:
   /pharmacy/inventory — Stock list with search
   /pharmacy/inventory/add — Add new medicine/stock
   /pharmacy/inventory/grn — Receive new stock
   /pharmacy/inventory/alerts — Low stock + expiry alerts
```

---

## ✅ SECTION 6: IPD USER BUGS

### BUG-20 — Bed Matrix — Cleaning & Maintenance Status Not Showing Properly `[P1 - HIGH]`

**Problem:**  
Beds with "Cleaning" and "Maintenance" status are not showing properly in the bed matrix and are sometimes not clickable.

**Fix Direction:**
```
1. Check bed matrix component
2. Define bed status values clearly:
   - AVAILABLE (green)
   - OCCUPIED (red)
   - CLEANING (yellow)
   - MAINTENANCE (orange)
   - RESERVED (blue)

3. Add separate color + icon for each status
4. Fix clickability:
   - AVAILABLE: click → admit patient
   - OCCUPIED: click → patient details
   - CLEANING: click → mark as Available
   - MAINTENANCE: click → maintenance details / mark available

5. CSS fix: there may be a z-index issue — set clickable area properly
6. Test: create a bed with each status and verify click behavior
```

---

### BUG-21 — IPD User Cannot Assign/Change Doctor `[P2 - MEDIUM]`

**Problem:**  
IPD manager cannot change the assigned doctor of an admitted patient.

**Fix Direction:**
```
1. Add "Change Doctor" feature in patient admission detail page
2. UI:
   Current Doctor: Dr. Sharma [Change] button
   → Click → dropdown: list of active doctors from the same department
   → Select new doctor → Confirm → Save

3. API:
   PATCH /api/ipd/admissions/[id]
   body: { assignedDoctorId: newDoctorId }

4. Add audit trail:
   "Doctor changed from Dr. Sharma to Dr. Gupta by [IPD Manager] at [timestamp]"

5. Notification: send notification to new doctor that a patient has been assigned
```

---

## ✅ SECTION 7: HOSPITAL OVERVIEW PAGE IMPROVEMENTS

### IMP-01 — Add "About Us" Description `[P3 - LOW]`

**What to Add:**
```
Add a short description section on the overview page:

Location: Hospital profile page (public-facing)
Content:
- Hospital's founding story (1-2 sentences)
- Mission statement
- Key specialties highlight
- Number of beds, doctors

UI:
<section className="about-us">
  <h2>About {hospital.name}</h2>
  <p>{hospital.description}</p>  ← fetch from DB
</section>

DB: add `description` TEXT column in hospitals table
In admin panel: add a textarea to edit description on the Overview tab
```

---

### IMP-02 — Add "Meet Our Specialists" Section `[P3 - LOW]`

**What to Add:**
```
Add a doctors showcase section on hospital overview/public page:

UI Design:
┌─────────────────────────────────────┐
│      Meet Our Specialists           │
│                                     │
│  [Photo]  [Photo]  [Photo]  [Photo] │
│  Dr. Name Dr. Name Dr. Name Dr. Name│
│  Cardio   Ortho    Gynae   Neuro    │
└─────────────────────────────────────┘

Implementation:
1. Add `isShowcased` boolean field in Doctor model
2. In admin panel: toggle on Doctor profile — "Show on public page"
3. On public overview page: fetch max 4-6 featured doctors
4. API: GET /api/public/featured-doctors
```

---

### IMP-03 — Add Direct Google Maps Link in Geo-Location `[P3 - LOW]`

**What to Add:**
```
Current: Latitude and Longitude fields exist (currently empty)
Improvement: Add a direct Google Maps link

Options:
Option A: Static link from coordinates
  const mapsUrl = `https://maps.google.com/?q=${hospital.latitude},${hospital.longitude}`
  <a href={mapsUrl} target="_blank">Open in Google Maps</a>

Option B: Embedded map (better UX)
  <iframe
    src={`https://maps.google.com/maps?q=${lat},${lng}&output=embed`}
    width="100%" height="300"
  />

Option C: "Add Maps Link" field in admin
  Admin adds directly: https://maps.app.goo.gl/xxxxx
  "Get Directions" button on public page opens that link

Recommendation: Use a combination of Option A + C
```

---

## ✅ SECTION 8: PATIENT PORTAL DEPLOYMENT

### IMP-04 — Deploy the Patient Portal `[P0 - CRITICAL]`

**Status:** Patient portal exists but is not deployed.

**Steps to Deploy:**
```
1. Check patient portal routes:
   /patient/login
   /patient/dashboard
   /patient/appointments
   /patient/reports
   /patient/bills
   /patient/set-password

2. Separate the authentication:
   - Hospital staff auth: Supabase (existing)
   - Patient auth: separate patient_sessions table or same Supabase with role='patient'

3. Update middleware:
   - /patient/* routes should only be accessible by patient role
   - Staff routes should not be accessible by patients

4. Patient dashboard features (minimum for launch):
   ✅ View upcoming appointments
   ✅ View past appointments
   ✅ Download lab reports
   ✅ View invoices + payment status
   ✅ Change password
   ✅ Profile view

5. Deploy:
   - Deploy on the same Vercel project
   - Subdomain option: patient.hospitaldomain.com
   - Or serve from same domain on /patient path
```

---

## ✅ SECTION 9: GLOBAL / CROSS-CUTTING FIXES

### BUG-22 — Side Navigation Space Issue — ALL Dashboards `[P2 - MEDIUM]`

**Problem:** Extra space is appearing near the sidebar on all dashboards (Doctor, Admin, Pharmacy, IPD).

**Fix Direction:**
```
1. Find the root layout component (app/layout.tsx or components/Layout.tsx)
2. Check the flex/grid layout of sidebar + main content
3. Common fix:

/* globals.css or layout component */
.layout-wrapper {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 256px; /* 64 or 256 based on open/closed */
  flex-shrink: 0;
}
.main-content {
  flex: 1;
  overflow: hidden; /* important */
  min-width: 0; /* flex child overflow fix */
}

4. Tailwind version:
<div className="flex min-h-screen">
  <aside className="w-64 flex-shrink-0">{/* sidebar */}</aside>
  <main className="flex-1 min-w-0 overflow-hidden">{/* content */}</main>
</div>

5. Fix this once — all dashboards will automatically be fixed
```

---

### BUG-23 — Session Timeout Middleware Missing `[P0 - CRITICAL]`

**Problem:**  
NABH + HIPAA requirement is auto-logout after 15 minutes of inactivity. This is currently not implemented.

**Fix Direction:**
```
// middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const lastActivity = request.cookies.get('last_activity')?.value
  const now = Date.now()
  const TIMEOUT = 15 * 60 * 1000 // 15 minutes

  if (lastActivity && now - parseInt(lastActivity) > TIMEOUT) {
    // Clear session and redirect to login
    const response = NextResponse.redirect(new URL('/login?reason=timeout', request.url))
    response.cookies.delete('session')
    response.cookies.delete('last_activity')
    return response
  }

  // Update last activity
  const response = NextResponse.next()
  response.cookies.set('last_activity', now.toString(), { httpOnly: true })
  return response
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/pharmacy/:path*', '/ipd/:path*']
}

// Also add on frontend: reset timer on any user interaction
```

---

### BUG-24 — Supabase Row-Level Security (RLS) Not Enabled `[P0 - CRITICAL]`

**Problem:**  
Currently any authenticated user can query data from any table — this is a major security hole.

**Fix Direction:**
```sql
-- Enable RLS on all critical tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_ehr ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_orders ENABLE ROW LEVEL SECURITY;

-- Example policy: Doctor can only see their own patients
CREATE POLICY "doctors_own_patients" ON appointments
  FOR SELECT USING (
    auth.uid() = doctor_user_id
    OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Reception can see all appointments but not EHR
CREATE POLICY "reception_appointments" ON appointments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'receptionist')
  );

-- Add similar policies for all tables
-- Apply in Supabase Dashboard > Authentication > Policies
```

---

### BUG-25 — Audit Logs Are Incomplete `[P1 - HIGH]`

**Problem:**  
All mutations must be logged for NABH compliance. Currently partial implementation exists.

**Fix Direction:**
```typescript
// lib/audit.ts - Universal audit logger

export async function auditLog({
  userId,
  action,         // 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT'
  module,         // 'PATIENT' | 'APPOINTMENT' | 'EHR' | 'LAB' | 'PHARMACY' | 'BILLING'
  resourceId,     // ID of affected record
  resourceType,   // Table name
  oldValues,      // Before state (for updates)
  newValues,      // After state
  ipAddress,
  userAgent,
}) {
  await prisma.system_audit_logs.create({
    data: {
      userId, action, module, resourceId, resourceType,
      oldValues: JSON.stringify(oldValues),
      newValues: JSON.stringify(newValues),
      ipAddress, userAgent,
      timestamp: new Date()
    }
  })
}

// Use in every API route:
// After any CREATE/UPDATE/DELETE → call auditLog()
// Minimum required actions to log:
// - Patient registration/update
// - Appointment create/reschedule/cancel
// - EHR note create/edit
// - Lab result entry
// - Medicine dispense
// - Invoice generate/modify
// - User login/logout
// - Any billing action
```

---

## ✅ SECTION 10: QUICK WINS — 30-MINUTE FIXES

These fixes are very simple — do them first:

| # | Fix | Time | Action |
|---|-----|------|--------|
| Q1 | Fill in Established Year field (Admin panel) | 2 min | Data entry |
| Q2 | Add Website URL | 2 min | Data entry |
| Q3 | Add Specialties (General Medicine, Surgery, etc.) | 5 min | Data entry |
| Q4 | Add Logo URL in Configuration > Branding | 5 min | Data entry |
| Q5 | Enable WhatsApp Notifications toggle | 2 min | Toggle on |
| Q6 | Add Footer text: "© 2026 Oscar Hospitals" | 2 min | Data entry |
| Q7 | Fill Latitude/Longitude (copy from Google Maps) | 5 min | Data entry |
| Q8 | Configure subscription plan in Plans page | 10 min | Admin setup |

---

## ✅ IMPLEMENTATION ORDER — What to Fix First

```
WEEK 1 — Critical Bugs (P0):
□ BUG-23: Session timeout middleware
□ BUG-24: Supabase RLS enable
□ BUG-13: Timezone fix (5:30 AM issue)
□ BUG-04: Appointment time change issue
□ BUG-03: Patient password page
□ IMP-04: Patient portal deploy
□ Q1-Q8:  Quick wins (data entry)

WEEK 2 — Core Workflow Bugs (P1):
□ BUG-07: Doctor-patient department mismatch (MOST IMPORTANT)
□ BUG-01: Appointment confirmation email
□ BUG-05: Duplicate appointments on reschedule
□ BUG-17: Out of stock not showing in pharmacy
□ BUG-18: All meds showing out of stock
□ BUG-15: Invoice view → pharmacy redirect fix
□ BUG-20: Bed matrix cleaning/maintenance fix

WEEK 3 — Medium Priority:
□ BUG-22: Sidebar space fix (all dashboards)
□ BUG-08: Doctor dashboard margin
□ BUG-09: Pharmacy order medicine name + increment
□ BUG-10: Lab results remarks display
□ BUG-06: Past appointment status auto-update
□ BUG-11: Doc8 login error
□ BUG-25: Complete audit logs

WEEK 4 — Feature Additions:
□ BUG-16: Build HR Module
□ BUG-19: Build Pharmacy Inventory module
□ BUG-21: IPD doctor change feature
□ BUG-02: Gender display fix
□ BUG-12: Registration-appointment separation
□ BUG-14: Admin wrong redirect fix

WEEK 5 — Improvements:
□ IMP-01: About Us section
□ IMP-02: Meet Our Specialists section
□ IMP-03: Google Maps link
```

---

## ✅ TESTING CHECKLIST — Verify After Each Fix

```
After each bug fix, test these scenarios:

Patient Flow:
□ Register patient → UHID generated?
□ Book appointment → confirmation email received?
□ Gender selected → showing on profile?
□ Set password link working?
□ Time remained the same in appointment?
□ Reschedule → no duplicate appeared?

Doctor Flow:
□ Login → only patients from own department showing?
□ Lab results → remarks showing?
□ Pharmacy order → medicine name + qty increment working?

Pharmacy Flow:
□ Order arrived → stock status showing (in/out/low)?
□ Can add inventory?

Admin Flow:
□ Invoice View → invoice page opened (not pharmacy)?
□ Registration time is correct?
□ Navigation links going to correct page?

IPD Flow:
□ Bed matrix → all statuses clearly visible?
□ Cleaning/Maintenance beds are clickable?
□ Can change doctor?

Security:
□ 15 min inactive → auto-logout happened?
□ Different role → other role's data not accessible?
```

---

*Document Version: 1.0 | Prepared by: Claude for Pari Kaushal | March 2026*  
*Based on: HIMP.docx (Bug Report) + HOS.pdf (Production Blueprint)*  
*Total Bugs Documented: 25 | Total Improvements: 4 | Quick Wins: 8*
