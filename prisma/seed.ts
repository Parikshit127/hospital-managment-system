
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    const password = await bcrypt.hash('password123', 10);

    // 1. Users (including new roles)
    const users = [
        { username: 'admin', role: 'admin', name: 'Super Admin', specialty: null },
        { username: 'doc1', role: 'doctor', name: 'Dr. Sarah Smith', specialty: 'General Medicine' },
        { username: 'doc2', role: 'doctor', name: 'Dr. Rajesh Kumar', specialty: 'Cardiology' },
        { username: 'doc3', role: 'doctor', name: 'Dr. Priya Sharma', specialty: 'Orthopedics' },
        { username: 'doc4', role: 'doctor', name: 'Dr. Anil Gupta', specialty: 'Pediatrics' },
        { username: 'doc5', role: 'doctor', name: 'Dr. Meena Patel', specialty: 'Neurology' },
        { username: 'recep1', role: 'receptionist', name: 'Ravi Receptionist', specialty: null },
        { username: 'lab1', role: 'lab_technician', name: 'Amit Lab Tech', specialty: null },
        { username: 'pharm1', role: 'pharmacist', name: 'Priya Pharmacist', specialty: null },
        { username: 'finance1', role: 'finance', name: 'Ankit Finance', specialty: null },
        { username: 'ipd1', role: 'ipd_manager', name: 'Neha IPD Manager', specialty: null },
    ];

    for (const u of users) {
        const user = await prisma.user.upsert({
            where: { username: u.username },
            update: { specialty: u.specialty },
            create: {
                username: u.username,
                password,
                role: u.role,
                name: u.name,
                specialty: u.specialty,
            },
        });
        console.log(`Created user: ${user.username} (${u.role}${u.specialty ? ' - ' + u.specialty : ''})`);
    }

    // 2. Lab Inventory
    const tests = [
        { test_name: 'Lipid Profile', price: 500, is_available: true },
        { test_name: 'Complete Blood Count (CBC)', price: 300, is_available: true },
        { test_name: 'Dengue NS1 Antigen', price: 600, is_available: true },
        { test_name: 'Liver Function Test', price: 800, is_available: true },
        { test_name: 'Kidney Function Test', price: 700, is_available: true },
        { test_name: 'Thyroid Profile (T3/T4/TSH)', price: 900, is_available: true },
        { test_name: 'HbA1c', price: 450, is_available: true },
        { test_name: 'Chest X-Ray', price: 350, is_available: true },
    ];

    for (const t of tests) {
        await prisma.lab_test_inventory.upsert({
            where: { test_name: t.test_name },
            update: {},
            create: t,
        });
    }
    console.log('Seeded Lab Tests');

    // 3. Lab Staff
    try {
        const existingStaff = await prisma.lab_staff.count();
        if (existingStaff === 0) {
            const staff = [
                { name: 'Amit Singh', role: 'technician', is_on_shift: true },
                { name: 'Rahul Verma', role: 'technician', is_on_shift: true },
            ];
            for (const s of staff) {
                await prisma.lab_staff.create({ data: s });
            }
            console.log('Seeded Lab Staff');
        }
    } catch (e) {
        console.log('Lab staff might already exist, skipping...');
    }

    // 4. Pharmacy Master
    const medicines = [
        { brand_name: 'Dolo 650', generic_name: 'Paracetamol', price_per_unit: 2.0, min_threshold: 50 },
        { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanate', price_per_unit: 15.0, min_threshold: 20 },
        { brand_name: 'Azithral 500', generic_name: 'Azithromycin', price_per_unit: 10.0, min_threshold: 15 },
        { brand_name: 'Pan 40', generic_name: 'Pantoprazole', price_per_unit: 5.0, min_threshold: 30 },
        { brand_name: 'Crocin Advance', generic_name: 'Paracetamol + Caffeine', price_per_unit: 3.0, min_threshold: 40 },
        { brand_name: 'Metformin 500', generic_name: 'Metformin HCl', price_per_unit: 4.0, min_threshold: 25 },
    ];

    for (const m of medicines) {
        const med = await prisma.pharmacy_medicine_master.upsert({
            where: { brand_name: m.brand_name },
            update: {},
            create: m,
        });

        await prisma.pharmacy_batch_inventory.upsert({
            where: { batch_no: `BATCH-${m.brand_name.substring(0, 3).toUpperCase()}-001` },
            update: {},
            create: {
                medicine_id: med.id,
                batch_no: `BATCH-${m.brand_name.substring(0, 3).toUpperCase()}-001`,
                current_stock: 100,
                expiry_date: new Date('2027-12-31'),
                rack_location: 'A-01',
            },
        });
    }
    console.log('Seeded Medicines & Inventory');

    // =============================================
    // 5. WARDS & BEDS (IPD Infrastructure)
    // =============================================
    const wardsData = [
        { ward_name: 'General Ward', ward_type: 'General', cost_per_day: 500, nursing_charge: 200 },
        { ward_name: 'ICU', ward_type: 'ICU', cost_per_day: 5000, nursing_charge: 1500 },
        { ward_name: 'Private Room', ward_type: 'Private', cost_per_day: 3000, nursing_charge: 500 },
        { ward_name: 'Maternity Ward', ward_type: 'Maternity', cost_per_day: 1500, nursing_charge: 400 },
        { ward_name: 'Pediatric Ward', ward_type: 'Pediatric', cost_per_day: 1200, nursing_charge: 350 },
        { ward_name: 'Isolation Ward', ward_type: 'Isolation', cost_per_day: 4000, nursing_charge: 1000 },
    ];

    for (const w of wardsData) {
        const existingWard = await prisma.wards.findFirst({ where: { ward_name: w.ward_name } });
        if (!existingWard) {
            const ward = await prisma.wards.create({ data: w });

            const bedCount = w.ward_type === 'ICU' ? 6 :
                             w.ward_type === 'Private' ? 8 :
                             w.ward_type === 'Isolation' ? 4 : 10;

            const prefix = w.ward_name.split(' ')[0].toUpperCase().substring(0, 3);

            for (let i = 1; i <= bedCount; i++) {
                const bedId = `${prefix}-${String(i).padStart(2, '0')}`;
                await prisma.beds.upsert({
                    where: { bed_id: bedId },
                    update: {},
                    create: {
                        bed_id: bedId,
                        ward_id: ward.ward_id,
                        status: 'Available',
                    },
                });
            }

            console.log(`Created ward: ${w.ward_name} with ${bedCount} beds`);
        } else {
            console.log(`Ward already exists: ${w.ward_name}`);
        }
    }

    // =============================================
    // 6. CHARGE CATALOG (Service Rates)
    // =============================================
    const catalogItems = [
        { category: 'ConsultationCharge', item_code: 'CON-GEN', item_name: 'General Consultation', default_price: 500, department: 'General' },
        { category: 'ConsultationCharge', item_code: 'CON-SPE', item_name: 'Specialist Consultation', default_price: 1000, department: 'General' },
        { category: 'ConsultationCharge', item_code: 'CON-EMR', item_name: 'Emergency Consultation', default_price: 1500, department: 'Emergency' },
        { category: 'RoomCharge', item_code: 'RM-GEN', item_name: 'General Ward - Room Charge', default_price: 500, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-ICU', item_name: 'ICU - Room Charge', default_price: 5000, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-PVT', item_name: 'Private Room - Room Charge', default_price: 3000, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-MAT', item_name: 'Maternity Ward - Room Charge', default_price: 1500, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-PED', item_name: 'Pediatric Ward - Room Charge', default_price: 1200, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-ISO', item_name: 'Isolation Ward - Room Charge', default_price: 4000, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-GEN', item_name: 'General Nursing (per day)', default_price: 200, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-ICU', item_name: 'ICU Nursing (per day)', default_price: 1500, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-SPE', item_name: 'Special Nursing (per day)', default_price: 500, department: 'IPD' },
        { category: 'DoctorVisitCharge', item_code: 'DV-RND', item_name: 'Doctor Round Visit', default_price: 300, department: 'IPD' },
        { category: 'DoctorVisitCharge', item_code: 'DV-SPE', item_name: 'Specialist Visit', default_price: 800, department: 'IPD' },
        { category: 'ProcedureCharge', item_code: 'PRC-MIN', item_name: 'Minor Procedure', default_price: 2000, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-MAJ', item_name: 'Major Procedure', default_price: 15000, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-SUR', item_name: 'Surgical Procedure', default_price: 50000, department: 'Surgery' },
        { category: 'ProcedureCharge', item_code: 'PRC-DRS', item_name: 'Dressing & Wound Care', default_price: 200, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-IV', item_name: 'IV Fluid Set', default_price: 150, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-SYR', item_name: 'Syringe Kit', default_price: 50, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-OXY', item_name: 'Oxygen Mask + Tubing', default_price: 300, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-CTH', item_name: 'Urinary Catheter', default_price: 250, department: 'General' },
    ];

    for (const item of catalogItems) {
        await prisma.charge_catalog.upsert({
            where: { item_code: item.item_code },
            update: { default_price: item.default_price },
            create: item,
        });
    }
    console.log('Seeded Charge Catalog (' + catalogItems.length + ' items)');

    // =============================================
    // 7. INSURANCE PROVIDERS (TPAs)
    // =============================================
    const insuranceProviders = [
        { provider_name: 'Star Health Insurance', provider_code: 'STAR', contact_email: 'claims@starhealth.in', contact_phone: '1800-425-2255' },
        { provider_name: 'HDFC Ergo', provider_code: 'HDFC', contact_email: 'claims@hdfcergo.com', contact_phone: '1800-266-0700' },
        { provider_name: 'ICICI Lombard', provider_code: 'ICICI', contact_email: 'claims@icicilombard.com', contact_phone: '1800-266-9725' },
        { provider_name: 'Bajaj Allianz', provider_code: 'BAJAJ', contact_email: 'claims@bajajallianz.co.in', contact_phone: '1800-209-5858' },
        { provider_name: 'New India Assurance', provider_code: 'NIA', contact_email: 'claims@newindia.co.in', contact_phone: '1800-209-1415' },
        { provider_name: 'Niva Bupa (Max Bupa)', provider_code: 'NIVA', contact_email: 'claims@nivabupa.com', contact_phone: '1800-200-7000' },
        { provider_name: 'Care Health (Religare)', provider_code: 'CARE', contact_email: 'claims@careinsurance.com', contact_phone: '1800-102-4488' },
    ];

    for (const p of insuranceProviders) {
        await prisma.insurance_providers.upsert({
            where: { provider_code: p.provider_code },
            update: {},
            create: p,
        });
    }
    console.log('Seeded Insurance Providers (' + insuranceProviders.length + ' providers)');

    console.log('\n=== Seeding Complete ===');
    console.log('New users: finance1 (Finance), ipd1 (IPD Manager) - password: password123');
    console.log('Wards: 6 wards with 48 beds total');
    console.log('Charge Catalog: ' + catalogItems.length + ' service rate items');
    console.log('Insurance: ' + insuranceProviders.length + ' TPA providers');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
