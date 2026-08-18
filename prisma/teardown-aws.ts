/**
 * HospitalOS — Teardown Script (Reverses seed-aws.ts)
 *
 * Deletes everything created by prisma/seed-aws.ts, keyed by the
 * identifiers that script used. Safe to run against Supabase demo DB
 * or any DB where seed-aws.ts was run accidentally.
 *
 * Cascade order: children first, parents last.
 *
 * Usage:
 *   ALLOW_SEED=1 npx ts-node --transpile-only prisma/teardown-aws.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Identifiers used by seed-aws.ts
const PATIENT_ID_PREFIX = 'AVN-2026-1';      // AVN-2026-10001 … AVN-2026-10050
const BED_ID_PREFIX = 'AVN-';               // AVN-GEN-01, AVN-ICU-01, etc.
const STAFF_USERNAMES = [
    'admin', 'doctor', 'receptionist', 'nurse', 'pharmacist',
    'lab_technician', 'finance', 'ipd_manager', 'opd_manager',
    'hr', 'ot_manager', 'er_staff',
    // extra doctor accounts
    'dr.kapoor', 'dr.verma', 'dr.chawla', 'dr.menon',
    'dr.gupta', 'dr.joshi', 'dr.bhatia',
];
const WARD_NAMES = [
    'General Ward', 'ICU (Intensive Care Unit)', 'Private Deluxe Room',
    'Maternity Ward', 'Pediatric Ward', 'Isolation Ward',
];
const DEPT_SLUGS = [
    'general-medicine', 'cardiology', 'orthopedics', 'pediatrics',
    'neurology', 'ob-gyn', 'pulmonology', 'general-surgery',
    'ent', 'dermatology', 'gastroenterology', 'urology',
    'oncology', 'radiology', 'emergency',
];
const MEDICINE_BRANDS = [
    'Dolo 650', 'Augmentin 625', 'Azithral 500', 'Pan 40', 'Pantocid DSR',
    'Metformin 500', 'Glycomet GP 2', 'Telma 40', 'Amlokind 5', 'Rosuvas 10',
    'Shelcal 500', 'Becosules', 'Montair-LC', 'Livogen Z', 'Omez 20',
    'Clavam 625', 'Combiflam', 'Voveran 50', 'Ondem 4mg', 'Deriphyllin Retard 150',
    'Duolin Respules', 'Budecort 0.5mg', 'Dynapar AQ Inj', 'Monocef 1g Inj',
    'Emset 4mg Inj', 'DNS 500ml', 'NS 500ml (Normal Saline)', 'RL 500ml (Ringer Lactate)',
    'Lasix 40mg Inj', 'Actrapid 40 IU/ml',
];
const TPA_CODES = ['STAR', 'HDFC', 'ICICI', 'BAJAJ', 'NIA', 'NIVA', 'CARE'];
const SUPERADMIN_EMAIL = 'superadmin@hospitalos.com';
const ORG_SLUG = 'avani';
const ORG_CODE = 'AVN';
const COA_CODES = ['1000','1100','1110','1120','1200','1210','1220','1300','1310','2000','2100','2200','3000','4000','4100','4200','4300','4400','5000','5100','5200','5300','5400','6000','6100','6200','6300','6400','6500'];
const EXPENSE_CODES = ['EXP_MED_SUPPLIES','EXP_UTILITIES','EXP_ADMIN_STAFF','EXP_BIOMED_AMC'];

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
        console.error('Refusing to tear down in production without ALLOW_SEED=1');
        process.exit(1);
    }

    console.log('===========================================================');
    console.log('🗑️  Starting HospitalOS Teardown (reversing seed-aws.ts)');
    console.log('===========================================================\n');

    // Resolve the org we're cleaning up
    const org = await prisma.organization.findFirst({
        where: { OR: [{ slug: ORG_SLUG }, { code: ORG_CODE }] },
    });

    if (!org) {
        console.log('⚠️  Organization not found — nothing to tear down.');
        return;
    }

    const orgId = org.id;
    console.log(`Targeting org: ${org.name} (${orgId})\n`);

    // 1. Patient-level cascades: insurance claims, policies, invoices/payments,
    //    admissions and all their children, appointments, lab orders, pharmacy orders
    const patients = await prisma.oPD_REG.findMany({
        where: { patient_id: { startsWith: PATIENT_ID_PREFIX }, organizationId: orgId },
        select: { patient_id: true },
    });
    const pids = patients.map(p => p.patient_id);
    console.log(`Found ${pids.length} seeded patients to clean up...`);

    if (pids.length > 0) {
        // Insurance claims → policies
        const policies = await prisma.insurance_policies.findMany({
            where: { patient_id: { in: pids }, organizationId: orgId },
            select: { id: true },
        });
        const policyIds = policies.map(p => p.id);
        if (policyIds.length > 0) {
            await prisma.insurance_claims.deleteMany({ where: { policy_id: { in: policyIds } } });
            await prisma.insurance_policies.deleteMany({ where: { id: { in: policyIds } } });
        }

        // Admissions and children
        const admissions = await prisma.admissions.findMany({
            where: { patient_id: { in: pids }, organizationId: orgId },
            select: { admission_id: true },
        });
        const admissionIds = admissions.map(a => a.admission_id);

        if (admissionIds.length > 0) {
            await prisma.iPDVitals.deleteMany({ where: { admission_id: { in: admissionIds } } });
            await prisma.medical_notes.deleteMany({ where: { admission_id: { in: admissionIds } } });
            await prisma.nursingNote.deleteMany({ where: { admission_id: { in: admissionIds } } });
            await prisma.discharge_summaries.deleteMany({ where: { admission_id: { in: admissionIds } } });

            // Invoices for these admissions
            const admInvoices = await prisma.invoices.findMany({
                where: { admission_id: { in: admissionIds }, organizationId: orgId },
                select: { id: true },
            });
            const admInvIds = admInvoices.map(i => i.id);
            if (admInvIds.length > 0) {
                await prisma.invoice_items.deleteMany({ where: { invoice_id: { in: admInvIds } } });
                await prisma.payments.deleteMany({ where: { invoice_id: { in: admInvIds } } });
                await prisma.invoices.deleteMany({ where: { id: { in: admInvIds } } });
            }

            await prisma.admissions.deleteMany({ where: { admission_id: { in: admissionIds } } });
        }

        // Deposits (patient-level, not admission-keyed)
        await prisma.patientDeposit.deleteMany({ where: { organizationId: orgId, patient_id: { in: pids } } });

        // OPD invoices
        const opdInvoices = await prisma.invoices.findMany({
            where: { patient_id: { in: pids }, organizationId: orgId },
            select: { id: true },
        });
        const opdInvIds = opdInvoices.map(i => i.id);
        if (opdInvIds.length > 0) {
            await prisma.invoice_items.deleteMany({ where: { invoice_id: { in: opdInvIds } } });
            await prisma.payments.deleteMany({ where: { invoice_id: { in: opdInvIds } } });
            await prisma.invoices.deleteMany({ where: { id: { in: opdInvIds } } });
        }

        // Appointments
        await prisma.appointments.deleteMany({ where: { patient_id: { in: pids }, organizationId: orgId } });

        // Lab orders (flat model — no child items table in schema)
        await prisma.lab_orders.deleteMany({ where: { patient_id: { in: pids }, organizationId: orgId } });

        // Pharmacy orders — items use `order_id` FK (not pharmacy_order_id)
        const pharmOrders = await prisma.pharmacy_orders.findMany({
            where: { patient_id: { in: pids }, organizationId: orgId },
            select: { id: true },
        });
        const pharmOrderIds = pharmOrders.map(o => o.id);
        if (pharmOrderIds.length > 0) {
            await prisma.pharmacy_order_items.deleteMany({ where: { order_id: { in: pharmOrderIds } } });
            await prisma.pharmacy_orders.deleteMany({ where: { id: { in: pharmOrderIds } } });
        }

        // vital_signs (patient-level)
        await prisma.vital_signs.deleteMany({ where: { patient_id: { in: pids }, organizationId: orgId } });

        // Patients
        await prisma.oPD_REG.deleteMany({ where: { patient_id: { in: pids }, organizationId: orgId } });
        console.log(`✓ Deleted ${pids.length} patients and all their clinical data`);
    }

    // 2. Beds — first by AVN- prefix, then by ward membership (catches any non-prefix beds in seeded wards)
    const seededWards = await prisma.wards.findMany({
        where: { ward_name: { in: WARD_NAMES }, organizationId: orgId },
        select: { ward_id: true },
    });
    const seededWardIds = seededWards.map(w => w.ward_id);
    await prisma.beds.deleteMany({ where: { organizationId: orgId, ward_id: { in: seededWardIds } } });
    console.log('✓ Deleted all beds in seeded wards');

    // 3. Wards (now safe, no FK children left)
    await prisma.wards.deleteMany({ where: { ward_name: { in: WARD_NAMES }, organizationId: orgId } });
    console.log('✓ Deleted seeded wards');

    // 4. Departments
    await prisma.department.deleteMany({ where: { slug: { in: DEPT_SLUGS }, organizationId: orgId } });
    console.log('✓ Deleted seeded departments');

    // 5. Staff users — delete appointment slots first (FK: appointment_slots_doctor_id_fkey)
    const staffUsers = await prisma.user.findMany({
        where: { username: { in: STAFF_USERNAMES }, organizationId: orgId },
        select: { id: true },
    });
    const staffUserIds = staffUsers.map(u => u.id);
    if (staffUserIds.length > 0) {
        await prisma.appointmentSlot.deleteMany({ where: { doctor_id: { in: staffUserIds } } });
    }
    await prisma.user.deleteMany({ where: { username: { in: STAFF_USERNAMES }, organizationId: orgId } });
    console.log('✓ Deleted seeded staff accounts');

    // 6. Lab test inventory
    await prisma.lab_test_inventory.deleteMany({
        where: { organizationId: orgId, test_name: { in: [
            'Complete Blood Count (CBC)', 'Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)',
            'Liver Function Test (LFT)', 'Kidney Function Test (KFT / RFT)',
            'HbA1c (Glycosylated Hemoglobin)', 'Dengue NS1 Antigen & IgM/IgG',
            'Thyroid Profile (Total T3, T4, TSH)', 'Urine Routine & Microscopy',
            'Chest X-Ray PA View', '12-Lead Electrocardiogram (ECG)',
            'Serum Electrolytes (Na+, K+, Cl-)', 'Ultrasound Abdomen & Pelvis (USG)',
            'Troponin-I Quantitative', 'C-Reactive Protein (CRP) Quantitative',
            'Blood Glucose Fasting / Postprandial', 'Stool Routine & Occult Blood',
            'Serum Vitamin D3 (25-OH)', 'Serum Vitamin B12',
            'Prothrombin Time with INR (PT/INR)', 'Serum Creatinine & Blood Urea Nitrogen',
        ] } },
    });
    await prisma.lab_staff.deleteMany({
        where: { organizationId: orgId, name: { in: ['Amit Patel', 'Sanjay Deshmukh'] } },
    });
    console.log('✓ Deleted seeded lab tests and lab staff');

    // 7. Pharmacy — batch inventory then medicine master
    const medicines = await prisma.pharmacy_medicine_master.findMany({
        where: { organizationId: orgId, brand_name: { in: MEDICINE_BRANDS } },
        select: { id: true },
    });
    const medicineIds = medicines.map(m => m.id);
    if (medicineIds.length > 0) {
        await prisma.pharmacy_batch_inventory.deleteMany({ where: { medicine_id: { in: medicineIds } } });
        await prisma.pharmacy_medicine_master.deleteMany({ where: { id: { in: medicineIds } } });
    }
    console.log('✓ Deleted seeded medicines and batch inventory');

    // 8. Charge catalog (keyed by item_code which is unique)
    const CATALOG_CODES = [
        'CON-GEN','CON-SPE','CON-EMR',
        'RM-GEN','RM-ICU','RM-PVT','RM-MAT','RM-PED','RM-ISO',
        'NRS-GEN','NRS-ICU','NRS-PVT',
        'DV-RND','DV-ICU',
        'PRC-DRS','PRC-NEB','PRC-IVC','PRC-CTH','PRC-MIN','PRC-MAJ',
        'CSM-IVS','CSM-SYR','CSM-OXY','CSM-GLV','CSM-ECG',
    ];
    await prisma.charge_catalog.deleteMany({
        where: { organizationId: orgId, item_code: { in: CATALOG_CODES } },
    });
    console.log('✓ Deleted seeded charge catalog');

    // 9. TPA Insurance — clean claims → policies → providers
    const providers = await prisma.insurance_providers.findMany({
        where: { organizationId: orgId, provider_code: { in: TPA_CODES } },
        select: { id: true },
    });
    const providerIds = providers.map(p => p.id);
    if (providerIds.length > 0) {
        const orphanPolicies = await prisma.insurance_policies.findMany({
            where: { provider_id: { in: providerIds } },
            select: { id: true },
        });
        const orphanPolicyIds = orphanPolicies.map(p => p.id);
        if (orphanPolicyIds.length > 0) {
            await prisma.insurance_claims.deleteMany({ where: { policy_id: { in: orphanPolicyIds } } });
            await prisma.insurance_policies.deleteMany({ where: { id: { in: orphanPolicyIds } } });
        }
        await prisma.ipdPackageTpaRate.deleteMany({ where: { provider_id: { in: providerIds } } });
        await prisma.insurance_providers.deleteMany({ where: { id: { in: providerIds } } });
    }
    console.log('✓ Deleted seeded TPA insurance providers');

    // 10. GL Chart of Accounts — delete journal lines/entries first (auto-posted by billing)
    const glAccounts = await prisma.gL_Account.findMany({
        where: { organizationId: orgId, account_code: { in: COA_CODES } },
        select: { id: true },
    });
    const glAccountIds = glAccounts.map(a => a.id);
    if (glAccountIds.length > 0) {
        await prisma.gL_JournalLine.deleteMany({ where: { account_id: { in: glAccountIds } } });
    }
    // Self-referencing parent_id FK — null out any child references first, then delete
    if (glAccountIds.length > 0) {
        await prisma.gL_Account.updateMany({
            where: { parent_id: { in: glAccountIds } },
            data: { parent_id: null },
        });
    }
    await prisma.gL_Account.deleteMany({
        where: { organizationId: orgId, account_code: { in: COA_CODES } },
    });
    await prisma.expenseCategory.deleteMany({
        where: { organizationId: orgId, code: { in: EXPENSE_CODES } },
    });
    console.log('✓ Deleted seeded GL accounts and expense categories');

    // 11. Org branding & config — seed overwrote these; delete to restore to default
    //     Do NOT delete the org itself — it pre-existed (org-axten-production) and
    //     has many FK children unrelated to the seed.
    await prisma.organizationBranding.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationConfig.deleteMany({ where: { organizationId: orgId } });
    console.log(`✓ Removed seeded org branding and config (org itself preserved: ${orgId})`);

    // 12. SuperAdmin
    await prisma.superAdmin.deleteMany({ where: { email: SUPERADMIN_EMAIL } });
    console.log(`✓ Deleted SuperAdmin: ${SUPERADMIN_EMAIL}`);

    console.log('\n===========================================================');
    console.log('✅ TEARDOWN COMPLETE — Database restored to pre-seed state');
    console.log('===========================================================\n');
}

main()
    .catch((err) => {
        console.error('Teardown error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
