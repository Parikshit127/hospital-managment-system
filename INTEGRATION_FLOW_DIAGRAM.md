# Zealthix Integration - Visual Flow Diagrams

## 📊 Complete Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOSPITAL OS ↔ ZEALTHIX                        │
│                   Real-Time API Integration                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐           ┌─────────────────┐           ┌──────────────────┐
│                 │           │                 │           │                  │
│  HOSPITAL OS    │◄─────────►│    ZEALTHIX     │◄─────────►│   INSURANCE      │
│   (Your App)    │   APIs    │   (TPA System)  │           │   COMPANY        │
│                 │           │                 │           │                  │
└─────────────────┘           └─────────────────┘           └──────────────────┘
        │                              │                             │
        │                              │                             │
   [Database]                    [Their System]                [Insurance DB]
```

---

## 🔄 Typical Claim Processing Flow

### Scenario: Patient Admitted for Surgery

```
DAY 1 - ADMISSION
═══════════════════════════════════════════════════════════════════

Hospital Staff                   Hospital OS                    Zealthix
─────────────────                ──────────                    ────────
      │                              │                              │
      │──Register Patient───────────►│                              │
      │                              │                              │
      │──Create Admission───────────►│                              │
      │                              │                              │
      │                              │◄────1. Find Patient─────────│
      │                              │   POST /patient/find         │
      │                              │   (Search by mobile)         │
      │                              │                              │
      │                              │──────Patient Details────────►│
      │                              │   {name, id, phone...}       │
      │                              │                              │
      │                              │◄────2. Get Visit────────────│
      │                              │   POST /patient/visit        │
      │                              │                              │
      │                              │──────Visit Details──────────►│
      │                              │   {treatment, billing...}    │
      │                              │                              │
      │                              │                        [Submit Pre-auth]
      │                              │                              │

DAY 2 - PRE-AUTH APPROVED
═══════════════════════════════════════════════════════════════════

      │                              │                              │
      │                              │◄────3. Update Status────────│
      │                              │   POST /claim/update         │
      │                              │   {status: "Approved",       │
      │                              │    amount: 50000}            │
      │                              │                              │
      │                              │──────Success Response───────►│
      │                              │                              │
      │◄─See "Pre-auth Approved"─────│                              │
      │  in dashboard                │                              │

DAY 3-5 - TREATMENT
═══════════════════════════════════════════════════════════════════

      │──Add Medical Records────────►│                              │
      │──Update Treatment───────────►│                              │
      │──Add Bills──────────────────►│                              │

DAY 6 - DISCHARGE
═══════════════════════════════════════════════════════════════════

      │                              │                              │
      │──Generate Discharge Summary──►│                              │
      │                              │                              │
      │                              │◄────4. Get Documents────────│
      │                              │   POST /visit/documents      │
      │                              │                              │
      │                              │──────PDFs (base64)──────────►│
      │                              │   [Invoice, Summary...]      │
      │                              │                              │
      │                              │                        [Submit Final Claim]

DAY 10 - SETTLEMENT
═══════════════════════════════════════════════════════════════════

      │                              │                              │
      │                              │◄────5. Update Settlement────│
      │                              │   POST /claim/update         │
      │                              │   {status: "Settled",        │
      │                              │    settledAmount: 47500,     │
      │                              │    tdsAmount: 500}           │
      │                              │                              │
      │◄─See Settlement Details──────│                              │
      │  Payment: ₹47,500            │                              │
```

---

## 🔑 API Authentication Flow

```
┌────────────────────────────────────────────────────────────────┐
│                     API AUTHENTICATION                         │
└────────────────────────────────────────────────────────────────┘

Step 1: Generate API Key
─────────────────────────────────────────────────────────────────
Hospital Admin
      │
      │── Goes to: /admin/api-docs
      │
      │── Clicks: "Generate Key"
      │
      │── Labels: "Zealthix Production"
      │
      ▼
[API Key Generated]
      │
your_production_api_key_xyz789def456ghi789jkl012mno345
      │
      │── Copy Key
      │
      └── Share with Zealthix Team


Step 2: Zealthix Makes API Call
─────────────────────────────────────────────────────────────────
Zealthix System
      │
      │── Prepare Request
      │
      ├── URL: https://your-hospital.com/api/zealthix/patient/find
      ├── Method: POST
      ├── Header: X-Api-Key: your_production_api_key_xyz789def456ghi789jkl012mno345
      ├── Header: Content-Type: application/json
      └── Body: {"patientId": "AVN-001"}
      │
      │── Send Request ──────────►  Hospital OS Server
      │                                    │
      │                                    ├── Verify API Key ✓
      │                                    ├── Check Permissions ✓
      │                                    ├── Query Database
      │                                    └── Return Data
      │
      │◄─────────────────────────  {success: true, data: {...}}
      │
      ▼
[Process Response]
```

---

## 🔐 Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│              MULTI-LAYER SECURITY ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────────┘

Layer 1: NETWORK SECURITY
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │         HTTPS / TLS 1.3 Encryption          │
    │   All data encrypted during transmission    │
    └─────────────────────────────────────────────┘
                        │
                        ▼

Layer 2: API AUTHENTICATION
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │           API Key Validation                │
    │     X-Api-Key header must match our DB      │
    │        Invalid = 401 Unauthorized           │
    └─────────────────────────────────────────────┘
                        │
                        ▼

Layer 3: RATE LIMITING
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │         100 Requests per Minute             │
    │      Prevents abuse and DDoS attacks        │
    │      Excessive requests = 429 Error         │
    └─────────────────────────────────────────────┘
                        │
                        ▼

Layer 4: DATA ACCESS CONTROL
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │      Organization-Level Isolation           │
    │   Each API key can only access own data     │
    │    Hospital A cannot see Hospital B data    │
    └─────────────────────────────────────────────┘
                        │
                        ▼

Layer 5: AUDIT LOGGING
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │         All API Calls are Logged            │
    │   Timestamp, IP, Endpoint, Response, User   │
    │      Available for compliance audits        │
    └─────────────────────────────────────────────┘
                        │
                        ▼

Layer 6: DATA ENCRYPTION AT REST
═══════════════════════════════════════════════════════════════════
    ┌─────────────────────────────────────────────┐
    │       Database Encryption (AES-256)         │
    │   Patient data encrypted in the database    │
    │       Even if DB is breached               │
    └─────────────────────────────────────────────┘
```

---

## 📡 Request/Response Flow

```
EXAMPLE: Search for Patient by Mobile Number
═══════════════════════════════════════════════════════════════════

┌──────────────┐                                    ┌──────────────┐
│   ZEALTHIX   │                                    │ HOSPITAL OS  │
│   SYSTEM     │                                    │   SERVER     │
└──────────────┘                                    └──────────────┘
       │                                                    │
       │                                                    │
       │  1. HTTP POST REQUEST                             │
       │──────────────────────────────────────────────────►│
       │                                                    │
       │  URL: /api/zealthix/patient/find                  │
       │                                                    │
       │  Headers:                                          │
       │    X-Api-Key: your_production_api_key...          │
       │    Content-Type: application/json                 │
       │                                                    │
       │  Body:                                             │
       │  {                                                 │
       │    "mobileNumber": "9876543210"                   │
       │  }                                                 │
       │                                                    │
       │                                    2. Validate API Key
       │                                    3. Search Database
       │                                    4. Prepare Response
       │                                                    │
       │  5. HTTP 200 OK RESPONSE                          │
       │◄──────────────────────────────────────────────────│
       │                                                    │
       │  {                                                 │
       │    "success": true,                               │
       │    "message": "success",                          │
       │    "data": [                                      │
       │      {                                            │
       │        "patientId": "AVN-20250101-0001",         │
       │        "name": "Rajesh Kumar",                   │
       │        "email": "rajesh@example.com",            │
       │        "phone": "9876543210",                    │
       │        "visitId": "ADM-001",                     │
       │        "doctorName": "Dr. Sharma",               │
       │        "amount": 50000,                          │
       │        "type": "IPD"                             │
       │      }                                            │
       │    ]                                              │
       │  }                                                 │
       │                                                    │
       ▼                                                    │
   [Process Data]                                          │
```

---

## 🔄 Data Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│             HOW YOUR DATA MAPS TO ZEALTHIX FORMAT               │
└─────────────────────────────────────────────────────────────────┘

PATIENT DATA
═══════════════════════════════════════════════════════════════════
Hospital OS DB          →    Zealthix API           →    Insurance
──────────────               ─────────────               ──────────
OPD_REG.patient_id     →    patientId               →    Member ID
OPD_REG.full_name      →    patientName             →    Patient Name
OPD_REG.phone          →    mobileNumber            →    Contact
policies.policy_number →    policyNo                →    Policy Ref


BILLING DATA
═══════════════════════════════════════════════════════════════════
Hospital OS DB          →    Zealthix API           →    Insurance
──────────────               ─────────────               ──────────
invoice_items          →    billDetails             →    Claim Items
  (category: Pharmacy) →      .pharmacy              →    Medicine
  (category: Lab)      →      .laboratoryInvest...  →    Investigation
  (category: Surgery)  →      .surgeon               →    Procedure
invoices.net_amount    →    totalAmount             →    Claim Amount


TREATMENT DATA
═══════════════════════════════════════════════════════════════════
Hospital OS DB          →    Zealthix API           →    Insurance
──────────────               ─────────────               ──────────
admissions.admit_date  →    admissionDateTime       →    DOS (From)
admissions.discharge.. →    dischargeDateTime       →    DOS (To)
admissions.diagnosis   →    diagnosis               →    ICD Code
admissions.treatment   →    lineOfTreatment         →    Type


CLAIM STATUS
═══════════════════════════════════════════════════════════════════
Zealthix                →    Hospital OS DB         →    Staff View
─────────                     ──────────                 ──────────
actionStatus: PREAUTH   →    claims.action_status   →    "Pre-auth"
status: "Approved"      →    claims.status          →    "Approved"
approvedAmount: 50000   →    claims.approved_amt    →    "₹50,000"
```

---

## ⚡ Performance Metrics

```
┌─────────────────────────────────────────────────────────────────┐
│                  TYPICAL RESPONSE TIMES                          │
└─────────────────────────────────────────────────────────────────┘

Patient Search (/patient/find)
╔═══════════════════════════════════════════════════════════════╗
║ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  300ms (avg)         ║
╚═══════════════════════════════════════════════════════════════╝
    Fast: 150ms  │  Avg: 300ms  │  Slow: 600ms


Visit Details (/patient/visit)
╔═══════════════════════════════════════════════════════════════╗
║ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░  500ms (avg)         ║
╚═══════════════════════════════════════════════════════════════╝
    Fast: 250ms  │  Avg: 500ms  │  Slow: 1000ms


Documents (/visit/documents)
╔═══════════════════════════════════════════════════════════════╗
║ ████████████████████████████████░░░░░░░░░  1.5s (avg)         ║
╚═══════════════════════════════════════════════════════════════╝
    Fast: 800ms  │  Avg: 1.5s   │  Slow: 3s
    (Depends on number/size of PDFs)


Claim Update (/claim/update)
╔═══════════════════════════════════════════════════════════════╗
║ █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  250ms (avg)         ║
╚═══════════════════════════════════════════════════════════════╝
    Fast: 100ms  │  Avg: 250ms  │  Slow: 500ms
```

---

## 🚨 Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR RESPONSE HANDLING                       │
└─────────────────────────────────────────────────────────────────┘

Success Response (200 OK)
─────────────────────────────────────────────────────────────────
    {
      "success": true,
      "message": "success",
      "data": { ... }
    }
           │
           └──► Process data normally


Bad Request (400)
─────────────────────────────────────────────────────────────────
    {
      "success": false,
      "error": "Missing required field: visitId"
    }
           │
           ├──► Check request body
           ├──► Verify all required fields present
           └──► Fix and retry


Unauthorized (401)
─────────────────────────────────────────────────────────────────
    {
      "success": false,
      "error": "Invalid or missing API key"
    }
           │
           ├──► Check API key in header
           ├──► Verify key is not revoked
           └──► Contact hospital if issue persists


Not Found (404)
─────────────────────────────────────────────────────────────────
    {
      "success": false,
      "error": "Patient not found"
    }
           │
           ├──► Verify patient ID is correct
           ├──► Try searching by mobile number
           └──► Patient may not exist in system


Server Error (500)
─────────────────────────────────────────────────────────────────
    {
      "success": false,
      "error": "Internal server error"
    }
           │
           ├──► Retry after 30 seconds
           ├──► If persists, alert hospital
           └──► Hospital will investigate logs
```

---

## 📊 Integration Testing Phases

```
┌─────────────────────────────────────────────────────────────────┐
│                   TESTING TIMELINE (3 WEEKS)                    │
└─────────────────────────────────────────────────────────────────┘

WEEK 1: STAGING ENVIRONMENT
═══════════════════════════════════════════════════════════════════
    Day 1-2: Setup
    ┌────────────────────────────────────────────┐
    │ □ Receive staging API key                  │
    │ □ Configure Zealthix system                │
    │ □ Test basic connectivity                  │
    └────────────────────────────────────────────┘

    Day 3-4: Endpoint Testing
    ┌────────────────────────────────────────────┐
    │ □ Test patient search (all methods)        │
    │ □ Test visit details endpoint              │
    │ □ Test documents download                  │
    │ □ Test claim updates                       │
    └────────────────────────────────────────────┘

    Day 5: Error Scenarios
    ┌────────────────────────────────────────────┐
    │ □ Test invalid API key                     │
    │ □ Test patient not found                   │
    │ □ Test invalid request format              │
    └────────────────────────────────────────────┘


WEEK 2: USER ACCEPTANCE TESTING
═══════════════════════════════════════════════════════════════════
    Day 1-3: Real Data Testing
    ┌────────────────────────────────────────────┐
    │ □ Test with anonymized real patients       │
    │ □ Process 10-20 test claims                │
    │ □ Verify data accuracy                     │
    │ □ Test full claim lifecycle                │
    └────────────────────────────────────────────┘

    Day 4-5: Integration Testing
    ┌────────────────────────────────────────────┐
    │ □ Test with hospital staff                 │
    │ □ Verify claim status updates show         │
    │ □ Test document downloads                  │
    │ □ Performance testing                      │
    └────────────────────────────────────────────┘


WEEK 3: PRODUCTION GO-LIVE
═══════════════════════════════════════════════════════════════════
    Day 1: Pre-launch
    ┌────────────────────────────────────────────┐
    │ □ Generate production API key              │
    │ □ Switch Zealthix to production            │
    │ □ Final connectivity test                  │
    └────────────────────────────────────────────┘

    Day 2-3: Soft Launch
    ┌────────────────────────────────────────────┐
    │ □ Process first 5-10 live claims           │
    │ □ Monitor closely for errors               │
    │ □ Fix any issues immediately               │
    └────────────────────────────────────────────┘

    Day 4-7: Full Launch
    ┌────────────────────────────────────────────┐
    │ □ Process all new claims via API           │
    │ □ Daily monitoring and review              │
    │ □ Staff training complete                  │
    │ □ Celebrate success! 🎉                    │
    └────────────────────────────────────────────┘
```

---

**Print this document and show the diagrams during your meeting!**
They help explain complex concepts visually. 📊✨
