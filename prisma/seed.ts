
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEFAULT_ORG_ID = 'org-avani-default';

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Refusing to seed in production. Set ALLOW_SEED=1 to override.');
        process.exit(1);
    }

    console.log('Start seeding ...');

    const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';
    if (seedPassword === 'password123') {
        console.warn('WARNING: Using default seed password. Set SEED_ADMIN_PASSWORD env var for production.');
    }
    const password = await bcrypt.hash(seedPassword, 10);

    // =============================================
    // 0. DEFAULT ORGANIZATION + CONFIG + BRANDING
    // =============================================
    const org = await prisma.organization.upsert({
        where: { id: DEFAULT_ORG_ID },
        update: { name: 'Avani Hospital', slug: 'avani', code: 'AVN' },
        create: {
            id: DEFAULT_ORG_ID,
            name: 'Avani Hospital',
            slug: 'avani',
            code: 'AVN',
            address: '123 Health Avenue, Medical District',
            phone: '+91 80000 00000',
            email: 'admin@avanihospital.com',
            license_no: 'MH-MED-2024-001',
            plan: 'enterprise',
            is_active: true,
        },
    });
    console.log(`Organization: ${org.name} (${org.id})`);

    await prisma.organizationConfig.upsert({
        where: { organizationId: DEFAULT_ORG_ID },
        update: {},
        create: {
            organizationId: DEFAULT_ORG_ID,
            uhid_prefix: 'AVN',
            enable_ai_triage: true,
        },
    });
    console.log('Organization config created');

    await prisma.organizationBranding.upsert({
        where: { organizationId: DEFAULT_ORG_ID },
        update: {},
        create: {
            organizationId: DEFAULT_ORG_ID,
            portal_title: 'Avani Hospital',
            portal_subtitle: 'Intelligence Platform',
            primary_color: '#10b981',
            secondary_color: '#0f172a',
        },
    });
    console.log('Organization branding created');

    // =============================================
    // 0.1 SUPER ADMIN
    // =============================================
    const saPassword = await bcrypt.hash(process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin123', 10);
    await prisma.superAdmin.upsert({
        where: { email: 'superadmin@hospitalos.com' },
        update: {},
        create: {
            email: 'superadmin@hospitalos.com',
            password: saPassword,
            name: 'Platform Admin',
            is_active: true,
        },
    });
    console.log('Super Admin created (email: superadmin@hospitalos.com, password: superadmin123)');

    // =============================================
    // 1. USERS (with organizationId)
    // =============================================
    const users = [
        { username: 'admin', role: 'admin', name: 'Super Admin', specialty: null, email: 'admin@avanihospital.com', phone: '+91 98000 00001' },
        { username: 'doc1', role: 'doctor', name: 'Dr. Sarah Smith', specialty: 'General Medicine', email: 'sarah.smith@avanihospital.com', phone: '+91 98000 10001' },
        { username: 'doc2', role: 'doctor', name: 'Dr. Rajesh Kumar', specialty: 'Cardiology', email: 'rajesh.kumar@avanihospital.com', phone: '+91 98000 10002' },
        { username: 'doc3', role: 'doctor', name: 'Dr. Priya Sharma', specialty: 'Orthopedics', email: 'priya.sharma@avanihospital.com', phone: '+91 98000 10003' },
        { username: 'doc4', role: 'doctor', name: 'Dr. Anil Gupta', specialty: 'Pediatrics', email: 'anil.gupta@avanihospital.com', phone: '+91 98000 10004' },
        { username: 'doc5', role: 'doctor', name: 'Dr. Meena Patel', specialty: 'Neurology', email: 'meena.patel@avanihospital.com', phone: '+91 98000 10005' },
        { username: 'doc6', role: 'doctor', name: 'Dr. Vikram Rao', specialty: 'ENT', email: 'vikram.rao@avanihospital.com', phone: '+91 98000 10006' },
        { username: 'doc7', role: 'doctor', name: 'Dr. Sunita Joshi', specialty: 'Dermatology', email: 'sunita.joshi@avanihospital.com', phone: '+91 98000 10007' },
        { username: 'doc8', role: 'doctor', name: 'Dr. Arjun Nair', specialty: 'Pulmonology', email: 'arjun.nair@avanihospital.com', phone: '+91 98000 10008' },
        { username: 'recep1', role: 'receptionist', name: 'Ravi Receptionist', specialty: null, email: 'ravi@avanihospital.com', phone: '+91 98000 20001' },
        { username: 'lab1', role: 'lab_technician', name: 'Amit Lab Tech', specialty: null, email: 'amit.lab@avanihospital.com', phone: '+91 98000 30001' },
        { username: 'pharm1', role: 'pharmacist', name: 'Priya Pharmacist', specialty: null, email: 'priya.pharm@avanihospital.com', phone: '+91 98000 40001' },
        { username: 'finance1', role: 'finance', name: 'Ankit Finance', specialty: null, email: 'ankit.finance@avanihospital.com', phone: '+91 98000 50001' },
        { username: 'ipd1', role: 'ipd_manager', name: 'Neha IPD Manager', specialty: null, email: 'neha.ipd@avanihospital.com', phone: '+91 98000 60001' },
    ];

    for (const u of users) {
        const user = await prisma.user.upsert({
            where: { username: u.username },
            update: { specialty: u.specialty, email: u.email, phone: u.phone, is_active: true, organizationId: DEFAULT_ORG_ID },
            create: {
                username: u.username,
                password,
                role: u.role,
                name: u.name,
                specialty: u.specialty,
                email: u.email,
                phone: u.phone,
                is_active: true,
                organizationId: DEFAULT_ORG_ID,
            },
        });
        console.log(`Created user: ${user.username} (${u.role}${u.specialty ? ' - ' + u.specialty : ''})`);
    }

    // =============================================
    // 2. LAB INVENTORY (with organizationId)
    // =============================================
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
            update: { organizationId: DEFAULT_ORG_ID },
            create: { ...t, organizationId: DEFAULT_ORG_ID },
        });
    }
    console.log('Seeded Lab Tests');

    // =============================================
    // 3. LAB STAFF (with organizationId)
    // =============================================
    try {
        const existingStaff = await prisma.lab_staff.count();
        if (existingStaff === 0) {
            const staff = [
                { name: 'Amit Singh', role: 'technician', is_on_shift: true, organizationId: DEFAULT_ORG_ID },
                { name: 'Rahul Verma', role: 'technician', is_on_shift: true, organizationId: DEFAULT_ORG_ID },
            ];
            for (const s of staff) {
                await prisma.lab_staff.create({ data: s });
            }
            console.log('Seeded Lab Staff');
        }
    } catch (e) {
        console.log('Lab staff might already exist, skipping...');
    }

    // =============================================
    // 4. PHARMACY MASTER (with organizationId)
    // =============================================
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
            update: { organizationId: DEFAULT_ORG_ID },
            create: { ...m, organizationId: DEFAULT_ORG_ID },
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
    // 5. WARDS & BEDS (with organizationId)
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
            const ward = await prisma.wards.create({ data: { ...w, organizationId: DEFAULT_ORG_ID } });

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
                        organizationId: DEFAULT_ORG_ID,
                    },
                });
            }

            console.log(`Created ward: ${w.ward_name} with ${bedCount} beds`);
        } else {
            console.log(`Ward already exists: ${w.ward_name}`);
        }
    }

    // =============================================
    // 6. CHARGE CATALOG (with organizationId)
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
            update: { default_price: item.default_price, organizationId: DEFAULT_ORG_ID },
            create: { ...item, organizationId: DEFAULT_ORG_ID },
        });
    }
    console.log('Seeded Charge Catalog (' + catalogItems.length + ' items)');

    // =============================================
    // 7. INSURANCE PROVIDERS (with organizationId)
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
            update: { organizationId: DEFAULT_ORG_ID },
            create: { ...p, organizationId: DEFAULT_ORG_ID },
        });
    }
    console.log('Seeded Insurance Providers (' + insuranceProviders.length + ' providers)');

    console.log('\n=== Seeding Complete ===');
    console.log('Organization: Avani Hospital (org-avani-default)');
    console.log('Super Admin: superadmin@hospitalos.com / superadmin123');
    console.log('Staff users: password123 for all');
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
