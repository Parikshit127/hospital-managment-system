/**
 * HospitalOS — Admin Dashboard + TPA/Insurance Data Seed
 *
 * Targets:
 *  - Revenue Breakdown chart  → invoice_items per department across 7 days
 *  - Patient Flow (7 Days)    → appointments spread across past 7 days
 *  - TPA/Insurance Dashboard  → invoices with tpa_provider_id + tpa_claim_status
 *                               (this is what getInsuranceStats/getProviderPerformance read)
 *  - Provider Performance     → submitted/approved/settled invoices per provider
 *  - Pending Claims           → invoices with tpa_claim_status = 'submitted'
 *  - Approved Total           → invoices with tpa_claim_status in approved/partially_settled/settled
 *  - SLA guardrail            → insurance_claims.sla_due_at always > 3 days out (no red)
 *
 * Usage:
 *   ALLOW_SEED=1 npx tsx prisma/seed-admin-tpa.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── helpers ────────────────────────────────────────────────────────────────────
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];
const daysAgo   = (n: number, h = 10): Date => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const daysFromNow = (n: number): Date => new Date(Date.now() + n * 86_400_000);
const todayAt     = (h: number): Date => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const rint = (min: number, max: number, seed: number) =>
    min + ((seed * 9301 + 49297) % 233280) % (max - min + 1);

// ── static data ────────────────────────────────────────────────────────────────
const DOCTORS = [
    { name: 'Dr. Arvind Swaminathan', specialty: 'General Medicine' },
    { name: 'Dr. Sunita Kapoor',      specialty: 'Cardiology' },
    { name: 'Dr. Alok Verma',         specialty: 'Orthopedics' },
    { name: 'Dr. Neha Chawla',        specialty: 'Pediatrics' },
    { name: 'Dr. Suresh Menon',       specialty: 'Neurology' },
    { name: 'Dr. Meenakshi Gupta',    specialty: 'OB/GYN' },
    { name: 'Dr. Ramesh Joshi',       specialty: 'Pulmonology' },
    { name: 'Dr. Tarun Bhatia',       specialty: 'General Surgery' },
];

// Line items per department — these directly power the Revenue Breakdown chart
const LINE_ITEMS: { department: string; description: string; unit_price: number }[] = [
    { department: 'Cardiology',       description: 'Specialist Consultation',          unit_price: 1200 },
    { department: 'Cardiology',       description: 'ECG Interpretation',               unit_price: 400  },
    { department: 'Cardiology',       description: 'Troponin-I Lab Test',              unit_price: 950  },
    { department: 'Orthopedics',      description: 'Specialist Consultation',          unit_price: 900  },
    { department: 'Orthopedics',      description: 'X-Ray Bone (PA View)',             unit_price: 500  },
    { department: 'Neurology',        description: 'Specialist Consultation',          unit_price: 1400 },
    { department: 'General Medicine', description: 'OPD Consultation',                 unit_price: 700  },
    { department: 'General Medicine', description: 'Blood Glucose Fasting',            unit_price: 100  },
    { department: 'Pediatrics',       description: 'Specialist Consultation',          unit_price: 800  },
    { department: 'OB/GYN',          description: 'Specialist Consultation',          unit_price: 1000 },
    { department: 'OB/GYN',          description: 'USG Abdomen & Pelvis',             unit_price: 1200 },
    { department: 'Pulmonology',      description: 'Nebulization Session',             unit_price: 200  },
    { department: 'General Surgery',  description: 'Pre-Op Assessment',               unit_price: 1100 },
    { department: 'Lab',              description: 'CBC (Complete Blood Count)',       unit_price: 350  },
    { department: 'Lab',              description: 'LFT (Liver Function Test)',        unit_price: 750  },
    { department: 'Lab',             description: 'KFT (Kidney Function Test)',       unit_price: 700  },
    { department: 'Lab',              description: 'Thyroid Profile (T3/T4/TSH)',     unit_price: 850  },
    { department: 'Pharmacy',         description: 'Dolo 650 (10 Tabs)',              unit_price: 22   },
    { department: 'Pharmacy',         description: 'Augmentin 625 (6 Tabs)',          unit_price: 111  },
    { department: 'Pharmacy',         description: 'Pan 40 (10 Tabs)',               unit_price: 95   },
    { department: 'Pharmacy',         description: 'Rosuvas 10 (15 Tabs)',           unit_price: 188  },
    { department: 'IPD',              description: 'General Ward Bed Charge (3 days)', unit_price: 6000 },
    { department: 'IPD',              description: 'ICU Bed Charge (2 days)',         unit_price: 17000},
    { department: 'IPD',              description: 'Nursing & Monitoring (3 days)',   unit_price: 1200 },
    { department: 'OT',               description: 'Major Surgery — OT Charges',     unit_price: 25000},
];

const DIAGNOSES = [
    'Acute Myocardial Infarction', 'Dengue Fever', 'Community Acquired Pneumonia',
    'Diabetic Ketoacidosis', 'Post-Op Care — Appendectomy', 'CKD Stage 3',
    'Ischemic Stroke', 'COPD Exacerbation', 'Obstetric Case — Term Pregnancy',
    'Septicaemia', 'Fracture Femur — Post-ORIF', 'Hypertensive Emergency',
];

const REASONS = [
    'Fever and chills', 'Chest pain evaluation', 'Routine follow-up',
    'Knee pain', 'Headache and dizziness', 'Diabetes management',
    'Hypertension review', 'Cough and cold', 'Breathlessness',
    'Abdominal pain', 'Pre-operative assessment', 'Post-surgery follow-up',
];

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Set ALLOW_SEED=1'); process.exit(1);
    }

    console.log('\n============================================================');
    console.log('📊  ADMIN DASHBOARD + TPA/INSURANCE SEED');
    console.log('============================================================\n');

    // ── Resolve org ────────────────────────────────────────────────────────────
    const org = await prisma.organization.findFirst({
        where: { OR: [{ slug: 'avani' }, { code: 'AVN' }] },
    });
    if (!org) { console.error('❌  Run seed-aws.ts first'); process.exit(1); }
    const orgId = org.id;
    console.log(`✓ Org: ${org.name} (${orgId})`);

    const receptionist = await prisma.user.findFirst({ where: { organizationId: orgId, role: 'receptionist' } });
    const finance      = await prisma.user.findFirst({ where: { organizationId: orgId, role: 'finance' } });
    const providers    = await prisma.insurance_providers.findMany({ where: { organizationId: orgId } });

    if (providers.length === 0) { console.error('❌  No insurance providers. Run seed-aws.ts first.'); process.exit(1); }
    console.log(`✓ Found ${providers.length} insurance providers\n`);

    // ── Fetch or create 120 patients we can use ────────────────────────────────
    const PATIENT_NAMES = [
        'Rajan Malhotra','Priya Sharma','Vikram Singh','Anjali Patel','Deepak Verma',
        'Sunita Gupta','Anil Mehta','Kavita Nair','Rohit Joshi','Meera Iyer',
        'Suresh Reddy','Geeta Bose','Ajay Yadav','Rekha Mishra','Karan Pandey',
        'Divya Rao','Manish Desai','Pooja Chaudhary','Nikhil Agarwal','Seema Bhatia',
        'Praveen Kumar','Ananya Sen','Gaurav Tiwari','Nisha Srivastava','Tarun Kapoor',
        'Rashmi Jain','Ravi Chandra','Swati Saxena','Varun Shah','Preeti Khanna',
    ];
    const CITIES = ['Gurugram', 'Delhi', 'Noida', 'Faridabad', 'Ghaziabad', 'Pune', 'Mumbai'];

    const patients: { patient_id: string; full_name: string }[] = [];
    for (let i = 0; i < 120; i++) {
        const pid  = `AVN-2026-A${String(i + 1).padStart(4, '0')}`;
        const name = pick(PATIENT_NAMES, i);
        const existing = await prisma.oPD_REG.findUnique({ where: { patient_id: pid } });
        if (!existing) {
            await prisma.oPD_REG.create({
                data: {
                    patient_id:  pid,
                    full_name:   name,
                    phone:       `+91 9${String(7000000000 + i * 6271).slice(0, 9)}`,
                    gender:      i % 2 === 0 ? 'Male' : 'Female',
                    blood_group: pick(['A+','B+','O+','AB+'], i),
                    city:        pick(CITIES, i),
                    organizationId: orgId,
                },
            });
        }
        patients.push({ patient_id: pid, full_name: name });
    }
    console.log(`✓ 120 patients ready`);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. REVENUE BREAKDOWN — invoices WITH invoice_items across 7 days
    //    Chart reads: invoice_items.department + total_price WHERE invoices.status='Final'
    // ─────────────────────────────────────────────────────────────────────────
    let invoicesCreated = 0;
    let itemsCreated    = 0;
    let totalRevenue    = 0;

    // 7-day spread: ~20 invoices per day with varied line items
    for (let day = 0; day < 7; day++) {
        const invDate = daysAgo(6 - day, 9 + Math.floor(day / 2));
        const DAILY_INVOICES = 18 + (day * 2); // ramp up to today

        for (let i = 0; i < DAILY_INVOICES; i++) {
            const pat    = patients[(day * 20 + i) % patients.length];
            const doc    = pick(DOCTORS, i + day);
            const invNum = `AVN-BRK-D${day}-I${String(i + 1).padStart(3, '0')}`;

            const exists = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
            if (exists) continue;

            // Pick 2–4 line items per invoice for department variety
            const lineCount = 2 + (i % 3);
            const lines = Array.from({ length: lineCount }, (_, li) =>
                pick(LINE_ITEMS, i * 3 + li + day)
            );
            const invoiceTotal = lines.reduce((s, l) => s + l.unit_price, 0);

            const inv = await prisma.invoices.create({
                data: {
                    invoice_number:      invNum,
                    patient_id:          pat.patient_id,
                    invoice_type:        day < 5 ? 'OPD' : 'IPD',
                    total_amount:        invoiceTotal,
                    net_amount:          invoiceTotal,
                    paid_amount:         invoiceTotal,
                    balance_due:         0,
                    status:              'Final',
                    finalized_at:        invDate,
                    created_at:          invDate,
                    updated_at:          invDate,
                    billing_patient_type: 'cash',
                    doctor_name:         doc.name,
                    organizationId:      orgId,
                },
            });

            // Create invoice_items — THIS is what Revenue Breakdown reads
            for (const line of lines) {
                const tax = line.unit_price >= 1000 ? line.unit_price * 0.05 : 0;
                await prisma.invoice_items.create({
                    data: {
                        invoice_id:  inv.id,
                        department:  line.department,
                        description: line.description,
                        quantity:    1,
                        unit_price:  line.unit_price,
                        total_price: line.unit_price + tax,
                        discount:    0,
                        net_price:   line.unit_price + tax,
                        tax_rate:    tax > 0 ? 5 : 0,
                        tax_amount:  tax,
                        organizationId: orgId,
                    },
                });
                itemsCreated++;
            }

            // Payment record
            const rcptNum = `AVN-BRK-RCP-D${day}-${String(i + 1).padStart(3, '0')}`;
            const existingRcpt = await prisma.payments.findUnique({ where: { receipt_number: rcptNum } });
            if (!existingRcpt) {
                await prisma.payments.create({
                    data: {
                        receipt_number: rcptNum,
                        invoice_id:     inv.id,
                        amount:         invoiceTotal,
                        payment_method: pick(['Cash', 'UPI', 'Card', 'NEFT'], i),
                        payment_type:   'Full Payment',
                        status:         'Completed',
                        received_by:    receptionist?.username ?? 'receptionist',
                        organizationId: orgId,
                        created_at:     invDate,
                    },
                });
            }

            totalRevenue += invoiceTotal;
            invoicesCreated++;
        }
    }
    console.log(`✓ Revenue Breakdown: ${invoicesCreated} invoices + ${itemsCreated} line items`);
    console.log(`  Total ₹${(totalRevenue / 100000).toFixed(2)}L across 7 days`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PATIENT FLOW (7 DAYS) — appointments spread across last 7 days
    // ─────────────────────────────────────────────────────────────────────────
    let apptCreated = 0;
    for (let day = 0; day < 7; day++) {
        const apptDate   = daysAgo(6 - day, 9);
        const DAILY_APPT = 25 + day * 8; // ramp: 25 → 73 today (spike)

        for (let i = 0; i < DAILY_APPT; i++) {
            const apptId = `AVN-FLOW-D${day}-${String(i + 1).padStart(3, '0')}`;
            const pat    = patients[(day * 25 + i) % patients.length];
            const doc    = pick(DOCTORS, i + day);
            const exists = await prisma.appointments.findUnique({ where: { appointment_id: apptId } });
            if (exists) continue;

            const isToday  = day === 6;
            const status   = isToday
                ? pick(['Completed', 'Completed', 'Checked In', 'In Progress', 'Completed'], i)
                : 'Completed';

            await prisma.appointments.create({
                data: {
                    appointment_id:   apptId,
                    patient_id:       pat.patient_id,
                    doctor_name:      doc.name,
                    department:       doc.specialty,
                    status,
                    reason_for_visit: pick(REASONS, i + day),
                    appointment_date: apptDate,
                    queue_token:      i + 1,
                    organizationId:   orgId,
                    booking_channel:  pick(['walk_in', 'walk_in', 'online'], i),
                    payment_status:   'PAID',
                },
            });
            apptCreated++;
        }
    }
    console.log(`✓ Patient Flow: ${apptCreated} appointments across 7 days`);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TPA/INSURANCE INVOICES
    //    getInsuranceStats/getProviderPerformance read from INVOICES, not insurance_claims.
    //    We need invoices with:
    //      - billing_patient_type = 'tpa_insurance'
    //      - tpa_provider_id      = provider.id
    //      - tpa_claim_status     = 'submitted' | 'approved' | 'settled'
    //      - tpa_approved_amount / tpa_settled_amount filled
    //
    //    Distribution per provider:
    //      60% settled (drives totalSettled + high approvalRate)
    //      25% approved (drives approvedTotal)
    //      15% submitted (drives pendingClaims)
    // ─────────────────────────────────────────────────────────────────────────

    // TPA IPD amounts — realistic hospitalization bills
    const TPA_AMOUNTS = [
        85000, 125000, 68000, 145000, 92000, 175000, 110000, 58000,
        138000, 95000, 162000, 72000, 115000, 88000, 195000, 105000,
        78000, 142000, 98000, 168000, 82000, 132000, 65000, 185000,
    ];

    let tpaInvoicesCreated = 0;
    let totalPendingClaims = 0;
    let totalApproved      = 0;
    let totalSettledAmt    = 0;

    for (const provider of providers) {
        const CLAIMS_PER_PROVIDER = 8; // 8 × 7 providers = 56 TPA invoices total

        for (let i = 0; i < CLAIMS_PER_PROVIDER; i++) {
            const pat    = patients[(providers.indexOf(provider) * 8 + i + 80) % patients.length];
            const doc    = pick(DOCTORS, i);
            const amount = pick(TPA_AMOUNTS, providers.indexOf(provider) * 8 + i);
            const invNum = `AVN-TPA-${provider.provider_code}-${String(i + 1).padStart(3, '0')}`;

            const exists = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
            if (exists) continue;

            // Determine claim status: 60% settled, 25% approved, 15% submitted
            let claimStatus: string;
            let approvedAmt: number;
            let settledAmt: number;
            let approvedAt: Date | undefined;
            let settledAt: Date | undefined;

            if (i < Math.floor(CLAIMS_PER_PROVIDER * 0.60)) {
                // Settled
                claimStatus = 'settled';
                approvedAmt = Math.round(amount * 0.92);
                settledAmt  = Math.round(approvedAmt * 0.97);
                approvedAt  = daysAgo(rint(10, 30, i), 11);
                settledAt   = daysAgo(rint(3, 9, i), 14);
                totalSettledAmt += settledAmt;
                totalApproved++;
            } else if (i < Math.floor(CLAIMS_PER_PROVIDER * 0.85)) {
                // Approved (not yet settled)
                claimStatus = 'approved';
                approvedAmt = Math.round(amount * 0.90);
                settledAmt  = 0;
                approvedAt  = daysAgo(rint(4, 12, i), 10);
                totalApproved++;
            } else {
                // Submitted / pending
                claimStatus = 'submitted';
                approvedAmt = 0;
                settledAmt  = 0;
                totalPendingClaims++;
            }

            const invDate  = daysAgo(rint(15, 45, providers.indexOf(provider) * 8 + i), 10);
            const tpaPayable = Math.round(amount * 0.85); // hospital's portion billed to TPA

            const inv = await prisma.invoices.create({
                data: {
                    invoice_number:       invNum,
                    patient_id:           pat.patient_id,
                    invoice_type:         'IPD',
                    total_amount:         amount,
                    net_amount:           amount,
                    paid_amount:          settledAmt > 0 ? settledAmt : 0,
                    balance_due:          amount - (settledAmt > 0 ? settledAmt : 0),
                    status:               'Final',
                    finalized_at:         invDate,
                    created_at:           invDate,
                    updated_at:           invDate,
                    doctor_name:          doc.name,
                    // TPA-specific fields that the dashboard reads
                    billing_patient_type: 'tpa_insurance',
                    tpa_provider_id:      provider.id,
                    tpa_claim_status:     claimStatus,
                    tpa_payable:          tpaPayable,
                    tpa_approved_amount:  approvedAmt,
                    tpa_approved_at:      approvedAt ?? null,
                    tpa_settled_amount:   settledAmt,
                    tpa_settled_at:       settledAt ?? null,
                    tpa_disallowed_amount: approvedAmt > 0 ? Math.round(amount * 0.08) : 0,
                    tpa_tds_amount:       settledAmt > 0 ? Math.round(settledAmt * 0.01) : 0,
                    organizationId:       orgId,
                },
            });

            // Add invoice_items so these also appear in Revenue Breakdown (IPD dept)
            const lineItems = [
                { description: `IPD Bed Charge — ${pick(DIAGNOSES, i)}`, department: 'IPD', unit_price: Math.round(amount * 0.50) },
                { description: `Specialist Charges — ${doc.name}`,          department: doc.specialty, unit_price: Math.round(amount * 0.20) },
                { description: 'Nursing & Monitoring',                       department: 'IPD',  unit_price: Math.round(amount * 0.15) },
                { description: 'Diagnostic & Lab Tests',                     department: 'Lab',  unit_price: Math.round(amount * 0.10) },
                { description: 'Pharmacy & Consumables',                     department: 'Pharmacy', unit_price: Math.round(amount * 0.05) },
            ];
            for (const li of lineItems) {
                await prisma.invoice_items.create({
                    data: {
                        invoice_id:  inv.id,
                        department:  li.department,
                        description: li.description,
                        quantity:    1,
                        unit_price:  li.unit_price,
                        total_price: li.unit_price,
                        discount:    0,
                        net_price:   li.unit_price,
                        tax_rate:    0,
                        tax_amount:  0,
                        organizationId: orgId,
                    },
                });
                itemsCreated++;
            }

            tpaInvoicesCreated++;
        }
    }

    console.log(`✓ TPA Invoices: ${tpaInvoicesCreated} created across ${providers.length} providers`);
    console.log(`  Pending: ${totalPendingClaims} | Approved/Settled: ${totalApproved} | Settled ₹${(totalSettledAmt / 100000).toFixed(2)}L`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. INSURANCE POLICIES — ensure active policies exist for TPA patients
    //    (needed for Recent Claims and getAllPolicies tab)
    // ─────────────────────────────────────────────────────────────────────────
    let policiesCreated = 0;
    for (let pi = 0; pi < providers.length; pi++) {
        const provider = providers[pi];
        for (let i = 0; i < 6; i++) {
            const pat     = patients[(pi * 6 + i + 50) % patients.length];
            const polNum  = `POL-ADM-${provider.provider_code}-${String(100 + i)}`;
            const exists  = await prisma.insurance_policies.findFirst({ where: { policy_number: polNum } });
            if (exists) continue;

            await prisma.insurance_policies.create({
                data: {
                    patient_id:      pat.patient_id,
                    provider_id:     provider.id,
                    policy_number:   polNum,
                    policy_holder:   pat.full_name,
                    plan_name:       `${provider.provider_name} Gold Health Plan`,
                    coverage_limit:  500000,
                    remaining_limit: 350000,
                    valid_from:      daysAgo(180),
                    valid_until:     daysFromNow(185),
                    status:          'Active',
                    organizationId:  orgId,
                },
            });
            policiesCreated++;
        }
    }
    console.log(`✓ Insurance Policies: ${policiesCreated} new active policies`);

    // ─────────────────────────────────────────────────────────────────────────
    // 5. INSURANCE CLAIMS (legacy table — also feeds Recent Claims list)
    //    SLA guardrail: sla_due_at is ALWAYS ≥ now + 3 days → no red badge
    //    80% green (> 5 days), 20% amber (3–4 days)
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch the TPA invoices we just created to link claims to them
    const tpaInvoices = await prisma.invoices.findMany({
        where: { organizationId: orgId, billing_patient_type: 'tpa_insurance', status: 'Final' },
        orderBy: { id: 'desc' },
        take: 30,
    });

    const policies = await prisma.insurance_policies.findMany({
        where: { organizationId: orgId, status: 'Active' },
        take: 30,
    });

    let claimsCreated = 0;
    const CLAIM_COUNT = Math.min(20, tpaInvoices.length, policies.length);

    for (let i = 0; i < CLAIM_COUNT; i++) {
        const claimNum = `CLM-ADM-${String(i + 1).padStart(3, '0')}`;
        const exists   = await prisma.insurance_claims.findFirst({ where: { claim_number: claimNum } });
        if (exists) continue;

        const inv    = tpaInvoices[i];
        const policy = policies[i % policies.length];
        const isAmber = i >= Math.floor(CLAIM_COUNT * 0.80);

        // Green: 6–20 days out | Amber: 3–4 days out | Red: NEVER
        const slaDays = isAmber ? 3 + (i % 2) : 6 + (i % 15);

        const claimed = Number(inv.tpa_payable || inv.net_amount);

        await prisma.insurance_claims.create({
            data: {
                claim_number:       claimNum,
                policy_id:          policy.id,
                invoice_id:         inv.id,
                claimed_amount:     claimed,
                approved_amount:    inv.tpa_claim_status === 'settled' || inv.tpa_claim_status === 'approved'
                    ? Math.round(claimed * 0.92) : null,
                status:             inv.tpa_claim_status === 'settled'   ? 'Settled'
                    :               inv.tpa_claim_status === 'approved'  ? 'Approved'
                    :                                                       'Submitted',
                organizationId:     orgId,
                submitted_at:       daysAgo(rint(5, 15, i)),
                sla_due_at:         daysFromNow(slaDays), // ← always future, no red
                resubmission_count: 0,
            },
        });
        claimsCreated++;
    }
    console.log(`✓ Insurance Claims: ${claimsCreated} claims seeded — 0 red SLA badges`);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. INSURANCE RECEIPTS — drives "Approved Total" and Provider Performance
    // ─────────────────────────────────────────────────────────────────────────
    let receiptsCreated = 0;
    let receiptTotal    = 0;

    const RECEIPT_BATCHES: { code: string; amounts: number[] }[] = [
        { code: 'STAR',  amounts: [280000, 195000, 225000, 310000, 158000] },
        { code: 'HDFC',  amounts: [345000, 220000, 185000, 275000, 198000] },
        { code: 'ICICI', amounts: [245000, 168000, 310000, 145000, 222000] },
        { code: 'BAJAJ', amounts: [178000, 265000, 195000, 135000, 248000] },
        { code: 'STAR',  amounts: [190000, 142000] }, // extra batches for Star & HDFC
        { code: 'HDFC',  amounts: [215000, 188000] },
    ];

    for (const batch of RECEIPT_BATCHES) {
        const prov = providers.find(p => p.provider_code === batch.code);
        if (!prov) continue;

        for (let i = 0; i < batch.amounts.length; i++) {
            const amount  = batch.amounts[i];
            const rcptNum = `AVN-IRC-ADM-${prov.provider_code}-${String(receiptsCreated + 1).padStart(3, '0')}`;
            const refNum  = `UTR${uid()}${uid()}`;
            const dBack   = rint(5, 60, receiptsCreated + i);

            const exists = await prisma.insuranceReceipt.findFirst({
                where: { organizationId: orgId, receipt_number: rcptNum },
            });
            if (exists) { receiptsCreated++; continue; }

            const receipt = await prisma.insuranceReceipt.create({
                data: {
                    receipt_number:   rcptNum,
                    payer_type:       'tpa_insurance',
                    provider_id:      prov.id,
                    instrument:       pick(['NEFT', 'RTGS', 'NEFT'], i),
                    reference_number: refNum,
                    receipt_date:     daysAgo(dBack),
                    total_amount:     amount,
                    allocated_amount: amount,
                    unmapped_amount:  0,
                    claim_amount:     Math.round(amount * 1.06),
                    sanctioned_amount: amount,
                    service_charge:   Math.round(amount * 0.02),
                    tds_total:        Math.round(amount * 0.01),
                    status:           'Allocated',
                    organizationId:   orgId,
                    created_at:       daysAgo(dBack),
                },
            });

            // Allocate to a TPA invoice
            const allocInv = tpaInvoices[receiptsCreated % tpaInvoices.length];
            if (allocInv) {
                await prisma.insuranceReceiptAllocation.create({
                    data: {
                        receipt_id:        receipt.id,
                        invoice_id:        allocInv.id,
                        allocated_amount:  amount,
                        disallowed_amount: Math.round(amount * 0.04),
                        tds_amount:        Math.round(amount * 0.01),
                        organizationId:    orgId,
                    },
                });
            }

            receiptTotal += amount;
            receiptsCreated++;
        }
    }
    console.log(`✓ Insurance Receipts: ₹${(receiptTotal / 100000).toFixed(2)}L settled across ${receiptsCreated} receipts`);

    // ─────────────────────────────────────────────────────────────────────────
    // 7. AUDIT TRAIL — dense recent entries for the live feed
    // ─────────────────────────────────────────────────────────────────────────
    const AUDIT_TEMPLATES = [
        { action: 'LOGIN',             module: 'Auth',      role: 'doctor',       detail: 'Doctor portal login' },
        { action: 'PATIENT_CREATED',   module: 'OPD',       role: 'receptionist', detail: 'New patient registered' },
        { action: 'INVOICE_CREATED',   module: 'Billing',   role: 'receptionist', detail: 'OPD invoice raised' },
        { action: 'PAYMENT_RECEIVED',  module: 'Billing',   role: 'finance',      detail: 'Cash payment collected' },
        { action: 'CLAIM_SUBMITTED',   module: 'Insurance', role: 'finance',      detail: 'TPA claim submitted' },
        { action: 'DISCHARGE_PROCESSED', module: 'IPD',     role: 'ipd_manager',  detail: 'Patient discharged' },
        { action: 'BILLING_OVERRIDE',  module: 'Billing',   role: 'admin',        detail: 'Billing override approved' },
        { action: 'MEDICINE_DISPENSED', module: 'Pharmacy', role: 'pharmacist',   detail: 'Prescription dispensed' },
        { action: 'VITAL_RECORDED',    module: 'Nursing',   role: 'nurse',        detail: 'IPD vitals recorded' },
        { action: 'REPORT_GENERATED',  module: 'MIS',       role: 'admin',        detail: 'MIS report generated' },
        { action: 'LAB_ORDER_PLACED',  module: 'Lab',       role: 'doctor',       detail: 'Diagnostic test ordered' },
        { action: 'PRESCRIPTION_SAVED', module: 'OPD',      role: 'doctor',       detail: 'Prescription issued' },
        { action: 'BED_STATUS_CHANGED', module: 'IPD',      role: 'nurse',        detail: 'Bed status updated' },
        { action: 'RECEIPT_PROCESSED', module: 'Insurance', role: 'finance',      detail: 'TPA receipt recorded' },
        { action: 'ADMISSION_CREATED', module: 'IPD',       role: 'ipd_manager',  detail: 'Patient admitted to ward' },
    ];

    const AUDIT_IPS = ['192.168.1.101', '192.168.1.102', '10.0.0.12', '10.0.0.15'];
    const AUDIT_COUNT = 80;

    for (let i = 0; i < AUDIT_COUNT; i++) {
        const tmpl   = pick(AUDIT_TEMPLATES, i);
        const minsAgo = Math.floor(i * 3.5);
        await prisma.system_audit_logs.create({
            data: {
                username:   tmpl.role,
                role:       tmpl.role,
                action:     tmpl.action,
                module:     tmpl.module,
                entity_type: tmpl.module,
                entity_id:  String(2000 + i),
                details:    `${tmpl.detail} — ref #${2000 + i}`,
                ip_address: pick(AUDIT_IPS, i),
                organizationId: orgId,
                created_at: new Date(Date.now() - minsAgo * 60_000),
            },
        });
    }
    console.log(`✓ Audit Trail: ${AUDIT_COUNT} log entries seeded`);

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    const t = (n: number) => `₹${(n / 100000).toFixed(2)}L`;
    console.log('\n============================================================');
    console.log('✅  SEED COMPLETE');
    console.log('============================================================');
    console.log(`  Revenue (7-day)     : ${t(totalRevenue)} — breakdown chart populated`);
    console.log(`  Patient Flow        : ${apptCreated} appointments across 7 days`);
    console.log(`  TPA Invoices        : ${tpaInvoicesCreated} (${totalPendingClaims} pending, ${totalApproved} approved/settled)`);
    console.log(`  Provider Performance: All ${providers.length} providers have claims`);
    console.log(`  Approved Total      : ${t(tpaInvoices.reduce((s, i) => s + Number(i.tpa_approved_amount || 0), 0))}`);
    console.log(`  TPA Settlements     : ${t(totalSettledAmt)} total settled`);
    console.log(`  Insurance Receipts  : ${t(receiptTotal)} across ${receiptsCreated} receipts`);
    console.log(`  Insurance Claims    : ${claimsCreated} — 0 red SLA, all green/amber`);
    console.log(`  Audit Trail         : ${AUDIT_COUNT} recent log entries`);
    console.log('============================================================\n');
}

main()
    .catch(err => { console.error('Seed error:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
