/**
 * HospitalOS — Demo Dashboard Seed Script
 *
 * Purpose: Populate the live dashboard with high-impact demo data for a client
 *          walkthrough. Safe to run against any pre-seeded database.
 *
 * Targets:
 *  - Revenue today > ₹8.5L  (invoices + payments)
 *  - 150–200 appointments today (patient flow graphs)
 *  - Dense audit trail (live feed activity)
 *  - 5–8 queued/waiting appointments (sidebar queue)
 *  - Demo patient with historical visits
 *  - ~40/48 beds occupied (85%), with Cleaning + Reserved states
 *  - 20 active insurance claims, SLA-engineered: 80% green, 20% amber, 0% red
 *  - ₹24.5L+ in past InsuranceReceipt settlements
 *
 * Usage (run ONCE before the demo):
 *   ALLOW_SEED=1 npx tsx prisma/seed-demo-dashboard.ts
 *   -- or on Node 20 --
 *   ALLOW_SEED=1 node --loader ts-node/esm --no-warnings prisma/seed-demo-dashboard.ts
 *
 * Idempotency: Script is safe to re-run. It checks for duplicates before inserting.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];
/** Deterministic pseudo-random int — same seed always gives same value */
const rint = (min: number, max: number, seed: number) =>
    min + ((seed * 9301 + 49297) % 233280) % (max - min + 1);
/** IST midnight today (UTC) */
const todayIST = (): Date => {
    const now = new Date();
    // IST = UTC+5:30 → UTC midnight for IST day = subtract 5h30m from IST midnight
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return new Date(Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate(), 0, 0, 0));
};
const todayAt = (h: number, m = 0): Date => {
    const d = todayIST();
    d.setUTCHours(h - 5, m === 0 ? -30 : m - 30); // IST to UTC offset
    return d;
};
const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number): Date => new Date(Date.now() + n * 86_400_000);
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();

// ─── constants ────────────────────────────────────────────────────────────────
const DEMO_PATIENT_ID = 'AVN-2026-99001'; // The on-camera patient
const DEMO_PATIENT_NAME = 'Rahul Mehta';
const DEMO_PATIENT_PHONE = '+91 98765 43210';

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

const REASONS = [
    'Fever and chills', 'Chest pain evaluation', 'Routine follow-up',
    'Knee pain', 'Headache and dizziness', 'Diabetes management',
    'Hypertension review', 'Cough and cold', 'Back pain',
    'Skin rash evaluation', 'Abdominal pain', 'Breathlessness',
    'Pre-operative assessment', 'Post-surgery follow-up', 'Annual health check',
];

const AUDIT_ACTIONS = [
    { action: 'LOGIN',           module: 'Auth',     role: 'doctor',       detail: 'Doctor portal login' },
    { action: 'LOGIN',           module: 'Auth',     role: 'receptionist', detail: 'Reception portal login' },
    { action: 'PATIENT_CREATED', module: 'OPD',      role: 'receptionist', detail: 'New patient registered' },
    { action: 'INVOICE_CREATED', module: 'Billing',  role: 'receptionist', detail: 'OPD invoice raised' },
    { action: 'PAYMENT_RECEIVED',module: 'Billing',  role: 'finance',      detail: 'Cash payment collected' },
    { action: 'PRESCRIPTION_SAVED', module: 'OPD',   role: 'doctor',       detail: 'Prescription issued' },
    { action: 'LAB_ORDER_PLACED',module: 'Lab',      role: 'doctor',       detail: 'Diagnostic test ordered' },
    { action: 'VITAL_RECORDED',  module: 'Nursing',  role: 'nurse',        detail: 'IPD vitals documented' },
    { action: 'ADMISSION_CREATED', module: 'IPD',    role: 'ipd_manager',  detail: 'Patient admitted to ward' },
    { action: 'BILLING_OVERRIDE',module: 'Billing',  role: 'admin',        detail: 'Billing override approved' },
    { action: 'DISCHARGE_PROCESSED', module: 'IPD',  role: 'ipd_manager',  detail: 'Patient discharged' },
    { action: 'CLAIM_SUBMITTED', module: 'Insurance', role: 'finance',     detail: 'TPA claim submitted' },
    { action: 'MEDICINE_DISPENSED', module: 'Pharmacy', role: 'pharmacist', detail: 'Prescription dispensed' },
    { action: 'REPORT_GENERATED', module: 'MIS',     role: 'admin',        detail: 'MIS report generated' },
    { action: 'BED_STATUS_CHANGED', module: 'IPD',   role: 'nurse',        detail: 'Bed status updated' },
];

const PATIENT_NAMES_M = [
    'Rajesh Kumar', 'Amit Singh', 'Vikram Sharma', 'Suresh Patel',
    'Anil Gupta', 'Deepak Verma', 'Manish Joshi', 'Rohit Mehta',
    'Sanjay Nair', 'Arjun Iyer', 'Karan Reddy', 'Tarun Bose',
    'Nikhil Sen', 'Varun Mishra', 'Harsh Pandey', 'Gaurav Rao',
    'Ravi Chandra', 'Praveen Desai', 'Lokesh Yadav', 'Ajay Tiwari',
];

const PATIENT_NAMES_F = [
    'Priya Sharma', 'Neha Verma', 'Anjali Singh', 'Sunita Patel',
    'Kavita Gupta', 'Ritu Joshi', 'Swati Mehta', 'Divya Nair',
    'Meera Iyer', 'Pooja Reddy', 'Ananya Sen', 'Geeta Mishra',
    'Rekha Rao', 'Shalini Desai', 'Seema Yadav', 'Rashmi Tiwari',
    'Preeti Pandey', 'Nisha Chaudhary', 'Deepika Agarwal', 'Kiran Bhatia',
];

const CITIES = [
    'Gurugram', 'Noida', 'Delhi', 'Faridabad', 'Ghaziabad',
    'Pune', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai',
];

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Set ALLOW_SEED=1 to run in production');
        process.exit(1);
    }

    console.log('\n====================================================');
    console.log('🎬  AVANI HOSPITALS — DEMO DASHBOARD SEED');
    console.log('====================================================\n');

    // ── Resolve Org ────────────────────────────────────────────────────────────
    const org = await prisma.organization.findFirst({
        where: { OR: [{ slug: 'avani' }, { code: 'AVN' }] },
    });
    if (!org) {
        console.error('❌ Organization not found. Run seed-aws.ts first.');
        process.exit(1);
    }
    const orgId = org.id;
    console.log(`✓ Org: ${org.name} (${orgId})\n`);

    // Resolve a receptionist and finance user for attribution
    const receptionist = await prisma.user.findFirst({
        where: { organizationId: orgId, role: 'receptionist' },
    });
    const doctor = await prisma.user.findFirst({
        where: { organizationId: orgId, role: 'doctor' },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DEMO PATIENT (the on-camera patient with history)
    // ─────────────────────────────────────────────────────────────────────────
    let demoPatient = await prisma.oPD_REG.findUnique({
        where: { patient_id: DEMO_PATIENT_ID },
    });

    if (!demoPatient) {
        demoPatient = await prisma.oPD_REG.create({
            data: {
                patient_id:   DEMO_PATIENT_ID,
                full_name:    DEMO_PATIENT_NAME,
                phone:        DEMO_PATIENT_PHONE,
                gender:       'Male',
                date_of_birth: '1988-06-15',
                blood_group:  'B+',
                address:      'A-42, DLF Phase 2, Gurugram, Haryana 122002',
                city:         'Gurugram',
                abha_number:  '14-8841-2271-9901',
                organizationId: orgId,
            },
        });
        console.log(`✓ Demo patient created: ${DEMO_PATIENT_NAME} (${DEMO_PATIENT_ID})`);
    } else {
        console.log(`✓ Demo patient exists: ${DEMO_PATIENT_NAME}`);
    }

    // Historical appointments (3-4 months ago) for "returning patient" quick stats
    const historicalVisits = [
        { daysBack: 120, doctor: DOCTORS[0], reason: 'Hypertension review', paid: 850 },
        { daysBack: 85,  doctor: DOCTORS[1], reason: 'Cardiac evaluation',   paid: 1350 },
        { daysBack: 52,  doctor: DOCTORS[0], reason: 'Diabetes management',  paid: 900 },
        { daysBack: 21,  doctor: DOCTORS[2], reason: 'Knee pain follow-up',  paid: 1050 },
    ];

    let historyCreated = 0;
    for (let i = 0; i < historicalVisits.length; i++) {
        const v = historicalVisits[i];
        const apptId = `AVN-DEMO-HIST-${i + 1}`;
        const exists = await prisma.appointments.findUnique({ where: { appointment_id: apptId } });
        if (exists) continue;

        await prisma.appointments.create({
            data: {
                appointment_id:   apptId,
                patient_id:       DEMO_PATIENT_ID,
                doctor_name:      v.doctor.name,
                department:       v.doctor.specialty,
                status:           'Completed',
                reason_for_visit: v.reason,
                appointment_date: daysAgo(v.daysBack),
                organizationId:   orgId,
                booking_channel:  'walk_in',
                payment_status:   'PAID',
            },
        });

        // Historical invoice + payment
        const invNum = `AVN-OPD-HIST-${String(i + 1).padStart(3, '0')}`;
        const existingInv = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
        if (!existingInv) {
            const inv = await prisma.invoices.create({
                data: {
                    invoice_number: invNum,
                    patient_id:     DEMO_PATIENT_ID,
                    invoice_type:   'OPD',
                    is_fee_receipt: true,
                    total_amount:   v.paid,
                    net_amount:     v.paid,
                    paid_amount:    v.paid,
                    balance_due:    0,
                    status:         'Final',
                    finalized_at:   daysAgo(v.daysBack),
                    created_at:     daysAgo(v.daysBack),
                    organizationId: orgId,
                    billing_patient_type: 'cash',
                },
            });
            const rcptNum = `AVN-RCP-HIST-${String(i + 1).padStart(3, '0')}`;
            const existingRcpt = await prisma.payments.findUnique({ where: { receipt_number: rcptNum } });
            if (!existingRcpt) {
                await prisma.payments.create({
                    data: {
                        receipt_number: rcptNum,
                        invoice_id:     inv.id,
                        amount:         v.paid,
                        payment_method: 'Cash',
                        payment_type:   'Full Payment',
                        status:         'Completed',
                        received_by:    receptionist?.username ?? 'receptionist',
                        organizationId: orgId,
                        created_at:     daysAgo(v.daysBack),
                    },
                });
            }
        }
        historyCreated++;
    }
    console.log(`✓ Demo patient history: ${historyCreated} new historical visits seeded`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. BULK PATIENTS (for today's appointments — need lots of patient records)
    // ─────────────────────────────────────────────────────────────────────────
    const BULK_COUNT = 180;
    const bulkPatients: { patient_id: string }[] = [];

    for (let i = 0; i < BULK_COUNT; i++) {
        const pid = `AVN-2026-D${String(i + 1).padStart(4, '0')}`;
        const isFemale = i % 3 === 0;
        const name = isFemale
            ? pick(PATIENT_NAMES_F, i)
            : pick(PATIENT_NAMES_M, i);

        const existing = await prisma.oPD_REG.findUnique({ where: { patient_id: pid } });
        if (!existing) {
            await prisma.oPD_REG.create({
                data: {
                    patient_id:       pid,
                    full_name:        name,
                    phone:            `+91 9${String(8000000000 + i * 7919).slice(0, 9)}`,
                    gender:           isFemale ? 'Female' : 'Male',
                    date_of_birth:    `${1960 + (i % 50)}-${String((i % 12) + 1).padStart(2,'0')}-${String((i % 28) + 1).padStart(2,'0')}`,
                    blood_group:      pick(['A+','B+','O+','AB+','A-','B-','O-'], i),
                    city:             pick(CITIES, i),
                    organizationId:   orgId,
                },
            });
        }
        bulkPatients.push({ patient_id: pid });
    }
    console.log(`✓ Bulk patients: ${BULK_COUNT} patient records ready`);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TODAY'S APPOINTMENTS (150-180 completed/in-progress + 5-8 queued)
    // ─────────────────────────────────────────────────────────────────────────
    const COMPLETED_STATUS = ['Completed', 'Completed', 'Completed', 'Checked In', 'In Progress'];
    let apptCreated = 0;

    for (let i = 0; i < 170; i++) {
        const pat = bulkPatients[i];
        const doc = pick(DOCTORS, i);
        const apptId = `AVN-TODAY-${String(i + 1).padStart(4, '0')}`;

        const exists = await prisma.appointments.findUnique({ where: { appointment_id: apptId } });
        if (exists) continue;

        const slotHour = 8 + Math.floor(i / 17); // spread 8am–18pm
        const status = pick(COMPLETED_STATUS, i);

        await prisma.appointments.create({
            data: {
                appointment_id:   apptId,
                patient_id:       pat.patient_id,
                doctor_name:      doc.name,
                department:       doc.specialty,
                status,
                reason_for_visit: pick(REASONS, i),
                appointment_date: todayAt(slotHour, (i * 4) % 55),
                queue_token:      i + 1,
                checked_in_at:    status !== 'Completed' ? todayAt(slotHour - 1) : undefined,
                organizationId:   orgId,
                booking_channel:  pick(['walk_in', 'walk_in', 'online', 'phone'], i),
                payment_status:   'PAID',
            },
        });
        apptCreated++;
    }
    console.log(`✓ Today's appointments: ${apptCreated} seeded`);

    // Queued / Waiting (sidebar queue — 6 entries)
    const QUEUE_STATUS = ['Queued', 'Waiting', 'Queued', 'Waiting', 'Queued', 'Queued'];
    for (let i = 0; i < 6; i++) {
        const apptId = `AVN-QUEUE-${String(i + 1).padStart(3, '0')}`;
        const exists = await prisma.appointments.findUnique({ where: { appointment_id: apptId } });
        if (exists) continue;

        await prisma.appointments.create({
            data: {
                appointment_id:   apptId,
                patient_id:       bulkPatients[170 + i].patient_id,
                doctor_name:      DOCTORS[i % DOCTORS.length].name,
                department:       DOCTORS[i % DOCTORS.length].specialty,
                status:           QUEUE_STATUS[i],
                reason_for_visit: pick(REASONS, i + 10),
                appointment_date: todayAt(14 + i, 0),
                queue_token:      200 + i,
                organizationId:   orgId,
                booking_channel:  'walk_in',
                payment_status:   'PENDING',
            },
        });
    }
    console.log(`✓ Waiting queue: 6 queued/waiting appointments seeded`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TODAY'S REVENUE (invoices + payments) — target ₹8.5L+
    // ─────────────────────────────────────────────────────────────────────────
    const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'NEFT', 'Cash', 'UPI', 'UPI'];

    // OPD invoices (high-value day)
    const OPD_AMOUNTS = [
        1200, 850, 1500, 900, 2200, 750, 3500, 1100, 1800, 650,
        4200, 1350, 2800, 950, 1600, 2100, 3200, 1450, 2600, 890,
        5500, 1750, 2400, 1050, 3800, 1250, 4500, 2000, 1650, 3100,
        7200, 2500, 6800, 1900, 5200, 2300, 8500, 3400, 4800, 2700,
        12000, 6500, 9800, 4200, 7500, 5800, 11500, 8200, 6200, 9500,
    ];

    let totalRevenue = 0;
    let invoiceSeeded = 0;

    for (let i = 0; i < OPD_AMOUNTS.length; i++) {
        const amount = OPD_AMOUNTS[i];
        const pat = bulkPatients[i];
        const invNum = `AVN-OPD-D${String(i + 1).padStart(3, '0')}`;
        const rcptNum = `AVN-RCP-D${String(i + 1).padStart(3, '0')}`;

        const existing = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
        if (existing) continue;

        const inv = await prisma.invoices.create({
            data: {
                invoice_number:  invNum,
                patient_id:      pat.patient_id,
                invoice_type:    'OPD',
                is_fee_receipt:  true,
                total_amount:    amount,
                net_amount:      amount,
                paid_amount:     amount,
                balance_due:     0,
                status:          'Final',
                finalized_at:    todayAt(8 + Math.floor(i / 8)),
                created_at:      todayAt(8 + Math.floor(i / 8)),
                organizationId:  orgId,
                billing_patient_type: 'cash',
                doctor_name:     pick(DOCTORS, i).name,
            },
        });

        const existingRcpt = await prisma.payments.findUnique({ where: { receipt_number: rcptNum } });
        if (!existingRcpt) {
            await prisma.payments.create({
                data: {
                    receipt_number: rcptNum,
                    invoice_id:     inv.id,
                    amount,
                    payment_method: pick(PAYMENT_METHODS, i),
                    payment_type:   'Full Payment',
                    status:         'Completed',
                    received_by:    receptionist?.username ?? 'receptionist',
                    organizationId: orgId,
                    created_at:     todayAt(8 + Math.floor(i / 8)),
                },
            });
        }

        totalRevenue += amount;
        invoiceSeeded++;
    }

    // Top-up IPD-style invoices to push total past ₹8.5L
    const IPD_TOPUP = [
        { amount: 45000, label: 'IPD-TOPUP-01' },
        { amount: 68000, label: 'IPD-TOPUP-02' },
        { amount: 52000, label: 'IPD-TOPUP-03' },
        { amount: 89000, label: 'IPD-TOPUP-04' },
        { amount: 74000, label: 'IPD-TOPUP-05' },
        { amount: 63000, label: 'IPD-TOPUP-06' },
        { amount: 91000, label: 'IPD-TOPUP-07' },
        { amount: 57000, label: 'IPD-TOPUP-08' },
    ];

    for (let i = 0; i < IPD_TOPUP.length; i++) {
        const { amount, label } = IPD_TOPUP[i];
        const pat = bulkPatients[50 + i];
        const invNum = `AVN-${label}`;
        const rcptNum = `AVN-RCP-${label}`;

        const existing = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
        if (existing) continue;

        const inv = await prisma.invoices.create({
            data: {
                invoice_number:  invNum,
                patient_id:      pat.patient_id,
                invoice_type:    'IPD',
                total_amount:    amount,
                net_amount:      amount,
                paid_amount:     amount,
                balance_due:     0,
                status:          'Final',
                finalized_at:    todayAt(9 + i),
                created_at:      todayAt(9 + i),
                organizationId:  orgId,
                billing_patient_type: 'cash',
                doctor_name:     pick(DOCTORS, i).name,
            },
        });

        const existingRcpt = await prisma.payments.findUnique({ where: { receipt_number: rcptNum } });
        if (!existingRcpt) {
            await prisma.payments.create({
                data: {
                    receipt_number: rcptNum,
                    invoice_id:     inv.id,
                    amount,
                    payment_method: pick(['NEFT', 'Card', 'UPI', 'Cash'], i),
                    payment_type:   'Full Payment',
                    status:         'Completed',
                    received_by:    'finance',
                    organizationId: orgId,
                    created_at:     todayAt(9 + i),
                },
            });
        }

        totalRevenue += amount;
        invoiceSeeded++;
    }

    console.log(`✓ Revenue: ₹${(totalRevenue / 100000).toFixed(2)}L across ${invoiceSeeded} invoices`);

    // ─────────────────────────────────────────────────────────────────────────
    // 5. AUDIT TRAIL (dense recent activity)
    // ─────────────────────────────────────────────────────────────────────────
    const AUDIT_ROLES = ['admin', 'doctor', 'receptionist', 'nurse', 'pharmacist', 'finance'];
    const AUDIT_IPS   = ['192.168.1.101', '192.168.1.102', '192.168.1.103', '10.0.0.12'];

    const AUDIT_COUNT = 120;
    for (let i = 0; i < AUDIT_COUNT; i++) {
        const template = pick(AUDIT_ACTIONS, i);
        const minsAgo  = Math.floor(i * 2.5); // spread over last 5 hours
        await prisma.system_audit_logs.create({
            data: {
                username:    template.role,
                role:        template.role,
                action:      template.action,
                module:      template.module,
                entity_type: template.module,
                entity_id:   String(1000 + i),
                details:     `${template.detail} — ref #${1000 + i}`,
                ip_address:  pick(AUDIT_IPS, i),
                organizationId: orgId,
                created_at:  new Date(Date.now() - minsAgo * 60_000),
            },
        });
    }
    console.log(`✓ Audit trail: ${AUDIT_COUNT} log entries seeded`);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. BED OCCUPANCY — 85% (~40/48 beds), with Cleaning & Reserved states
    // ─────────────────────────────────────────────────────────────────────────
    const beds = await prisma.beds.findMany({
        where: { organizationId: orgId, bed_id: { startsWith: 'AVN-' } },
        orderBy: { bed_id: 'asc' },
    });

    if (beds.length === 0) {
        console.log('⚠  No AVN- beds found — run seed-aws.ts first');
    } else {
        // Reset all to Available first
        await prisma.beds.updateMany({
            where: { organizationId: orgId, bed_id: { startsWith: 'AVN-' } },
            data: { status: 'Available' },
        });

        // Target distribution for 48 beds:
        // Occupied: 40, Cleaning: 2, Reserved: 2, Available: 4
        const bedIds = beds.map(b => b.bed_id);

        // Mark last 4 as Available (already set above) — set the rest
        for (let i = 0; i < bedIds.length; i++) {
            let status: string;
            if (i < 40)      status = 'Occupied';
            else if (i < 42) status = 'Cleaning';
            else if (i < 44) status = 'Reserved';
            else             status = 'Available';

            await prisma.beds.update({
                where: { bed_id: bedIds[i] },
                data: { status },
            });
        }

        // Ensure ICU is heavily occupied (5/6 beds)
        const icuBeds = beds.filter(b => b.bed_id.startsWith('AVN-ICU-'));
        for (let i = 0; i < icuBeds.length; i++) {
            await prisma.beds.update({
                where: { bed_id: icuBeds[i].bed_id },
                data: { status: i < 5 ? 'Occupied' : 'Available' },
            });
        }

        console.log(`✓ Bed occupancy: 40 Occupied, 2 Cleaning, 2 Reserved, 4 Available (${beds.length} total)`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. ADMISSIONS (40 active admissions to match bed occupancy)
    // ─────────────────────────────────────────────────────────────────────────
    const occupiedBeds = await prisma.beds.findMany({
        where: { organizationId: orgId, bed_id: { startsWith: 'AVN-' }, status: 'Occupied' },
        include: { wards: true },
    });

    const DIAGNOSES_IPD = [
        'Acute Myocardial Infarction', 'Dengue Fever with Thrombocytopenia',
        'Community Acquired Pneumonia', 'Diabetic Ketoacidosis',
        'Post-Operative Care — Appendectomy', 'Chronic Kidney Disease Stage 3',
        'Ischemic Stroke with Hemiplegia', 'COPD Exacerbation',
        'Obstetric Case — Term Pregnancy', 'Septicaemia with Multiorgan Involvement',
        'Fracture Femur — Post-ORIF', 'Viral Hepatitis B',
        'Hypertensive Emergency', 'Acute Gastroenteritis with Dehydration',
    ];

    let admissionCreated = 0;
    for (let i = 0; i < Math.min(occupiedBeds.length, 40); i++) {
        const bed   = occupiedBeds[i];
        const pat   = bulkPatients[i % bulkPatients.length];
        const doc   = pick(DOCTORS, i);
        const admId = `demo-adm-${String(i + 1).padStart(3, '0')}`;

        const existing = await prisma.admissions.findFirst({
            where: { bed_id: bed.bed_id, status: 'Admitted', organizationId: orgId },
        });
        if (existing) continue;

        await prisma.admissions.create({
            data: {
                admission_id:    admId,
                patient_id:      pat.patient_id,
                bed_id:          bed.bed_id,
                ward_id:         bed.ward_id ?? undefined,
                status:          'Admitted',
                diagnosis:       pick(DIAGNOSES_IPD, i),
                doctor_name:     doc.name,
                attending_doctor_id: doctor?.id ?? undefined,
                admission_date:  daysAgo(rint(1, 8, i)),
                admission_type:  pick(['Emergency', 'Elective', 'Transfer'], i),
                billing_category: pick(['General', 'TPA', 'Corporate', 'Cash'], i),
                organizationId:  orgId,
            },
        });
        admissionCreated++;
    }
    console.log(`✓ Admissions: ${admissionCreated} active IPD admissions seeded`);

    // ─────────────────────────────────────────────────────────────────────────
    // 8. INSURANCE CLAIMS — 20 claims, SLA-engineered (80% green, 20% amber)
    //    Green:  sla_due_at ≥ now + 6 days  (>5 days remaining)
    //    Amber:  sla_due_at = now + 1–2 days (<2 days remaining)
    //    Red:    FORBIDDEN (sla_due_at < now)
    // ─────────────────────────────────────────────────────────────────────────
    const providers = await prisma.insurance_providers.findMany({
        where: { organizationId: orgId },
    });

    if (providers.length === 0) {
        console.log('⚠  No insurance providers found — run seed-aws.ts first');
    } else {
        // We need invoices to link claims to. Fetch or create a set.
        const claimInvoices = await prisma.invoices.findMany({
            where: { organizationId: orgId, status: 'Final' },
            take: 25,
            orderBy: { id: 'desc' },
        });

        // Ensure insurance policies exist for the patients in those invoices
        const TOTAL_CLAIMS = 20;
        const GREEN_COUNT  = 16; // 80%
        const AMBER_COUNT  = 4;  // 20%

        let claimsSeeded = 0;
        for (let i = 0; i < TOTAL_CLAIMS; i++) {
            const provider   = pick(providers, i);
            const isAmber    = i >= GREEN_COUNT;
            const slaDaysOut = isAmber ? rint(1, 2, i) : rint(6, 20, i);
            const claimNum   = `CLM-DEMO-${String(i + 1).padStart(3, '0')}`;
            const policyNum  = `POL-DEMO-${provider.provider_code}-${String(2000 + i)}`;
            const claimAmt   = rint(25000, 95000, i + 40);

            const existing = await prisma.insurance_claims.findFirst({
                where: { claim_number: claimNum },
            });
            if (existing) continue;

            // Ensure a policy exists
            let policy = await prisma.insurance_policies.findFirst({
                where: { policy_number: policyNum },
            });

            const pat = bulkPatients[60 + i];

            if (!policy) {
                policy = await prisma.insurance_policies.create({
                    data: {
                        patient_id:    pat.patient_id,
                        provider_id:   provider.id,
                        policy_number: policyNum,
                        policy_holder: pick(PATIENT_NAMES_M, i),
                        plan_name:     `${provider.provider_name} Premium Health Shield`,
                        coverage_limit:  500000,
                        remaining_limit: 400000,
                        status:        'Active',
                        organizationId: orgId,
                    },
                });
            }

            // Use an existing invoice if available, else skip allocation
            const inv = claimInvoices[i % claimInvoices.length];

            await prisma.insurance_claims.create({
                data: {
                    claim_number:   claimNum,
                    policy_id:      policy.id,
                    invoice_id:     inv.id,
                    claimed_amount: claimAmt,
                    approved_amount: isAmber ? claimAmt - 2000 : null,
                    status:         isAmber ? 'Approved' : 'Submitted',
                    organizationId: orgId,
                    submitted_at:   daysAgo(rint(2, 10, i)),
                    sla_due_at:     daysFromNow(slaDaysOut),
                    resubmission_count: 0,
                },
            });
            claimsSeeded++;
        }
        console.log(`✓ Insurance claims: ${claimsSeeded} seeded — ${GREEN_COUNT} green SLA, ${AMBER_COUNT} amber SLA, 0 red`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. INSURANCE RECEIPTS — past settlements showing ₹24.5L+ approved total
    // ─────────────────────────────────────────────────────────────────────────
    const RECEIPT_BATCHES = [
        { provider: 'STAR',  amounts: [185000, 92000, 145000, 210000, 78000] },
        { provider: 'HDFC',  amounts: [220000, 165000, 98000, 175000, 130000] },
        { provider: 'ICICI', amounts: [145000, 88000, 195000, 110000, 155000] },
        { provider: 'BAJAJ', amounts: [95000, 168000, 125000, 85000, 148000] },
    ];

    let totalSettled = 0;
    let receiptsSeeded = 0;
    const invoicesForAlloc = await prisma.invoices.findMany({
        where: { organizationId: orgId, status: 'Final' },
        take: 80,
        orderBy: { id: 'asc' },
    });

    for (const batch of RECEIPT_BATCHES) {
        const prov = providers.find(p => p.provider_code === batch.provider);
        if (!prov) continue;

        for (let i = 0; i < batch.amounts.length; i++) {
            const amount     = batch.amounts[i];
            const rcptNum    = `AVN-IRC-${batch.provider}-${String(i + 1).padStart(3, '0')}`;
            const refNum     = `UTR${uid()}${uid()}`;
            const daysBack   = rint(5, 45, i + receiptsSeeded);

            const existing = await prisma.insuranceReceipt.findFirst({
                where: { organizationId: orgId, receipt_number: rcptNum },
            });
            if (existing) continue;

            const receipt = await prisma.insuranceReceipt.create({
                data: {
                    receipt_number:   rcptNum,
                    payer_type:       'tpa_insurance',
                    provider_id:      prov.id,
                    instrument:       pick(['NEFT', 'RTGS', 'NEFT', 'NEFT'], i),
                    reference_number: refNum,
                    receipt_date:     daysAgo(daysBack),
                    total_amount:     amount,
                    allocated_amount: amount,
                    unmapped_amount:  0,
                    claim_amount:     Math.round(amount * 1.05),
                    sanctioned_amount: amount,
                    service_charge:   Math.round(amount * 0.02),
                    tds_total:        Math.round(amount * 0.01),
                    status:           'Allocated',
                    organizationId:   orgId,
                    created_at:       daysAgo(daysBack),
                },
            });

            // Allocate to an invoice
            const inv = invoicesForAlloc[(receiptsSeeded + i) % invoicesForAlloc.length];
            if (inv) {
                await prisma.insuranceReceiptAllocation.create({
                    data: {
                        receipt_id:        receipt.id,
                        invoice_id:        inv.id,
                        allocated_amount:  amount,
                        disallowed_amount: Math.round(amount * 0.03),
                        tds_amount:        Math.round(amount * 0.01),
                        organizationId:    orgId,
                    },
                });
            }

            totalSettled += amount;
        }
        receiptsSeeded += batch.amounts.length;
    }
    console.log(`✓ Insurance receipts: ₹${(totalSettled / 100000).toFixed(2)}L settled across ${receiptsSeeded} receipts`);

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    const t = (n: number) => `₹${(n / 100000).toFixed(2)}L`;
    console.log('\n====================================================');
    console.log('🎉  DEMO SEED COMPLETE');
    console.log('====================================================');
    console.log(`  Revenue today     : ${t(totalRevenue)}`);
    console.log(`  Appointments today: 170 bulk + 6 queued/waiting`);
    console.log(`  Audit logs        : 120 recent entries`);
    console.log(`  Bed occupancy     : 40/48 (83%) — 2 Cleaning, 2 Reserved`);
    console.log(`  Active admissions : ${admissionCreated}`);
    console.log(`  Insurance claims  : 20 (16 green SLA, 4 amber, 0 red)`);
    console.log(`  TPA settlements   : ${t(totalSettled)} approved total`);
    console.log(`  Demo patient      : ${DEMO_PATIENT_NAME} (${DEMO_PATIENT_ID})`);
    console.log(`                      4 historical visits visible in Quick Stats`);
    console.log('====================================================\n');
}

main()
    .catch(err => { console.error('Seed error:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
