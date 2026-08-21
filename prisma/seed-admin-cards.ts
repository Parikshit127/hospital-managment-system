/**
 * HospitalOS — Admin Dashboard Cards Seed Script
 *
 * Targets:
 *  1. Lab Queue Card        → 14 Pending lab orders + 28 Completed lab orders today
 *  2. Inventory Alerts Card → 6 Low Stock batches (stock <= 10) + 5 Expiring Soon batches (< 30 days)
 *  3. Patient Flow (7 Days) → Authentic OPD_REG patient registrations spread across the last 7 days
 *
 * Usage:
 *   ALLOW_SEED=1 npx tsx prisma/seed-admin-cards.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────────
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];
const daysAgo = (n: number, h = 10, m = 0): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, m, 0, 0);
    return d;
};
const daysFromNow = (n: number, h = 12): Date => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(h, 0, 0, 0);
    return d;
};
const todayAt = (h: number, m = 0): Date => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
};

// ── Patient Names & Cities for 7-Day Flow ──────────────────────────────────────
const FIRST_NAMES_M = [
    'Aarav', 'Vihaan', 'Aditya', 'Reyansh', 'Muhammad', 'Sai', 'Arjun', 'Kabir',
    'Rohan', 'Vivaan', 'Atharv', 'Aryan', 'Ishaan', 'Dhruv', 'Ananya', 'Shaurya',
    'Shivansh', 'Devansh', 'Utkarsh', 'Rudra', 'Pranav', 'Samar', 'Laksh', 'Yash',
];
const FIRST_NAMES_F = [
    'Saanvi', 'Aanya', 'Aadhya', 'Aarohi', 'Ananya', 'Pari', 'Diya', 'Myra',
    'Avani', 'Sara', 'Prisha', 'Ira', 'Riya', 'Navya', 'Siya', 'Shanaya',
    'Kavya', 'Ahana', 'Tanvi', 'Veda', 'Meera', 'Aditi', 'Tara', 'Anika',
];
const LAST_NAMES = [
    'Sharma', 'Verma', 'Gupta', 'Patel', 'Singh', 'Kumar', 'Reddy', 'Mehta',
    'Nair', 'Iyer', 'Joshi', 'Bose', 'Deshmukh', 'Mishra', 'Chopra', 'Malhotra',
    'Yadav', 'Tiwari', 'Bhatia', 'Pandey', 'Saxena', 'Kapoor', 'Rao', 'Desai',
];
const CITIES = ['Gurugram', 'Delhi', 'Noida', 'Faridabad', 'Ghaziabad', 'Manesar', 'Sonipat'];
const BLOOD_GROUPS = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-'];

// ── Diagnostic Tests for Lab Queue ─────────────────────────────────────────────
const LAB_TEST_TYPES = [
    { name: 'Complete Blood Count (CBC)', normal: 'Hb: 14.2 g/dL, TLC: 6,800/mcL, Platelets: 2.3 Lakh/mcL' },
    { name: 'Lipid Profile', normal: 'Cholesterol: 178 mg/dL, HDL: 46 mg/dL, LDL: 104 mg/dL, Triglycerides: 140 mg/dL' },
    { name: 'Liver Function Test (LFT)', normal: 'Bilirubin: 0.8 mg/dL, SGOT: 28 U/L, SGPT: 32 U/L, Alk Phos: 95 U/L' },
    { name: 'Kidney Function Test (KFT)', normal: 'Creatinine: 0.9 mg/dL, Urea: 24 mg/dL, Uric Acid: 4.8 mg/dL' },
    { name: 'Thyroid Profile (T3/T4/TSH)', normal: 'T3: 1.2 ng/mL, T4: 8.4 ug/dL, TSH: 2.15 uIU/mL (Euthyroid)' },
    { name: 'HbA1c (Glycosylated Hemoglobin)', normal: 'HbA1c: 5.6% (Non-Diabetic Range)' },
    { name: 'Dengue NS1 Antigen & IgM/IgG', normal: 'NS1 Antigen: Negative, Dengue IgM: Negative, IgG: Negative' },
    { name: 'Serum Electrolytes (Na/K/Cl)', normal: 'Sodium: 139 mEq/L, Potassium: 4.2 mEq/L, Chloride: 101 mEq/L' },
    { name: 'Urine Routine & Microscopy', normal: 'Color: Pale Yellow, pH: 6.0, Protein: Nil, Sugar: Nil, Pus Cells: 1-2 /HPF' },
    { name: 'Chest X-Ray PA View', normal: 'Bilateral lung fields clear, normal bronchovascular markings, CTR < 50%' },
    { name: '12-Lead Electrocardiogram (ECG)', normal: 'Normal sinus rhythm, HR: 74 bpm, No ST-T segment elevation' },
    { name: 'C-Reactive Protein (CRP)', normal: 'CRP Quantitative: 2.1 mg/L (Normal < 5.0 mg/L)' },
    { name: 'Serum Vitamin D3 (25-OH)', normal: '25-Hydroxy Vitamin D: 36.5 ng/mL (Sufficient Range: 30-100 ng/mL)' },
    { name: 'Serum Vitamin B12', normal: 'Vitamin B12: 480 pg/mL (Normal Range: 211-911 pg/mL)' },
];

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Set ALLOW_SEED=1 to run in production');
        process.exit(1);
    }

    console.log('\n============================================================');
    console.log('🩺  AVANI HOSPITALS — ADMIN DASHBOARD CARDS SEED');
    console.log('============================================================\n');

    // ── 1. Resolve Organization ────────────────────────────────────────────────
    const org = await prisma.organization.findFirst({
        where: { OR: [{ slug: 'avani' }, { code: 'AVN' }] },
    });
    if (!org) {
        console.error('❌ Organization not found. Run seed-aws.ts first.');
        process.exit(1);
    }
    const orgId = org.id;
    console.log(`✓ Organization: ${org.name} (${orgId})\n`);

    // Fetch doctors and staff for attribution
    const doctors = await prisma.user.findMany({
        where: { organizationId: orgId, role: 'doctor', is_active: true },
        select: { id: true, name: true, username: true, specialty: true },
    });
    const labTech = await prisma.user.findFirst({
        where: { organizationId: orgId, role: 'lab_technician' },
    });
    const labTechId = labTech?.id || (doctors[0]?.id ?? 'doctor');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PATIENT FLOW (7 DAYS) — Authentic Registrations across Day -6 to Day 0
    //    getPatientFlow() queries: SELECT DATE("created_at") as day, COUNT(*) FROM "OPD_REG"
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 1. Seeding 7-Day Patient Flow (OPD Registrations) ---');
    // Daily registration targets to create an authentic ascending/curved trend
    const FLOW_TARGETS = [
        { daysBack: 6, count: 38, label: '6 days ago' },
        { daysBack: 5, count: 45, label: '5 days ago' },
        { daysBack: 4, count: 54, label: '4 days ago' },
        { daysBack: 3, count: 62, label: '3 days ago' },
        { daysBack: 2, count: 75, label: '2 days ago' },
        { daysBack: 1, count: 88, label: 'Yesterday' },
        { daysBack: 0, count: 45, label: 'Today (additions)' },
    ];

    let totalFlowSeeded = 0;
    const seededPatientIds: string[] = [];

    for (const target of FLOW_TARGETS) {
        let daySeeded = 0;
        for (let i = 0; i < target.count; i++) {
            const pid = `AVN-FLOW-D${target.daysBack}-${String(i + 1).padStart(3, '0')}`;
            const isFemale = (target.daysBack * 10 + i) % 2 === 0;
            const firstName = isFemale
                ? pick(FIRST_NAMES_F, target.daysBack * 7 + i)
                : pick(FIRST_NAMES_M, target.daysBack * 7 + i);
            const lastName = pick(LAST_NAMES, target.daysBack * 5 + i);
            const fullName = `${firstName} ${lastName}`;

            // Spread timestamps throughout the day (8:00 AM to 7:30 PM)
            const hour = 8 + Math.floor((i / target.count) * 11);
            const minute = (i * 17) % 60;
            const createdAt = daysAgo(target.daysBack, hour, minute);

            const existing = await prisma.oPD_REG.findUnique({ where: { patient_id: pid } });
            if (!existing) {
                await prisma.oPD_REG.create({
                    data: {
                        patient_id:     pid,
                        full_name:      fullName,
                        phone:          `+91 9${String(8100000000 + target.daysBack * 100000 + i * 997).slice(0, 9)}`,
                        gender:         isFemale ? 'Female' : 'Male',
                        date_of_birth:  `${1965 + ((target.daysBack + i) % 45)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
                        blood_group:    pick(BLOOD_GROUPS, i + target.daysBack),
                        city:           pick(CITIES, i + target.daysBack),
                        address:        `House ${10 + i}, Sector ${14 + (i % 40)}, ${pick(CITIES, i + target.daysBack)}`,
                        organizationId: orgId,
                        created_at:     createdAt,
                    },
                });
                daySeeded++;
            }
            seededPatientIds.push(pid);
        }
        totalFlowSeeded += daySeeded;
        console.log(`  ✓ ${target.label} (Day -${target.daysBack}): ${daySeeded} registrations seeded with timestamp ${daysAgo(target.daysBack, 10).toLocaleDateString('en-IN')}`);
    }
    console.log(`✓ Total Patient Flow: ${totalFlowSeeded} OPD_REG records seeded across 7 days\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. LAB QUEUE CARD — 14 Pending orders + 28 Completed orders today
    //    getDashboardStats() queries:
    //      pendingLabOrders: lab_orders.count({ where: { status: "Pending" } })
    //      completedLabToday: lab_orders.count({ where: { status: "Completed", created_at: { gte: today } } })
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 2. Seeding Lab Queue (14 Pending + 28 Completed Today) ---');

    // Pool of patients for lab orders
    const allPatients = await prisma.oPD_REG.findMany({
        where: { organizationId: orgId },
        select: { patient_id: true, full_name: true },
        take: 100,
    });
    const patientPool = allPatients.length > 0
        ? allPatients
        : [{ patient_id: 'AVN-2026-99001', full_name: 'Rahul Mehta' }];

    // 14 PENDING Lab Orders (in active queue right now)
    let pendingCount = 0;
    for (let i = 0; i < 14; i++) {
        const barcode = `AVN-LAB-Q-PND-${String(i + 1).padStart(3, '0')}`;
        const patient = pick(patientPool, i);
        const doctor  = pick(doctors, i);
        const test    = pick(LAB_TEST_TYPES, i);
        const orderTime = todayAt(9 + Math.floor(i / 2), (i * 23) % 55);

        const existing = await prisma.lab_orders.findUnique({ where: { barcode } });
        if (!existing) {
            await prisma.lab_orders.create({
                data: {
                    barcode,
                    patient_id:             patient.patient_id,
                    doctor_id:              doctor?.id || 'doctor',
                    test_type:              test.name,
                    status:                 'Pending',
                    assigned_technician_id: labTechId,
                    technician_remarks:     'Sample received at collection center; in processing queue',
                    is_critical:            false,
                    organizationId:         orgId,
                    created_at:             orderTime,
                },
            });
            pendingCount++;
        }
    }
    console.log(`  ✓ Lab Queue Pending: ${pendingCount} orders in queue (Target: 14)`);

    // 28 COMPLETED Lab Orders (processed & reported today)
    let completedCount = 0;
    for (let i = 0; i < 28; i++) {
        const barcode = `AVN-LAB-Q-CMP-${String(i + 1).padStart(3, '0')}`;
        const patient = pick(patientPool, i + 15);
        const doctor  = pick(doctors, i + 2);
        const test    = pick(LAB_TEST_TYPES, i + 3);
        const orderTime = todayAt(8 + Math.floor(i / 3), (i * 13) % 50);

        const existing = await prisma.lab_orders.findUnique({ where: { barcode } });
        if (!existing) {
            await prisma.lab_orders.create({
                data: {
                    barcode,
                    patient_id:             patient.patient_id,
                    doctor_id:              doctor?.id || 'doctor',
                    test_type:              test.name,
                    status:                 'Completed',
                    result_value:           test.normal,
                    technician_remarks:     'Verified & signed off by Senior Technologist Amit Patel',
                    report_url:             `/reports/lab/${barcode}.pdf`,
                    assigned_technician_id: labTechId,
                    is_critical:            false,
                    organizationId:         orgId,
                    created_at:             orderTime,
                },
            });
            completedCount++;
        }
    }
    console.log(`  ✓ Lab Done Today: ${completedCount} orders completed today (Target: 28)`);
    console.log(`✓ Lab Queue Card will show: 14 in Queue · 28 done today (Green Indicator)\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. INVENTORY ALERTS CARD — Low Stock (<= 10) + Expiring Soon (< 30 days)
    //    getInventoryAlerts() queries:
    //      lowStock: pharmacy_batch_inventory.findMany({ where: { current_stock: { lte: 10 } } })
    //      expiringSoon: pharmacy_batch_inventory.findMany({ where: { expiry_date: { lte: now + 30d } } })
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 3. Seeding Inventory Alerts (Low Stock + Expiring Soon) ---');

    // 6 Medicines with Low Stock (< 10 units left)
    const LOW_STOCK_ITEMS = [
        { brand: 'Augmentin 625', generic: 'Amoxicillin 500mg + Clavulanate 125mg', batch: 'AUG-2026-LS1', stock: 4, mrp: 185, unit: 'Tablet', expMonths: 14 },
        { brand: 'Pan 40',        generic: 'Pantoprazole 40mg',                    batch: 'PAN-2026-LS2', stock: 6, mrp: 95,  unit: 'Tablet', expMonths: 18 },
        { brand: 'Azithral 500',  generic: 'Azithromycin 500mg',                   batch: 'AZI-2026-LS3', stock: 3, mrp: 220, unit: 'Tablet', expMonths: 12 },
        { brand: 'Montair-LC',    generic: 'Montelukast 10mg + Levocetirizine 5mg',batch: 'MON-2026-LS4', stock: 7, mrp: 160, unit: 'Tablet', expMonths: 16 },
        { brand: 'Dynapar AQ Inj',generic: 'Diclofenac Sodium 75mg/1ml',           batch: 'DYN-2026-LS5', stock: 5, mrp: 35,  unit: 'Vial',   expMonths: 10 },
        { brand: 'Monocef 1g Inj',generic: 'Ceftriaxone Sodium 1g',                batch: 'MNC-2026-LS6', stock: 8, mrp: 65,  unit: 'Vial',   expMonths: 20 },
    ];

    let lowStockSeeded = 0;
    for (const item of LOW_STOCK_ITEMS) {
        // Ensure medicine master exists
        let med = await prisma.pharmacy_medicine_master.findFirst({
            where: { brand_name: item.brand, organizationId: orgId },
        });
        if (!med) {
            med = await prisma.pharmacy_medicine_master.create({
                data: {
                    brand_name:     item.brand,
                    generic_name:   item.generic,
                    category:       'Essential',
                    mrp:            item.mrp,
                    selling_price:  item.mrp,
                    min_threshold:  15,
                    organizationId: orgId,
                },
            });
        }

        // Upsert batch with low stock
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + item.expMonths);

        await prisma.pharmacy_batch_inventory.upsert({
            where: { medicine_id_batch_no: { medicine_id: med.id, batch_no: item.batch } },
            update: { current_stock: item.stock, expiry_date: expiryDate },
            create: {
                medicine_id:   med.id,
                batch_no:      item.batch,
                current_stock: item.stock,
                expiry_date:   expiryDate,
                mrp:           item.mrp,
                cost_price:    Math.round(item.mrp * 0.7),
                rack_location: `Rack-${pick(['A1', 'B2', 'C3', 'D4'], lowStockSeeded)}`,
                supplier_name: 'Avani Central Medical Supplies',
            },
        });
        lowStockSeeded++;
        console.log(`  ✓ Low Stock: ${item.brand} (Batch: ${item.batch}) → ${item.stock} left in stock (Trigger: <= 10)`);
    }

    // 5 Medicines Expiring Soon (< 30 days from now)
    const EXPIRING_SOON_ITEMS = [
        { brand: 'Combiflam',            generic: 'Ibuprofen 400mg + Paracetamol 325mg', batch: 'CMB-EXP-0828', daysOut: 7,  stock: 45, mrp: 45 },
        { brand: 'Shelcal 500',          generic: 'Calcium 500mg + Vitamin D3 250 IU',   batch: 'SHL-EXP-0904', daysOut: 14, stock: 60, mrp: 75 },
        { brand: 'Becosules',            generic: 'Vitamin B-Complex with Vitamin C',     batch: 'BEC-EXP-0911', daysOut: 21, stock: 80, mrp: 40 },
        { brand: 'Livogen Z',            generic: 'Ferrous Fumarate + Folic Acid + Zinc', batch: 'LIV-EXP-0918', daysOut: 28, stock: 35, mrp: 65 },
        { brand: 'Deriphyllin Retard 150', generic: 'Theophylline + Etofylline 150mg',    batch: 'DRP-EXP-0902', daysOut: 12, stock: 50, mrp: 35 },
    ];

    let expiringSeeded = 0;
    for (const item of EXPIRING_SOON_ITEMS) {
        // Ensure medicine master exists
        let med = await prisma.pharmacy_medicine_master.findFirst({
            where: { brand_name: item.brand, organizationId: orgId },
        });
        if (!med) {
            med = await prisma.pharmacy_medicine_master.create({
                data: {
                    brand_name:     item.brand,
                    generic_name:   item.generic,
                    category:       'Essential',
                    mrp:            item.mrp,
                    selling_price:  item.mrp,
                    min_threshold:  15,
                    organizationId: orgId,
                },
            });
        }

        const expiryDate = daysFromNow(item.daysOut);

        await prisma.pharmacy_batch_inventory.upsert({
            where: { medicine_id_batch_no: { medicine_id: med.id, batch_no: item.batch } },
            update: { current_stock: item.stock, expiry_date: expiryDate },
            create: {
                medicine_id:   med.id,
                batch_no:      item.batch,
                current_stock: item.stock,
                expiry_date:   expiryDate,
                mrp:           item.mrp,
                cost_price:    Math.round(item.mrp * 0.7),
                rack_location: `Rack-EXP-${expiringSeeded + 1}`,
                supplier_name: 'Avani Central Medical Supplies',
            },
        });
        expiringSeeded++;
        console.log(`  ✓ Expiring Soon: ${item.brand} (Batch: ${item.batch}) → Expires in ${item.daysOut} days (${expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`);
    }

    console.log(`✓ Inventory Alerts Card: ${lowStockSeeded} Low Stock items + ${expiringSeeded} Expiring Soon items seeded\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('============================================================');
    console.log('🎉  ALL DASHBOARD CARDS SEED COMPLETED SUCCESSFULLY');
    console.log('============================================================');
    console.log('  1. Lab Queue Card:');
    console.log('     • Pending Queue: 14 orders');
    console.log('     • Done Today: 28 completed tests (Green up indicator)');
    console.log('  2. Inventory Alerts Card:');
    console.log('     • Low Stock (<= 10): 6 medicines (Augmentin, Pan 40, Azithral, Montair, Dynapar, Monocef)');
    console.log('     • Expiring Soon (< 30d): 5 medicines (Combiflam, Shelcal, Becosules, Livogen, Deriphyllin)');
    console.log('  3. Patient Flow (7 Days) Card:');
    console.log('     • 7 distinct daily bars populated from Day -6 to Today');
    console.log('     • Authentic ascending flow of registrations');
    console.log('============================================================\n');
}

main()
    .catch((err) => {
        console.error('Seed error:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
