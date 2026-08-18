/**
 * HospitalOS — AWS RDS Bootstrap Seed Script
 * 
 * Sets up a fully functioning, realistic Indian hospital environment for:
 *  - Client demos & prospective customer evaluations
 *  - SuperAdmin portal hospital onboarding & white-label branding showcase
 *  - Complete cross-module functional testing (OPD, IPD, Nursing, EMR, Pharmacy,
 *    Lab, Billing, Insurance/TPA, Finance GL, HR, OT, ER).
 * 
 * Organization: Avani Hospitals (AVN)
 * SuperAdmin: superadmin@hospitalos.com / superadmin@123
 * Staff Credentials: role / role@123 (e.g. admin/admin@123, doctor/doctor@123, etc.)
 * 
 * Usage:
 *   ALLOW_SEED=1 npx ts-node prisma/seed-aws.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ORG_ID = 'org-avani-production';
const ORG_DATA = {
    id: DEFAULT_ORG_ID,
    name: 'Avani Hospitals',
    slug: 'avani',
    code: 'AVN',
    address: 'Plot No. 42, Institutional Area, Sector 44, Gurugram, Haryana 122003',
    phone: '+91 124 456 7890',
    email: 'contact@avanihospitals.com',
    license_no: 'HR-GUR-MED-2024-0089',
    plan: 'enterprise',
    is_active: true,
};

const FIRST_NAMES_MALE = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir',
    'Rajesh', 'Suresh', 'Amit', 'Vikram', 'Sanjay', 'Deepak', 'Manoj', 'Anil', 'Rahul', 'Karan',
    'Nikhil', 'Varun', 'Harsh', 'Alok', 'Tarun', 'Manish', 'Gautam', 'Pankaj', 'Ramesh', 'Siddharth'
];

const FIRST_NAMES_FEMALE = [
    'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Riya', 'Ishita', 'Meera', 'Kavya', 'Neha', 'Pooja',
    'Sunita', 'Rekha', 'Kavita', 'Priya', 'Anjali', 'Shalini', 'Nisha', 'Ritu', 'Geeta', 'Seema',
    'Zoya', 'Ayesha', 'Tanvi', 'Sneha', 'Divya', 'Swati', 'Rashmi', 'Preeti', 'Deepika', 'Kiran'
];

const LAST_NAMES = [
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Joshi',
    'Mehta', 'Chauhan', 'Yadav', 'Mishra', 'Pandey', 'Agarwal', 'Bansal', 'Malhotra', 'Kapoor', 'Rao',
    'Deshmukh', 'Kulkarni', 'Sengupta', 'Mukherjee', 'Bose', 'Trivedi', 'Shukla', 'Saxena', 'Bhatia', 'Mathur'
];

const INDIAN_CITIES = [
    'Sector 14, Gurugram, Haryana',
    'DLF Phase 4, Gurugram, Haryana',
    'Sector 62, Noida, Uttar Pradesh',
    'Rohini Sector 9, New Delhi',
    'Indirapuram, Ghaziabad, Uttar Pradesh',
    'South Extension II, New Delhi',
    'Dwarka Sector 12, New Delhi',
    'Vasant Kunj, New Delhi',
    'Andheri West, Mumbai, Maharashtra',
    'Koramangala 4th Block, Bengaluru, Karnataka',
    'Banjara Hills, Hyderabad, Telangana',
    'Kothrud, Pune, Maharashtra',
    'Salt Lake Sector V, Kolkata, West Bengal',
    'Malviya Nagar, Jaipur, Rajasthan'
];

const DIAGNOSES = [
    'Acute Gastroenteritis with moderate dehydration',
    'Dengue Fever with Thrombocytopenia',
    'Community Acquired Pneumonia',
    'Type 2 Diabetes Mellitus with Hyperglycemia',
    'Essential Hypertension - Stage 2',
    'Acute Appendicitis',
    'Chronic Obstructive Pulmonary Disease (COPD) exacerbation',
    'Urinary Tract Infection with Sepsis',
    'Coronary Artery Disease - Angina Pectoris',
    'Osteoarthritis Bilateral Knee Joints',
    'Lumbar Disc Herniation L4-L5',
    'Acute Viral Bronchitis'
];

const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const rint = (min: number, max: number, seed: number) => min + ((seed * 9301 + 49297) % 233280) % (max - min + 1);

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Refusing to seed in production without ALLOW_SEED=1');
        process.exit(1);
    }

    console.log('===========================================================');
    console.log('🚀 Starting HospitalOS Bootstrap Seed for Avani Hospitals');
    console.log('===========================================================\n');

    // ─────────────────────────────────────────────────────────────
    // 0. SUPER ADMIN ACCOUNT (Platform Mothership)
    // ─────────────────────────────────────────────────────────────
    const superAdminPassword = await bcrypt.hash('superadmin@123', 10);
    await prisma.superAdmin.upsert({
        where: { email: 'superadmin@hospitalos.com' },
        update: { password: superAdminPassword, name: 'System Super Admin', is_active: true },
        create: {
            email: 'superadmin@hospitalos.com',
            password: superAdminPassword,
            name: 'System Super Admin',
            is_active: true,
        },
    });
    console.log('✓ SuperAdmin: superadmin@hospitalos.com / superadmin@123');

    // ─────────────────────────────────────────────────────────────
    // 1. ORGANIZATION + CONFIG + BRANDING
    // ─────────────────────────────────────────────────────────────
    let org = await prisma.organization.findFirst({
        where: {
            OR: [
                { id: DEFAULT_ORG_ID },
                { slug: ORG_DATA.slug },
                { code: ORG_DATA.code },
            ]
        }
    });

    if (org) {
        org = await prisma.organization.update({
            where: { id: org.id },
            data: {
                name: ORG_DATA.name,
                slug: ORG_DATA.slug,
                code: ORG_DATA.code,
                address: ORG_DATA.address,
                phone: ORG_DATA.phone,
                email: ORG_DATA.email,
                license_no: ORG_DATA.license_no,
                plan: ORG_DATA.plan,
                is_active: true,
            },
        });
    } else {
        org = await prisma.organization.create({
            data: ORG_DATA,
        });
    }

    const resolvedOrgId = org.id;
    console.log(`✓ Organization: ${org.name} (${org.code} - ${resolvedOrgId})`);

    await prisma.organizationConfig.upsert({
        where: { organizationId: resolvedOrgId },
        update: {
            uhid_prefix: 'AVN',
            enable_ai_triage: true,
            timezone: 'Asia/Kolkata',
            currency: 'INR',
        },
        create: {
            organizationId: resolvedOrgId,
            uhid_prefix: 'AVN',
            enable_ai_triage: true,
            timezone: 'Asia/Kolkata',
            currency: 'INR',
        },
    });

    const brandingData = {
        organizationId: resolvedOrgId,
        portal_title: 'Avani Hospitals',
        portal_subtitle: 'A Unit of Avani Healthcare Pvt. Ltd.',
        primary_color: '#0d47a1', // Deep Sapphire Medical Blue
        secondary_color: '#0a2558', // Rich Navy for Sidebar
        accent_color: '#1565c0', // Vibrant Action Blue
        tagline: 'Excellence in Healthcare, Compassion in Healing',
        logo_url: null,
        footer_text: '© 2026 Avani Hospitals. A Unit of Avani Healthcare Pvt. Ltd. All rights reserved.',
    };

    await prisma.organizationBranding.upsert({
        where: { organizationId: resolvedOrgId },
        update: brandingData,
        create: brandingData,
    });
    console.log('✓ Organization Config & Avani White-Label Branding active');

    // ─────────────────────────────────────────────────────────────
    // 2. STAFF ACCOUNTS (Role-Keyed Usernames & role@123 Passwords)
    // ─────────────────────────────────────────────────────────────
    const staffRoles = [
        { username: 'admin', role: 'admin', name: 'Dr. Rajesh Sharma', email: 'admin@avanihospitals.com', phone: '+91 98100 11001', specialty: null },
        { username: 'doctor', role: 'doctor', name: 'Dr. Arvind Swaminathan', email: 'doctor@avanihospitals.com', phone: '+91 98100 11002', specialty: 'General Medicine' },
        { username: 'receptionist', role: 'receptionist', name: 'Priya Sharma', email: 'receptionist@avanihospitals.com', phone: '+91 98100 11003', specialty: null },
        { username: 'nurse', role: 'nurse', name: 'Sister Sunita Nair', email: 'nurse@avanihospitals.com', phone: '+91 98100 11004', specialty: null },
        { username: 'pharmacist', role: 'pharmacist', name: 'Rahul Verma', email: 'pharmacist@avanihospitals.com', phone: '+91 98100 11005', specialty: null },
        { username: 'lab_technician', role: 'lab_technician', name: 'Amit Patel', email: 'lab_technician@avanihospitals.com', phone: '+91 98100 11006', specialty: null },
        { username: 'finance', role: 'finance', name: 'Manish Gupta', email: 'finance@avanihospitals.com', phone: '+91 98100 11007', specialty: null },
        { username: 'ipd_manager', role: 'ipd_manager', name: 'Neha Deshmukh', email: 'ipd_manager@avanihospitals.com', phone: '+91 98100 11008', specialty: null },
        { username: 'opd_manager', role: 'opd_manager', name: 'Vikram Rao', email: 'opd_manager@avanihospitals.com', phone: '+91 98100 11009', specialty: null },
        { username: 'hr', role: 'hr', name: 'Ananya Sen', email: 'hr@avanihospitals.com', phone: '+91 98100 11010', specialty: null },
        { username: 'ot_manager', role: 'ot_manager', name: 'Suresh Kulkarni', email: 'ot_manager@avanihospitals.com', phone: '+91 98100 11011', specialty: null },
        { username: 'er_staff', role: 'er_staff', name: 'Deepak Joshi', email: 'er_staff@avanihospitals.com', phone: '+91 98100 11012', specialty: null },
    ];

    const userMap: Record<string, string> = {};

    for (const s of staffRoles) {
        const passwordHash = await bcrypt.hash(`${s.username}@123`, 10);
        const u = await prisma.user.upsert({
            where: { username: s.username },
            update: {
                name: s.name,
                email: s.email,
                phone: s.phone,
                role: s.role,
                specialty: s.specialty,
                organizationId: resolvedOrgId,
                is_active: true,
            },
            create: {
                username: s.username,
                password: passwordHash,
                role: s.role,
                name: s.name,
                email: s.email,
                phone: s.phone,
                specialty: s.specialty,
                organizationId: resolvedOrgId,
                is_active: true,
                consultation_fee: s.role === 'doctor' ? 700 : 500,
                follow_up_fee: 350,
            },
        });
        userMap[s.username] = u.id;
    }
    console.log(`✓ Seeded ${staffRoles.length} portal staff accounts with role@123 passwords`);

    // ─────────────────────────────────────────────────────────────
    // 3. DOCTOR ROSTER (8 Authentic Indian Doctor Profiles)
    // ─────────────────────────────────────────────────────────────
    const doctorProfiles = [
        {
            username: 'doctor', // Primary doctor user
            name: 'Dr. Arvind Swaminathan',
            specialty: 'General Medicine',
            qualifications: 'MBBS, MD (General Medicine)',
            doctor_registration_no: 'MCI-DEL-2012-4521',
            consultation_fee: 700,
            follow_up_fee: 350,
            slot_duration: 15,
            working_hours: '09:00-13:00,16:00-19:00',
        },
        {
            username: 'dr.kapoor',
            name: 'Dr. Sunita Kapoor',
            specialty: 'Cardiology',
            qualifications: 'MBBS, MD (Medicine), DM (Cardiology)',
            doctor_registration_no: 'MCI-DEL-2008-3190',
            consultation_fee: 1200,
            follow_up_fee: 600,
            slot_duration: 20,
            working_hours: '10:00-14:00,17:00-20:00',
            email: 'sunita.kapoor@avanihospitals.com',
            phone: '+91 98100 12002',
        },
        {
            username: 'dr.verma',
            name: 'Dr. Alok Verma',
            specialty: 'Orthopedics',
            qualifications: 'MBBS, MS (Orthopedics), MCh',
            doctor_registration_no: 'MCI-HAR-2010-8742',
            consultation_fee: 900,
            follow_up_fee: 450,
            slot_duration: 20,
            working_hours: '09:00-13:00,15:00-18:00',
            email: 'alok.verma@avanihospitals.com',
            phone: '+91 98100 12003',
        },
        {
            username: 'dr.chawla',
            name: 'Dr. Neha Chawla',
            specialty: 'Pediatrics',
            qualifications: 'MBBS, MD (Pediatrics), DNB',
            doctor_registration_no: 'MCI-DEL-2015-6218',
            consultation_fee: 800,
            follow_up_fee: 400,
            slot_duration: 15,
            working_hours: '09:30-13:30,16:30-19:30',
            email: 'neha.chawla@avanihospitals.com',
            phone: '+91 98100 12004',
        },
        {
            username: 'dr.menon',
            name: 'Dr. Suresh Menon',
            specialty: 'Neurology',
            qualifications: 'MBBS, MD (Medicine), DM (Neurology)',
            doctor_registration_no: 'MCI-KAR-2009-1940',
            consultation_fee: 1400,
            follow_up_fee: 700,
            slot_duration: 30,
            working_hours: '10:00-14:00,17:00-19:00',
            email: 'suresh.menon@avanihospitals.com',
            phone: '+91 98100 12005',
        },
        {
            username: 'dr.gupta',
            name: 'Dr. Meenakshi Gupta',
            specialty: 'OB/GYN',
            qualifications: 'MBBS, MS (Obstetrics & Gynecology), FICOG',
            doctor_registration_no: 'MCI-UP-2011-5321',
            consultation_fee: 1000,
            follow_up_fee: 500,
            slot_duration: 20,
            working_hours: '09:00-13:00,16:00-18:30',
            email: 'meenakshi.gupta@avanihospitals.com',
            phone: '+91 98100 12006',
        },
        {
            username: 'dr.joshi',
            name: 'Dr. Ramesh Joshi',
            specialty: 'Pulmonology',
            qualifications: 'MBBS, MD (Pulmonary Medicine), FCCP',
            doctor_registration_no: 'MCI-DEL-2013-7729',
            consultation_fee: 900,
            follow_up_fee: 450,
            slot_duration: 20,
            working_hours: '09:00-13:00,15:00-18:00',
            email: 'ramesh.joshi@avanihospitals.com',
            phone: '+91 98100 12007',
        },
        {
            username: 'dr.bhatia',
            name: 'Dr. Tarun Bhatia',
            specialty: 'General Surgery',
            qualifications: 'MBBS, MS (General Surgery), FIAGES',
            doctor_registration_no: 'MCI-HAR-2007-2819',
            consultation_fee: 1100,
            follow_up_fee: 550,
            slot_duration: 20,
            working_hours: '10:00-14:00,16:00-19:00',
            email: 'tarun.bhatia@avanihospitals.com',
            phone: '+91 98100 12008',
        },
    ];

    const doctorUsers: { id: string; name: string; username: string; specialty: string; fee: number }[] = [];

    for (const doc of doctorProfiles) {
        const passwordHash = await bcrypt.hash('doctor@123', 10);
        const existing = await prisma.user.findUnique({ where: { username: doc.username } });
        const user = existing
            ? await prisma.user.update({
                where: { username: doc.username },
                data: {
                    name: doc.name,
                    specialty: doc.specialty,
                    qualifications: doc.qualifications,
                    doctor_registration_no: doc.doctor_registration_no,
                    consultation_fee: doc.consultation_fee,
                    follow_up_fee: doc.follow_up_fee,
                    slot_duration: doc.slot_duration,
                    working_hours: doc.working_hours,
                    is_active: true,
                    organizationId: resolvedOrgId,
                },
            })
            : await prisma.user.create({
                data: {
                    username: doc.username,
                    password: passwordHash,
                    role: 'doctor',
                    name: doc.name,
                    specialty: doc.specialty,
                    qualifications: doc.qualifications,
                    doctor_registration_no: doc.doctor_registration_no,
                    consultation_fee: doc.consultation_fee,
                    follow_up_fee: doc.follow_up_fee,
                    slot_duration: doc.slot_duration,
                    working_hours: doc.working_hours,
                    email: doc.email || `${doc.username}@avanihospitals.com`,
                    phone: doc.phone || '+91 98100 12000',
                    organizationId: resolvedOrgId,
                    is_active: true,
                },
            });
        userMap[doc.username] = user.id;
        doctorUsers.push({
            id: user.id,
            name: doc.name,
            username: doc.username,
            specialty: doc.specialty,
            fee: doc.consultation_fee,
        });
    }
    console.log(`✓ Seeded ${doctorProfiles.length} Indian Consultant Doctor profiles`);

    // ─────────────────────────────────────────────────────────────
    // 4. CLINICAL DEPARTMENTS (15 Departments)
    // ─────────────────────────────────────────────────────────────
    const departmentsData = [
        { name: 'General Medicine', slug: 'general-medicine', base_consultation_fee: 700, docUser: 'doctor' },
        { name: 'Cardiology', slug: 'cardiology', base_consultation_fee: 1200, docUser: 'dr.kapoor' },
        { name: 'Orthopedics', slug: 'orthopedics', base_consultation_fee: 900, docUser: 'dr.verma' },
        { name: 'Pediatrics', slug: 'pediatrics', base_consultation_fee: 800, docUser: 'dr.chawla' },
        { name: 'Neurology', slug: 'neurology', base_consultation_fee: 1400, docUser: 'dr.menon' },
        { name: 'OB/GYN', slug: 'ob-gyn', base_consultation_fee: 1000, docUser: 'dr.gupta' },
        { name: 'Pulmonology', slug: 'pulmonology', base_consultation_fee: 900, docUser: 'dr.joshi' },
        { name: 'General Surgery', slug: 'general-surgery', base_consultation_fee: 1100, docUser: 'dr.bhatia' },
        { name: 'ENT', slug: 'ent', base_consultation_fee: 750, docUser: 'doctor' },
        { name: 'Dermatology', slug: 'dermatology', base_consultation_fee: 800, docUser: 'doctor' },
        { name: 'Gastroenterology', slug: 'gastroenterology', base_consultation_fee: 1100, docUser: 'dr.kapoor' },
        { name: 'Urology', slug: 'urology', base_consultation_fee: 1000, docUser: 'dr.bhatia' },
        { name: 'Oncology', slug: 'oncology', base_consultation_fee: 1500, docUser: 'dr.menon' },
        { name: 'Radiology', slug: 'radiology', base_consultation_fee: 600, docUser: 'doctor' },
        { name: 'Emergency', slug: 'emergency', base_consultation_fee: 1500, docUser: 'doctor' },
    ];

    for (const dept of departmentsData) {
        const headDocId = userMap[dept.docUser] || null;
        await prisma.department.upsert({
            where: { slug_organizationId: { slug: dept.slug, organizationId: resolvedOrgId } },
            update: { base_consultation_fee: dept.base_consultation_fee, is_active: true, head_doctor_id: headDocId },
            create: {
                name: dept.name,
                slug: dept.slug,
                base_consultation_fee: dept.base_consultation_fee,
                organizationId: resolvedOrgId,
                is_active: true,
                head_doctor_id: headDocId,
            },
        });
    }
    console.log(`✓ Seeded ${departmentsData.length} Hospital Departments`);

    // ─────────────────────────────────────────────────────────────
    // 5. WARDS & BEDS (6 Wards, 48 Beds)
    // ─────────────────────────────────────────────────────────────
    const wardConfigs = [
        { name: 'General Ward', type: 'General', cost_per_day: 2000, nursing: 400, prefix: 'GEN', beds: 10 },
        { name: 'ICU (Intensive Care Unit)', type: 'ICU', cost_per_day: 8500, nursing: 1500, prefix: 'ICU', beds: 6 },
        { name: 'Private Deluxe Room', type: 'Private', cost_per_day: 4500, nursing: 700, prefix: 'PVT', beds: 8 },
        { name: 'Maternity Ward', type: 'Maternity', cost_per_day: 3500, nursing: 600, prefix: 'MAT', beds: 8 },
        { name: 'Pediatric Ward', type: 'Pediatric', cost_per_day: 3000, nursing: 500, prefix: 'PED', beds: 8 },
        { name: 'Isolation Ward', type: 'Isolation', cost_per_day: 5500, nursing: 1000, prefix: 'ISO', beds: 8 },
    ];

    const bedsRoster: { bedId: string; wardId: number; wardName: string; rate: number }[] = [];

    for (const wc of wardConfigs) {
        let ward = await prisma.wards.findFirst({
            where: { ward_name: wc.name, organizationId: resolvedOrgId },
        });
        if (!ward) {
            ward = await prisma.wards.create({
                data: {
                    ward_name: wc.name,
                    ward_type: wc.type,
                    cost_per_day: wc.cost_per_day,
                    nursing_charge: wc.nursing,
                    organizationId: resolvedOrgId,
                    is_active: true,
                },
            });
        }

        for (let i = 1; i <= wc.beds; i++) {
            const bedId = `AVN-${wc.prefix}-${String(i).padStart(2, '0')}`;
            await prisma.beds.upsert({
                where: { bed_id: bedId },
                update: { status: 'Available', ward_id: ward.ward_id, organizationId: resolvedOrgId },
                create: {
                    bed_id: bedId,
                    bed_name: `${wc.type} Bed ${i}`,
                    ward_id: ward.ward_id,
                    status: 'Available',
                    organizationId: resolvedOrgId,
                },
            });
            bedsRoster.push({ bedId, wardId: ward.ward_id, wardName: wc.name, rate: wc.cost_per_day });
        }
    }
    console.log(`✓ Seeded ${wardConfigs.length} Wards with 48 Total Beds`);

    // ─────────────────────────────────────────────────────────────
    // 6. LAB TEST INVENTORY & STAFF (20 Diagnostic Tests)
    // ─────────────────────────────────────────────────────────────
    const labTests = [
        { test_name: 'Complete Blood Count (CBC)', price: 350 },
        { test_name: 'Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)', price: 650 },
        { test_name: 'Liver Function Test (LFT)', price: 750 },
        { test_name: 'Kidney Function Test (KFT / RFT)', price: 700 },
        { test_name: 'HbA1c (Glycosylated Hemoglobin)', price: 500 },
        { test_name: 'Dengue NS1 Antigen & IgM/IgG', price: 800 },
        { test_name: 'Thyroid Profile (Total T3, T4, TSH)', price: 850 },
        { test_name: 'Urine Routine & Microscopy', price: 200 },
        { test_name: 'Chest X-Ray PA View', price: 400 },
        { test_name: '12-Lead Electrocardiogram (ECG)', price: 300 },
        { test_name: 'Serum Electrolytes (Na+, K+, Cl-)', price: 450 },
        { test_name: 'Ultrasound Abdomen & Pelvis (USG)', price: 1200 },
        { test_name: 'Troponin-I Quantitative', price: 950 },
        { test_name: 'C-Reactive Protein (CRP) Quantitative', price: 450 },
        { test_name: 'Blood Glucose Fasting / Postprandial', price: 100 },
        { test_name: 'Stool Routine & Occult Blood', price: 250 },
        { test_name: 'Serum Vitamin D3 (25-OH)', price: 1200 },
        { test_name: 'Serum Vitamin B12', price: 900 },
        { test_name: 'Prothrombin Time with INR (PT/INR)', price: 350 },
        { test_name: 'Serum Creatinine & Blood Urea Nitrogen', price: 300 },
    ];

    for (const t of labTests) {
        await prisma.lab_test_inventory.upsert({
            where: { test_name_organizationId: { test_name: t.test_name, organizationId: resolvedOrgId } },
            update: { price: t.price, is_available: true },
            create: { test_name: t.test_name, price: t.price, is_available: true, organizationId: resolvedOrgId },
        });
    }

    const labStaffMembers = [
        { name: 'Amit Patel', role: 'Senior Technician', is_on_shift: true, organizationId: resolvedOrgId },
        { name: 'Sanjay Deshmukh', role: 'Lab Technologist', is_on_shift: true, organizationId: resolvedOrgId },
    ];
    for (const staff of labStaffMembers) {
        const exists = await prisma.lab_staff.findFirst({ where: { name: staff.name, organizationId: resolvedOrgId } });
        if (!exists) {
            await prisma.lab_staff.create({ data: staff });
        }
    }
    console.log(`✓ Seeded ${labTests.length} Diagnostic Lab Tests & Lab Staff`);

    // ─────────────────────────────────────────────────────────────
    // 7. PHARMACY MEDICINE MASTER & BATCHES (30 Indian Medicines)
    // ─────────────────────────────────────────────────────────────
    const medicinesCatalog = [
        { brand: 'Dolo 650', generic: 'Paracetamol 650mg', price: 2.2, min: 200, unit: 'Tablet' },
        { brand: 'Augmentin 625', generic: 'Amoxicillin 500mg + Clavulanate 125mg', price: 18.5, min: 100, unit: 'Tablet' },
        { brand: 'Azithral 500', generic: 'Azithromycin 500mg', price: 22.0, min: 80, unit: 'Tablet' },
        { brand: 'Pan 40', generic: 'Pantoprazole 40mg', price: 9.5, min: 150, unit: 'Tablet' },
        { brand: 'Pantocid DSR', generic: 'Pantoprazole 40mg + Domperidone 30mg SR', price: 14.0, min: 100, unit: 'Capsule' },
        { brand: 'Metformin 500', generic: 'Metformin Hydrochloride 500mg', price: 3.5, min: 150, unit: 'Tablet' },
        { brand: 'Glycomet GP 2', generic: 'Glimepiride 2mg + Metformin 500mg', price: 11.0, min: 100, unit: 'Tablet' },
        { brand: 'Telma 40', generic: 'Telmisartan 40mg', price: 8.0, min: 120, unit: 'Tablet' },
        { brand: 'Amlokind 5', generic: 'Amlodipine 5mg', price: 3.0, min: 150, unit: 'Tablet' },
        { brand: 'Rosuvas 10', generic: 'Rosuvastatin 10mg', price: 12.5, min: 100, unit: 'Tablet' },
        { brand: 'Shelcal 500', generic: 'Calcium 500mg + Vitamin D3 250 IU', price: 7.5, min: 150, unit: 'Tablet' },
        { brand: 'Becosules', generic: 'Vitamin B-Complex with Vitamin C', price: 4.0, min: 200, unit: 'Capsule' },
        { brand: 'Montair-LC', generic: 'Montelukast 10mg + Levocetirizine 5mg', price: 16.0, min: 100, unit: 'Tablet' },
        { brand: 'Livogen Z', generic: 'Ferrous Fumarate + Folic Acid + Zinc', price: 6.5, min: 120, unit: 'Tablet' },
        { brand: 'Omez 20', generic: 'Omeprazole 20mg', price: 5.5, min: 100, unit: 'Capsule' },
        { brand: 'Clavam 625', generic: 'Amoxicillin + Potassium Clavulanate', price: 19.0, min: 80, unit: 'Tablet' },
        { brand: 'Combiflam', generic: 'Ibuprofen 400mg + Paracetamol 325mg', price: 4.5, min: 200, unit: 'Tablet' },
        { brand: 'Voveran 50', generic: 'Diclofenac Sodium 50mg', price: 6.0, min: 100, unit: 'Tablet' },
        { brand: 'Ondem 4mg', generic: 'Ondansetron 4mg', price: 5.0, min: 80, unit: 'Tablet' },
        { brand: 'Deriphyllin Retard 150', generic: 'Theophylline + Etofylline 150mg', price: 3.5, min: 100, unit: 'Tablet' },
        { brand: 'Duolin Respules', generic: 'Levosalbutamol + Ipratropium Bromide', price: 28.0, min: 50, unit: 'Respule' },
        { brand: 'Budecort 0.5mg', generic: 'Budesonide 0.5mg Respule', price: 32.0, min: 50, unit: 'Respule' },
        { brand: 'Dynapar AQ Inj', generic: 'Diclofenac Sodium 75mg/1ml', price: 35.0, min: 60, unit: 'Vial' },
        { brand: 'Monocef 1g Inj', generic: 'Ceftriaxone Sodium 1g', price: 65.0, min: 80, unit: 'Vial' },
        { brand: 'Emeset 2ml Inj', generic: 'Ondansetron 2mg/ml Injection', price: 28.0, min: 60, unit: 'Ampoule' },
        { brand: 'Clexane 40mg Inj', generic: 'Enoxaparin Sodium 40mg Pre-filled', price: 480.0, min: 30, unit: 'Syringe' },
        { brand: 'Paracetamol IV 100ml', generic: 'Paracetamol IV Infusion 1000mg/100ml', price: 85.0, min: 50, unit: 'Bottle' },
        { brand: 'Normal Saline (NS 0.9%) 500ml', generic: 'Sodium Chloride 0.9% IV Infusion', price: 45.0, min: 100, unit: 'Bottle' },
        { brand: 'Ringer Lactate (RL) 500ml', generic: 'Compound Sodium Lactate IV Infusion', price: 50.0, min: 100, unit: 'Bottle' },
        { brand: 'Tramadol 50mg Inj', generic: 'Tramadol Hydrochloride 50mg/ml', price: 40.0, min: 40, unit: 'Ampoule' },
    ];

    const medicineRecords: { id: number; brand_name: string; price: number }[] = [];

    for (const m of medicinesCatalog) {
        const med = await prisma.pharmacy_medicine_master.upsert({
            where: { brand_name_organizationId: { brand_name: m.brand, organizationId: resolvedOrgId } },
            update: { generic_name: m.generic, price_per_unit: m.price, min_threshold: m.min },
            create: {
                brand_name: m.brand,
                generic_name: m.generic,
                price_per_unit: m.price,
                min_threshold: m.min,
                organizationId: resolvedOrgId,
            },
        });
        medicineRecords.push({ id: med.id, brand_name: med.brand_name, price: m.price });

        const batchNo = `BAT-${m.brand.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase()}-2601`;
        await prisma.pharmacy_batch_inventory.upsert({
            where: { medicine_id_batch_no: { medicine_id: med.id, batch_no: batchNo } },
            update: { current_stock: 250, expiry_date: new Date('2028-06-30') },
            create: {
                medicine_id: med.id,
                batch_no: batchNo,
                current_stock: 250,
                expiry_date: new Date('2028-06-30'),
                rack_location: `Rack-${String.fromCharCode(65 + (med.id % 6))}-${(med.id % 10) + 1}`,
            },
        });
    }
    console.log(`✓ Seeded ${medicinesCatalog.length} Indian Pharmacy Medicines with Batch Stocks`);

    // ─────────────────────────────────────────────────────────────
    // 8. CHARGE CATALOG (25 Hospital Service Rates)
    // ─────────────────────────────────────────────────────────────
    const catalogItems = [
        { category: 'ConsultationCharge', item_code: 'CON-GEN', item_name: 'General OPD Consultation', default_price: 700, department: 'General' },
        { category: 'ConsultationCharge', item_code: 'CON-SPE', item_name: 'Specialist Consultation', default_price: 1200, department: 'General' },
        { category: 'ConsultationCharge', item_code: 'CON-EMR', item_name: 'Emergency Triage & Consultation', default_price: 1500, department: 'Emergency' },
        { category: 'RoomCharge', item_code: 'RM-GEN', item_name: 'General Ward - Room Rent / Day', default_price: 2000, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-ICU', item_name: 'ICU Bed - Charge / Day', default_price: 8500, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-PVT', item_name: 'Private Room - Charge / Day', default_price: 4500, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-MAT', item_name: 'Maternity Ward - Charge / Day', default_price: 3500, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-PED', item_name: 'Pediatric Ward - Charge / Day', default_price: 3000, department: 'IPD' },
        { category: 'RoomCharge', item_code: 'RM-ISO', item_name: 'Isolation Ward - Charge / Day', default_price: 5500, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-GEN', item_name: 'General Nursing Care (per day)', default_price: 400, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-ICU', item_name: 'ICU Critical Nursing Care (per day)', default_price: 1500, department: 'IPD' },
        { category: 'NursingCharge', item_code: 'NRS-PVT', item_name: 'Private Nursing Care (per day)', default_price: 700, department: 'IPD' },
        { category: 'DoctorVisitCharge', item_code: 'DV-RND', item_name: 'Consultant IPD Round Visit', default_price: 500, department: 'IPD' },
        { category: 'DoctorVisitCharge', item_code: 'DV-ICU', item_name: 'Intensivist Round Visit (ICU)', default_price: 1200, department: 'IPD' },
        { category: 'ProcedureCharge', item_code: 'PRC-DRS', item_name: 'Wound Dressing & Aseptic Care', default_price: 350, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-NEB', item_name: 'Nebulization Session', default_price: 200, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-IVC', item_name: 'IV Cannulation & Infusion Setup', default_price: 250, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-CTH', item_name: 'Foley Catheterization Insertion', default_price: 600, department: 'General' },
        { category: 'ProcedureCharge', item_code: 'PRC-MIN', item_name: 'Minor Surgical Procedure / Suturing', default_price: 2500, department: 'Surgery' },
        { category: 'ProcedureCharge', item_code: 'PRC-MAJ', item_name: 'Major OT Procedure Charge', default_price: 25000, department: 'Surgery' },
        { category: 'Consumables', item_code: 'CSM-IVS', item_name: 'IV Infusion Set with Micro-Drip', default_price: 180, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-SYR', item_name: 'Syringe & Needle Disposable Pack', default_price: 60, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-OXY', item_name: 'Oxygen Inhalation (per hour)', default_price: 200, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-GLV', item_name: 'Surgical Sterile Gloves Pack', default_price: 90, department: 'General' },
        { category: 'Consumables', item_code: 'CSM-ECG', item_name: 'ECG Electrodes Disposable Pack', default_price: 120, department: 'General' },
    ];

    for (const item of catalogItems) {
        await prisma.charge_catalog.upsert({
            where: { item_code: item.item_code },
            update: { default_price: item.default_price, organizationId: resolvedOrgId },
            create: { ...item, organizationId: resolvedOrgId },
        });
    }
    console.log(`✓ Seeded ${catalogItems.length} Hospital Charge Catalog Items`);

    // ─────────────────────────────────────────────────────────────
    // 9. INSURANCE PROVIDERS / TPAs (7 Indian Payers)
    // ─────────────────────────────────────────────────────────────
    const insuranceList = [
        { provider_name: 'Star Health & Allied Insurance', provider_code: 'STAR', contact_email: 'claims@starhealth.in', contact_phone: '1800-425-2255' },
        { provider_name: 'HDFC ERGO General Insurance', provider_code: 'HDFC', contact_email: 'cashless@hdfcergo.com', contact_phone: '1800-266-0700' },
        { provider_name: 'ICICI Lombard Health Care', provider_code: 'ICICI', contact_email: 'ihealthcare@icicilombard.com', contact_phone: '1800-266-9725' },
        { provider_name: 'Bajaj Allianz General Insurance', provider_code: 'BAJAJ', contact_email: 'cashless@bajajallianz.co.in', contact_phone: '1800-209-5858' },
        { provider_name: 'The New India Assurance Co.', provider_code: 'NIA', contact_email: 'claims@newindia.co.in', contact_phone: '1800-209-1415' },
        { provider_name: 'Niva Bupa Health Insurance', provider_code: 'NIVA', contact_email: 'customercare@nivabupa.com', contact_phone: '1800-200-7000' },
        { provider_name: 'Care Health Insurance (Religare)', provider_code: 'CARE', contact_email: 'claims@careinsurance.com', contact_phone: '1800-102-4488' },
    ];

    const insuranceRecords: { id: number; code: string; name: string }[] = [];

    for (const ins of insuranceList) {
        let p = await prisma.insurance_providers.findFirst({
            where: {
                OR: [
                    { provider_code: ins.provider_code },
                    { provider_name: ins.provider_name },
                ],
            },
        });

        if (p) {
            p = await prisma.insurance_providers.update({
                where: { id: p.id },
                data: {
                    provider_name: ins.provider_name,
                    provider_code: ins.provider_code,
                    contact_email: ins.contact_email,
                    contact_phone: ins.contact_phone,
                    organizationId: resolvedOrgId,
                },
            });
        } else {
            p = await prisma.insurance_providers.create({
                data: { ...ins, organizationId: resolvedOrgId },
            });
        }
        insuranceRecords.push({ id: p.id, code: p.provider_code, name: p.provider_name });
    }
    console.log(`✓ Seeded ${insuranceList.length} TPA Insurance Providers`);

    // ─────────────────────────────────────────────────────────────
    // 10. 50 AUTHENTIC INDIAN PATIENTS (OPD_REG)
    // ─────────────────────────────────────────────────────────────
    const patientsRoster: { pid: string; name: string; age: string; gender: string; phone: string; type: string }[] = [];

    for (let i = 0; i < 50; i++) {
        const isMale = i % 2 === 0;
        const first = isMale ? pick(FIRST_NAMES_MALE, i) : pick(FIRST_NAMES_FEMALE, i);
        const last = pick(LAST_NAMES, i * 2);
        const fullName = `${first} ${last}`;
        const pid = `AVN-2026-${String(10001 + i)}`;
        const age = String(rint(6, 75, i + 3));
        const gender = isMale ? 'Male' : 'Female';
        const phone = `+91 ${98100 + (i % 90)} ${String(10000 + i * 137).substring(0, 5)}`;
        const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.in`;
        const bloodGroup = pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-'], i);
        const patientType = i % 6 === 0 ? 'tpa_insurance' : i % 8 === 0 ? 'corporate' : 'cash';
        const abha = `91-${String(rint(1000, 9999, i))}-${String(rint(1000, 9999, i + 5))}-${String(rint(1000, 9999, i + 9))}`;
        const createdAt = daysAgo(rint(1, 45, i + 4));

        await prisma.oPD_REG.upsert({
            where: { patient_id: pid },
            update: {
                full_name: fullName,
                age,
                gender,
                phone,
                email,
                address: pick(INDIAN_CITIES, i),
                blood_group: bloodGroup,
                patient_type: patientType,
                abha_number: abha,
                organizationId: resolvedOrgId,
                is_archived: false,
            },
            create: {
                patient_id: pid,
                full_name: fullName,
                age,
                gender,
                phone,
                email,
                address: pick(INDIAN_CITIES, i),
                blood_group: bloodGroup,
                patient_type: patientType,
                abha_number: abha,
                organizationId: resolvedOrgId,
                is_archived: false,
                created_at: createdAt,
            },
        });

        patientsRoster.push({ pid, name: fullName, age, gender, phone, type: patientType });
    }
    console.log(`✓ Seeded ${patientsRoster.length} Authentic Indian Patient Master Records`);

    // ─────────────────────────────────────────────────────────────
    // 11. APPOINTMENTS (15 OPD Appointments for Today)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 15; i++) {
        const pat = patientsRoster[i];
        const doc = pick(doctorUsers, i);
        const apptId = `AVN-APT-26-27-${String(i + 1).padStart(4, '0')}`;
        const apptDate = new Date();
        apptDate.setHours(9 + (i % 7), (i % 2) * 30, 0, 0);
        const status = i < 6 ? 'Completed' : i < 10 ? 'Checked In' : 'Scheduled';

        await prisma.appointments.upsert({
            where: { appointment_id: apptId },
            update: {
                patient_id: pat.pid,
                doctor_id: doc.id,
                doctor_name: doc.name,
                department: doc.specialty,
                appointment_date: apptDate,
                status,
                organizationId: resolvedOrgId,
            },
            create: {
                appointment_id: apptId,
                patient_id: pat.pid,
                doctor_id: doc.id,
                doctor_name: doc.name,
                department: doc.specialty,
                appointment_date: apptDate,
                status,
                organizationId: resolvedOrgId,
            },
        });
    }
    console.log('✓ Seeded 15 Today OPD Appointments across specialties');

    // ─────────────────────────────────────────────────────────────
    // 12. OPD BILLS & RECEIPTS (20 Paid OPD Bills)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 20; i++) {
        const pat = patientsRoster[i];
        const doc = pick(doctorUsers, i);
        const invNum = `AVN-OPD-26-27-${String(i + 1).padStart(3, '0')}`;
        const rcpNum = `AVN-RCP-26-27-${String(i + 1).padStart(3, '0')}`;
        const fee = doc.fee;
        const when = daysAgo(rint(0, 25, i + 3));

        const existingInv = await prisma.invoices.findUnique({ where: { invoice_number: invNum } });
        const inv = existingInv || await prisma.invoices.create({
            data: {
                invoice_number: invNum,
                patient_id: pat.pid,
                invoice_type: 'OPD',
                is_fee_receipt: true,
                status: 'Final',
                total_amount: fee,
                net_amount: fee,
                paid_amount: fee,
                balance_due: 0,
                doctor_name: doc.name,
                organizationId: resolvedOrgId,
                created_at: when,
                finalized_at: when,
            } as any,
        });

        const existingItem = await prisma.invoice_items.findFirst({ where: { invoice_id: inv.id } });
        if (!existingItem) {
            await prisma.invoice_items.create({
                data: {
                    invoice_id: inv.id,
                    department: doc.specialty,
                    description: `OPD Consultation - ${doc.name}`,
                    quantity: 1,
                    unit_price: fee,
                    total_price: fee,
                    net_price: fee,
                    service_category: 'Consultation',
                    rendered_by_doctor_id: doc.id,
                    organizationId: resolvedOrgId,
                    created_at: when,
                } as any,
            });
        }

        const existingRcp = await prisma.payments.findUnique({ where: { receipt_number: rcpNum } });
        if (!existingRcp) {
            await prisma.payments.create({
                data: {
                    receipt_number: rcpNum,
                    invoice_id: inv.id,
                    amount: fee,
                    payment_method: pick(['UPI', 'Cash', 'Card'], i),
                    payment_type: 'Full',
                    status: 'Completed',
                    received_by: 'receptionist',
                    organizationId: resolvedOrgId,
                    created_at: when,
                } as any,
            });
        }
    }
    console.log('✓ Seeded 20 Finalized & Paid OPD Invoices & Receipts');

    // ─────────────────────────────────────────────────────────────
    // 13. IPD ADMISSIONS (14 Admissions: 8 Active + 6 Discharged)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 14; i++) {
        const isActive = i < 8; // 8 active in-patients, 6 discharged
        const pat = patientsRoster[20 + i];
        const doc = pick(doctorUsers, i + 1);
        const bed = bedsRoster[i % bedsRoster.length];
        const admId = `AVN-ADM-26-27-${String(i + 1).padStart(3, '0')}`;
        const admittedOn = daysAgo(isActive ? rint(1, 7, i + 2) : rint(10, 30, i + 2));
        const dischargedOn = isActive ? null : daysAgo(rint(1, 5, i));
        const diagnosis = pick(DIAGNOSES, i);

        const existingAdm = await prisma.admissions.findUnique({ where: { admission_id: admId } });
        const adm = existingAdm || await prisma.admissions.create({
            data: {
                admission_id: admId,
                patient_id: pat.pid,
                bed_id: bed.bedId,
                ward_id: bed.wardId,
                status: isActive ? 'Admitted' : 'Discharged',
                diagnosis,
                doctor_name: doc.name,
                attending_doctor_id: doc.id,
                admission_date: admittedOn,
                discharge_date: dischargedOn,
                organizationId: resolvedOrgId,
            } as any,
        });

        if (isActive) {
            await prisma.beds.update({
                where: { bed_id: bed.bedId },
                data: { status: 'Occupied', last_occupied_by: pat.name },
            });
        }

        // Dual-write Vitals for admitted patients
        const existingVitals = await prisma.iPDVitals.findFirst({ where: { admission_id: adm.admission_id } });
        if (!existingVitals) {
            const sys = rint(110, 138, i);
            const dia = rint(70, 88, i);
            const hr = rint(68, 86, i);
            const temp = 98.4 + (i % 3) * 0.4;
            const spo2 = rint(96, 99, i);

            await prisma.iPDVitals.create({
                data: {
                    admission_id: adm.admission_id,
                    patient_id: pat.pid,
                    bp_systolic: sys,
                    bp_diastolic: dia,
                    heart_rate: hr,
                    temperature: temp,
                    spo2: spo2,
                    respiratory_rate: 18,
                    recorded_by: 'nurse',
                    organizationId: resolvedOrgId,
                    created_at: admittedOn,
                },
            });

            await prisma.vital_signs.create({
                data: {
                    patient_id: pat.pid,
                    blood_pressure: `${sys}/${dia}`,
                    heart_rate: hr,
                    temperature: temp,
                    oxygen_sat: spo2,
                    respiratory_rate: 18,
                    recorded_by: 'nurse',
                    organizationId: resolvedOrgId,
                    created_at: admittedOn,
                },
            });
        }

        // Medical Notes
        const existingNote = await prisma.medical_notes.findFirst({ where: { admission_id: adm.admission_id } });
        if (!existingNote) {
            await prisma.medical_notes.create({
                data: {
                    admission_id: adm.admission_id,
                    note_type: 'Doctor Round Note',
                    details: `Patient examined. Vitals stable. Responding well to protocol. Continue IV fluids and prescribed antibiotics. Review in evening. — ${doc.name}`,
                    organizationId: resolvedOrgId,
                    created_at: admittedOn,
                },
            });
        }

        // IPD Billing Calculation
        const daysStay = isActive ? rint(2, 5, i) : rint(3, 8, i);
        const roomTotal = bed.rate * daysStay;
        const nursingTotal = 500 * daysStay;
        const medsTotal = rint(2500, 8000, i);
        const procTotal = rint(3000, 15000, i);
        const netTotal = roomTotal + nursingTotal + medsTotal + procTotal;
        const paidAmount = isActive ? Math.round(netTotal * 0.5) : netTotal;

        const ipdInvNum = isActive ? null : `AVN-IPD-26-27-${String(i + 1).padStart(3, '0')}`;
        const existingIpdInv = await prisma.invoices.findFirst({ where: { admission_id: adm.admission_id } });
        const ipdInv = existingIpdInv || await prisma.invoices.create({
            data: {
                invoice_number: ipdInvNum,
                patient_id: pat.pid,
                admission_id: adm.admission_id,
                invoice_type: 'IPD',
                status: isActive ? 'Draft' : 'Final',
                total_amount: netTotal,
                net_amount: netTotal,
                paid_amount: paidAmount,
                balance_due: netTotal - paidAmount,
                doctor_name: doc.name,
                organizationId: resolvedOrgId,
                created_at: admittedOn,
                finalized_at: dischargedOn,
            } as any,
        });

        const existingItems = await prisma.invoice_items.count({ where: { invoice_id: ipdInv.id } });
        if (existingItems === 0) {
            await prisma.invoice_items.createMany({
                data: [
                    {
                        invoice_id: ipdInv.id,
                        department: 'IPD',
                        description: `${bed.wardName} - Room Stay (${daysStay} days)`,
                        quantity: daysStay,
                        unit_price: bed.rate,
                        total_price: roomTotal,
                        net_price: roomTotal,
                        service_category: 'RoomCharge',
                        organizationId: resolvedOrgId,
                        created_at: admittedOn,
                    },
                    {
                        invoice_id: ipdInv.id,
                        department: 'IPD',
                        description: `Nursing Care Charges (${daysStay} days)`,
                        quantity: daysStay,
                        unit_price: 500,
                        total_price: nursingTotal,
                        net_price: nursingTotal,
                        service_category: 'NursingCharge',
                        organizationId: resolvedOrgId,
                        created_at: admittedOn,
                    },
                    {
                        invoice_id: ipdInv.id,
                        department: 'Pharmacy',
                        description: 'Inpatient Injectables & Oral Medication Package',
                        quantity: 1,
                        unit_price: medsTotal,
                        total_price: medsTotal,
                        net_price: medsTotal,
                        service_category: 'Pharmacy',
                        organizationId: resolvedOrgId,
                        created_at: admittedOn,
                    },
                    {
                        invoice_id: ipdInv.id,
                        department: 'Surgery',
                        description: 'Clinical Care & Monitoring Protocol',
                        quantity: 1,
                        unit_price: procTotal,
                        total_price: procTotal,
                        net_price: procTotal,
                        service_category: 'ProcedureCharge',
                        organizationId: resolvedOrgId,
                        created_at: admittedOn,
                    },
                ] as any,
            });
        }

        // Inpatient Deposit for Active Patient
        if (isActive) {
            const depNum = `AVN-DEP-26-27-${String(i + 1).padStart(3, '0')}`;
            const existingDep = await prisma.patientDeposit.findUnique({ where: { deposit_number: depNum } });
            if (!existingDep) {
                await prisma.patientDeposit.create({
                    data: {
                        deposit_number: depNum,
                        patient_id: pat.pid,
                        admission_id: adm.admission_id,
                        amount: 15000,
                        applied_amount: 0,
                        refunded_amount: 0,
                        payment_method: 'UPI',
                        status: 'Active',
                        collected_by: 'receptionist',
                        organizationId: resolvedOrgId,
                        created_at: admittedOn,
                    } as any,
                });
            }
        }
    }
    console.log('✓ Seeded 14 IPD Admissions (8 Active + 6 Discharged) with Beds, Vitals, Notes & Billing');

    // ─────────────────────────────────────────────────────────────
    // 14. DIAGNOSTIC LAB ORDERS & RESULTS (10 Orders)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
        const pat = patientsRoster[i];
        const doc = pick(doctorUsers, i);
        const barcode = `AVN-LAB-2026-${String(1001 + i)}`;
        const test = pick(labTests, i);
        const status = i < 6 ? 'Completed' : i < 8 ? 'In Progress' : 'Sample Collected';
        const resultVal = i < 6 ? 'Normal Range — All parameters verified within standard biological reference values.' : null;

        await prisma.lab_orders.upsert({
            where: { barcode },
            update: { status, result_value: resultVal, technician_remarks: 'Verified by Pathologist' },
            create: {
                barcode,
                patient_id: pat.pid,
                doctor_id: doc.id,
                test_type: test.test_name,
                status,
                result_value: resultVal,
                technician_remarks: 'Specimen processed and verified by Senior Biochemist',
                assigned_technician_id: userMap['lab_technician'],
                organizationId: resolvedOrgId,
                created_at: daysAgo(rint(0, 10, i + 1)),
            },
        });
    }
    console.log('✓ Seeded 10 Diagnostic Lab Orders with Verified Test Results');

    // ─────────────────────────────────────────────────────────────
    // 15. PHARMACY ORDERS & DISPENSING (8 Orders)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
        const pat = patientsRoster[i + 5];
        const doc = pick(doctorUsers, i);
        const indentNum = `AVN-IND-26-27-${String(i + 1).padStart(3, '0')}`;
        const med1 = pick(medicineRecords, i);
        const med2 = pick(medicineRecords, i + 10);
        const total = (med1.price * 10) + (med2.price * 10);

        const existingOrd = await prisma.pharmacy_orders.findUnique({ where: { indent_number: indentNum } });
        const ord = existingOrd || await prisma.pharmacy_orders.create({
            data: {
                indent_number: indentNum,
                patient_id: pat.pid,
                doctor_id: doc.id,
                requested_by_name: doc.name,
                total_amount: total,
                status: 'Dispensed',
                total_items_requested: 2,
                items_dispensed: 2,
                verified_by: 'pharmacist',
                verified_at: new Date(),
                organizationId: resolvedOrgId,
                created_at: daysAgo(rint(0, 15, i + 2)),
            },
        });

        const itemsCount = await prisma.pharmacy_order_items.count({ where: { order_id: ord.id } });
        if (itemsCount === 0) {
            await prisma.pharmacy_order_items.createMany({
                data: [
                    {
                        order_id: ord.id,
                        medicine_id: med1.id,
                        medicine_name: med1.brand_name,
                        quantity_requested: 10,
                        quantity_dispensed: 10,
                        unit_price: med1.price,
                        total_price: med1.price * 10,
                    },
                    {
                        order_id: ord.id,
                        medicine_id: med2.id,
                        medicine_name: med2.brand_name,
                        quantity_requested: 10,
                        quantity_dispensed: 10,
                        unit_price: med2.price,
                        total_price: med2.price * 10,
                    },
                ],
            });
        }
    }
    console.log('✓ Seeded 8 Pharmacy Dispensed Orders & Prescriptions');

    // ─────────────────────────────────────────────────────────────
    // 16. TPA INSURANCE POLICIES & CLAIMS (5 Active Cashless Claims)
    // ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
        const pat = patientsRoster[i * 4];
        const ins = pick(insuranceRecords, i);
        const policyNum = `POL-${ins.code}-${String(100000 + i * 4929)}`;
        const claimNum = `CLM-${ins.code}-2026-${String(1001 + i)}`;
        const claimAmount = rint(35000, 85000, i + 7);
        const status = i < 2 ? 'Approved' : i < 4 ? 'Submitted' : 'Pre-Auth Approved';

        let policy = await prisma.insurance_policies.findFirst({
            where: { policy_number: policyNum },
        });

        if (!policy) {
            policy = await prisma.insurance_policies.create({
                data: {
                    patient_id: pat.pid,
                    provider_id: ins.id,
                    policy_number: policyNum,
                    policy_holder: pat.name,
                    plan_name: `${ins.name} Comprehensive Health Shield`,
                    coverage_limit: 500000,
                    remaining_limit: 450000,
                    status: 'Active',
                    organizationId: resolvedOrgId,
                },
            });
        }

        // Find an invoice for this patient
        const inv = await prisma.invoices.findFirst({
            where: { patient_id: pat.pid, organizationId: resolvedOrgId },
        });

        if (inv) {
            const existingClaim = await prisma.insurance_claims.findFirst({
                where: { claim_number: claimNum },
            });

            if (!existingClaim) {
                await prisma.insurance_claims.create({
                    data: {
                        claim_number: claimNum,
                        policy_id: policy.id,
                        invoice_id: inv.id,
                        claimed_amount: claimAmount,
                        approved_amount: i < 2 ? claimAmount - 3000 : null,
                        status,
                        organizationId: resolvedOrgId,
                        submitted_at: daysAgo(rint(1, 15, i)),
                    },
                });
            }
        }
    }
    console.log('✓ Seeded 5 TPA Insurance Cashless Claims Lifecycle');

    // ─────────────────────────────────────────────────────────────
    // 17. GENERAL LEDGER CHART OF ACCOUNTS & EXPENSES
    // ─────────────────────────────────────────────────────────────
    const standardCoA = [
        { code: '1000', name: 'Assets', type: 'Asset', group: 'Assets', normal: 'Debit', ledger: 'Assets', tGroup: 'Assets' },
        { code: '1100', name: 'Current Assets', type: 'Asset', group: 'Current Assets', parent: '1000', normal: 'Debit', ledger: 'Current Assets', tGroup: 'Current Assets' },
        { code: '1110', name: 'Cash in Hand (Hospital Cash Counter)', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', ledger: 'Cash', tGroup: 'Cash-in-Hand' },
        { code: '1120', name: 'HDFC Bank Operating Account', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', ledger: 'Bank Accounts', tGroup: 'Bank Accounts' },
        { code: '1130', name: 'Patient Accounts Receivable', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', ledger: 'Sundry Debtors - Patients', tGroup: 'Sundry Debtors' },
        { code: '1150', name: 'TPA & Insurance Receivables', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', ledger: 'Sundry Debtors - Insurance', tGroup: 'Sundry Debtors' },
        { code: '1160', name: 'Pharmacy Stock in Hand', type: 'Asset', group: 'Current Assets', parent: '1100', normal: 'Debit', ledger: 'Stock - Pharmacy', tGroup: 'Stock-in-Hand' },
        { code: '2000', name: 'Liabilities', type: 'Liability', group: 'Liabilities', normal: 'Credit', ledger: 'Liabilities', tGroup: 'Liabilities' },
        { code: '2100', name: 'Current Liabilities', type: 'Liability', group: 'Current Liabilities', parent: '2000', normal: 'Credit', ledger: 'Current Liabilities', tGroup: 'Current Liabilities' },
        { code: '2110', name: 'Patient Security Deposits', type: 'Liability', group: 'Current Liabilities', parent: '2100', normal: 'Credit', ledger: 'Patient Deposits', tGroup: 'Current Liabilities' },
        { code: '2120', name: 'Sundry Creditors (Pharma & Consumables)', type: 'Liability', group: 'Current Liabilities', parent: '2100', normal: 'Credit', ledger: 'Sundry Creditors', tGroup: 'Sundry Creditors' },
        { code: '4000', name: 'Hospital Operating Revenue', type: 'Revenue', group: 'Revenue', normal: 'Credit', ledger: 'Operating Revenue', tGroup: 'Direct Incomes' },
        { code: '4100', name: 'OPD Consultation Revenue', type: 'Revenue', group: 'Revenue', parent: '4000', normal: 'Credit', ledger: 'OPD Income', tGroup: 'Direct Incomes' },
        { code: '4200', name: 'IPD Inpatient Revenue', type: 'Revenue', group: 'Revenue', parent: '4000', normal: 'Credit', ledger: 'IPD Income', tGroup: 'Direct Incomes' },
        { code: '4300', name: 'Pharmacy Sales Revenue', type: 'Revenue', group: 'Revenue', parent: '4000', normal: 'Credit', ledger: 'Pharmacy Sales', tGroup: 'Direct Incomes' },
        { code: '4400', name: 'Diagnostic & Lab Revenue', type: 'Revenue', group: 'Revenue', parent: '4000', normal: 'Credit', ledger: 'Laboratory Income', tGroup: 'Direct Incomes' },
        { code: '5000', name: 'Operating & Administrative Expenses', type: 'Expense', group: 'Expense', normal: 'Debit', ledger: 'Expenses', tGroup: 'Indirect Expenses' },
        { code: '5100', name: 'Medical & Surgical Supplies Expense', type: 'Expense', group: 'Expense', parent: '5000', normal: 'Debit', ledger: 'Medical Supplies', tGroup: 'Direct Expenses' },
        { code: '5200', name: 'Doctor Professional Honorarium', type: 'Expense', group: 'Expense', parent: '5000', normal: 'Debit', ledger: 'Doctor Honorarium', tGroup: 'Direct Expenses' },
        { code: '5300', name: 'Staff Salaries & Nursing Wages', type: 'Expense', group: 'Expense', parent: '5000', normal: 'Debit', ledger: 'Salaries & Wages', tGroup: 'Employee Benefit' },
        { code: '5400', name: 'Hospital Electricity, Power & Water', type: 'Expense', group: 'Expense', parent: '5000', normal: 'Debit', ledger: 'Utilities', tGroup: 'Indirect Expenses' },
    ];

    const coaMap = new Map<string, string>();

    for (const acc of standardCoA) {
        const parentId = acc.parent ? coaMap.get(acc.parent) : null;
        const existing = await prisma.gL_Account.findUnique({
            where: { account_code_organizationId: { account_code: acc.code, organizationId: resolvedOrgId } },
        });

        if (existing) {
            coaMap.set(acc.code, existing.id);
        } else {
            const created = await prisma.gL_Account.create({
                data: {
                    organizationId: resolvedOrgId,
                    account_code: acc.code,
                    account_name: acc.name,
                    account_type: acc.type as any,
                    account_group: acc.group,
                    parent_id: parentId,
                    normal_balance: acc.normal as any,
                    tally_ledger_name: acc.ledger,
                    tally_group: acc.tGroup,
                    opening_balance: 0,
                    current_balance: 0,
                    is_active: true,
                },
            });
            coaMap.set(acc.code, created.id);
        }
    }

    // Expense Categories
    const expenseCategories = [
        { name: 'Medical & Surgical Supplies', code: 'EXP_MED_SUPPLIES' },
        { name: 'Hospital Utilities & Diesel Generator', code: 'EXP_UTILITIES' },
        { name: 'Staff Welfare & Administrative', code: 'EXP_ADMIN_STAFF' },
        { name: 'Biomedical Equipment Maintenance (AMC)', code: 'EXP_BIOMED_AMC' },
    ];

    for (const ec of expenseCategories) {
        await prisma.expenseCategory.upsert({
            where: { code_organizationId: { code: ec.code, organizationId: resolvedOrgId } },
            update: { name: ec.name },
            create: { name: ec.name, code: ec.code, organizationId: resolvedOrgId },
        });
    }
    console.log('✓ Seeded Chart of Accounts (GL) & Expense Master');

    // ─────────────────────────────────────────────────────────────
    // SUMMARY REPORT
    // ─────────────────────────────────────────────────────────────
    console.log('\n===========================================================');
    console.log('🎉 AVANI HOSPITALS BOOTSTRAP SEED COMPLETED SUCCESSFULLY');
    console.log('===========================================================');
    console.log('Organization Name : Avani Hospitals');
    console.log(`Organization ID   : ${resolvedOrgId}`);
    console.log('Default Org Slug  : avani (Code: AVN)');
    console.log('───────────────────────────────────────────────────────────');
    console.log('SUPER ADMIN PORTAL (/superadmin/login):');
    console.log('  URL      : http://localhost:3000/superadmin/login');
    console.log('  Username : superadmin@hospitalos.com');
    console.log('  Password : superadmin@123');
    console.log('───────────────────────────────────────────────────────────');
    console.log('ALL STAFF PORTALS (/login):');
    console.log('  URL      : http://localhost:3000/login');
    console.log('  Password : role@123 (e.g. admin@123, doctor@123, etc.)');
    console.log('');
    for (const s of staffRoles) {
        console.log(`  ${s.role.padEnd(16)} -> username: ${s.username.padEnd(16)} | pass: ${s.username}@123 | ${s.name}`);
    }
    console.log('───────────────────────────────────────────────────────────');
    console.log('DATA SUMMARY:');
    console.log(`  • Departments    : 15 clinical & diagnostic departments`);
    console.log(`  • Doctors        : 8 consultant doctors with Indian credentials`);
    console.log(`  • Wards & Beds   : 6 wards with 48 active beds (AVN- prefix)`);
    console.log(`  • Diagnostics    : 20 pathology & radiology tests`);
    console.log(`  • Pharmacy       : 30 Indian branded medicines with live batch inventory`);
    console.log(`  • Charge Catalog : 25 service & procedure tariff rates`);
    console.log(`  • TPAs/Insurance : 7 major Indian insurance companies`);
    console.log(`  • Patients       : 50 authentic Indian patient master profiles (UHID AVN-2026-xxxxx)`);
    console.log(`  • OPD Bills      : 20 finalized & paid invoices with receipts`);
    console.log(`  • IPD Admissions : 14 admissions (8 active in-patients + 6 discharged)`);
    console.log(`  • Lab Orders     : 10 test orders with clinical results`);
    console.log(`  • Pharmacy Orders: 8 fulfilled dispensing orders`);
    console.log(`  • TPA Claims     : 5 cashless insurance claim lifecycles`);
    console.log(`  • Finance & GL   : Full Chart of Accounts & Expense categories`);
    console.log('===========================================================\n');
}

main()
    .catch((err) => {
        console.error('Seed execution error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
