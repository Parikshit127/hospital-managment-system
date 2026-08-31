/**
 * Create the dedicated organization the background activity generator writes to.
 *
 * INSERTS ONLY. Never reads, updates or deletes another organization's rows. Idempotent —
 * re-running reuses whatever already exists and tops up what is missing.
 *
 * This creates the *stage*, not the activity: staff accounts, departments, wards, beds,
 * a lab test menu and a small formulary. Patients and their visits come from the ticker
 * (app/lib/activity-tick.ts) so they accumulate at a believable rate rather than
 * appearing all at once.
 *
 *   npx tsx scripts/sim/bootstrap-org.ts            # create / top up, print the org id
 *   npx tsx scripts/sim/bootstrap-org.ts --reset    # delete ONLY this org's generated activity
 *
 * After running, put the printed id in the staging environment:
 *   SIM_ENABLED=1
 *   SIM_ORG_ID=<printed id>
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Identity of the organization
//
// This name, address and phone appear on screen and on every printed document, so the
// production should set them to whatever the script calls for. Everything here is
// editable afterwards from Superadmin → Organizations → Config / Branding without
// touching code — treat these as placeholders, not decisions.
//
// `code` becomes the UHID prefix (MGH-2026-00001) and the document number segment
// (MGH/OPD/26-27/001), so changing it later splits the numbering series. Pick it before
// the first take, not after.
// ---------------------------------------------------------------------------
const ORG = {
    name: 'Meridian General Hospital',
    slug: 'meridian-general',
    code: 'MGH',
    address: '17 Kasturba Marg, Bandra West, Mumbai, Maharashtra 400050',
    phone: '+91 22 6100 4000',
    email: 'contact@meridiangeneral.in',
};

const STAFF_PASSWORD = 'Meridian@2026';

const STAFF = [
    { username: 'mgh.admin', role: 'admin', name: 'Dr. Aparna Deshmukh', specialty: null },
    { username: 'mgh.reception', role: 'receptionist', name: 'Sneha Kulkarni', specialty: null },
    { username: 'mgh.nurse', role: 'nurse', name: 'Sister Grace Fernandes', specialty: null },
    { username: 'mgh.lab', role: 'lab_technician', name: 'Rohit Salunkhe', specialty: null },
    { username: 'mgh.pharmacy', role: 'pharmacist', name: 'Nikhil Shetty', specialty: null },
    { username: 'mgh.finance', role: 'finance', name: 'Meera Raghavan', specialty: null },
    { username: 'mgh.dr.menon', role: 'doctor', name: 'Dr. Anil Menon', specialty: 'General Medicine' },
    { username: 'mgh.dr.bose', role: 'doctor', name: 'Dr. Shreya Bose', specialty: 'Paediatrics' },
    { username: 'mgh.dr.qureshi', role: 'doctor', name: 'Dr. Faisal Qureshi', specialty: 'Orthopaedics' },
    { username: 'mgh.dr.pillai', role: 'doctor', name: 'Dr. Lakshmi Pillai', specialty: 'Obstetrics & Gynaecology' },
];

const DEPARTMENTS = [
    { name: 'General Medicine', fee: 700 },
    { name: 'Paediatrics', fee: 700 },
    { name: 'Orthopaedics', fee: 900 },
    { name: 'Obstetrics & Gynaecology', fee: 900 },
    { name: 'Emergency', fee: 1200 },
];

const WARDS = [
    { ward_name: 'General Ward', ward_type: 'General', cost_per_day: 2800, nursing_charge: 600, beds: 12 },
    { ward_name: 'Semi-Private', ward_type: 'SemiPrivate', cost_per_day: 4500, nursing_charge: 800, beds: 8 },
    { ward_name: 'Private Room', ward_type: 'Private', cost_per_day: 6500, nursing_charge: 1000, beds: 6 },
    { ward_name: 'ICU', ward_type: 'ICU', cost_per_day: 11000, nursing_charge: 1800, beds: 6 },
];

const LAB_TESTS = [
    { test_name: 'Complete Blood Count', test_code: 'CBC', price: 450, category: 'Haematology', sample_type: 'Blood', turnaround_time: '4 hours' },
    { test_name: 'Random Blood Sugar', test_code: 'RBS', price: 150, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '2 hours' },
    { test_name: 'Liver Function Test', test_code: 'LFT', price: 900, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '6 hours' },
    { test_name: 'Kidney Function Test', test_code: 'KFT', price: 850, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '6 hours' },
    { test_name: 'Thyroid Profile (T3 T4 TSH)', test_code: 'TFT', price: 700, category: 'Endocrinology', sample_type: 'Blood', turnaround_time: '12 hours' },
    { test_name: 'Urine Routine & Microscopy', test_code: 'URM', price: 300, category: 'Clinical Pathology', sample_type: 'Urine', turnaround_time: '3 hours' },
    { test_name: 'C-Reactive Protein', test_code: 'CRP', price: 600, category: 'Immunology', sample_type: 'Blood', turnaround_time: '5 hours' },
    { test_name: 'Chest X-Ray PA View', test_code: 'CXR', price: 500, category: 'Radiology', sample_type: 'Imaging', turnaround_time: '2 hours' },
    { test_name: 'Serum Electrolytes', test_code: 'SE', price: 550, category: 'Biochemistry', sample_type: 'Blood', turnaround_time: '4 hours' },
    { test_name: 'Dengue NS1 Antigen', test_code: 'DEN', price: 1100, category: 'Serology', sample_type: 'Blood', turnaround_time: '8 hours' },
];

const MEDICINES = [
    { brand_name: 'Crocin 650', generic_name: 'Paracetamol', strength: '650mg', form: 'Tablet', mrp: 32, pack: '1x15' },
    { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanic Acid', strength: '625mg', form: 'Tablet', mrp: 205, pack: '1x10' },
    { brand_name: 'Pan 40', generic_name: 'Pantoprazole', strength: '40mg', form: 'Tablet', mrp: 148, pack: '1x15' },
    { brand_name: 'Zifi 200', generic_name: 'Cefixime', strength: '200mg', form: 'Tablet', mrp: 178, pack: '1x10' },
    { brand_name: 'Emeset 4', generic_name: 'Ondansetron', strength: '4mg', form: 'Tablet', mrp: 42, pack: '1x10' },
    { brand_name: 'Combiflam', generic_name: 'Ibuprofen + Paracetamol', strength: '400mg', form: 'Tablet', mrp: 58, pack: '1x20' },
    { brand_name: 'Monocef 1g', generic_name: 'Ceftriaxone', strength: '1g', form: 'Injection', mrp: 96, pack: '1 vial' },
    { brand_name: 'Normal Saline 500ml', generic_name: 'Sodium Chloride 0.9%', strength: '500ml', form: 'IV Fluid', mrp: 55, pack: '1 bottle' },
    { brand_name: 'Deriphyllin', generic_name: 'Etophylline + Theophylline', strength: '', form: 'Injection', mrp: 28, pack: '1 amp' },
    { brand_name: 'Lasix 40', generic_name: 'Furosemide', strength: '40mg', form: 'Tablet', mrp: 36, pack: '1x15' },
    { brand_name: 'Metrogyl 400', generic_name: 'Metronidazole', strength: '400mg', form: 'Tablet', mrp: 44, pack: '1x15' },
    { brand_name: 'Allegra 120', generic_name: 'Fexofenadine', strength: '120mg', form: 'Tablet', mrp: 189, pack: '1x10' },
];

async function main() {
    const reset = process.argv.includes('--reset');

    let org = await prisma.organization.findFirst({ where: { code: ORG.code } });

    if (reset) {
        if (!org) { console.log('Nothing to reset — organization does not exist.'); return; }
        // Scoped to this org id only. Clears generated activity but keeps the stage
        // (staff, wards, beds, catalogues) so the engine can start again immediately.
        // Order matters — children before parents, or the FKs reject the delete.
        const o = { organizationId: org.id };
        console.log(`Clearing generated activity for ${ORG.name} (${org.id})…`);
        await prisma.gL_JournalLine.deleteMany({ where: o });
        await prisma.gL_JournalEntry.deleteMany({ where: o });
        await prisma.insurance_claims.deleteMany({ where: o });
        await prisma.insurance_policies.deleteMany({ where: o });
        await prisma.patientDeposit.deleteMany({ where: o });
        await prisma.medicationAdministration.deleteMany({ where: o });
        await prisma.activeMedication.deleteMany({ where: o });
        await prisma.nursingNote.deleteMany({ where: o });
        await prisma.iPDVitals.deleteMany({ where: o });
        await prisma.vital_signs.deleteMany({ where: o });
        await prisma.triage_results.deleteMany({ where: o });
        await prisma.payments.deleteMany({ where: o });
        await prisma.invoice_items.deleteMany({ where: o });
        await prisma.invoices.deleteMany({ where: o });
        await prisma.discharge_summaries.deleteMany({ where: o });
        await prisma.pharmacy_order_items.deleteMany({ where: { order: { organizationId: org.id } } });
        await prisma.pharmacy_orders.deleteMany({ where: o });
        await prisma.lab_orders.deleteMany({ where: o });
        await prisma.admissions.deleteMany({ where: o });
        await prisma.appointments.deleteMany({ where: o });
        await prisma.oPD_REG.deleteMany({ where: o });
        await prisma.system_audit_logs.deleteMany({ where: o });

        // Beds must go back to Available with the cleaning stamps cleared, or the next
        // run finds them Occupied/Cleaning against admissions that no longer exist and
        // the ward silently has nowhere to admit anyone.
        const beds = await prisma.beds.updateMany({
            where: o,
            data: {
                status: 'Available',
                cleaning_started_at: null,
                cleaning_completed_at: null,
                last_occupied_by: null,
            },
        });

        // Generation goes back off, so a reset can never leave the engine running.
        await prisma.organizationConfig.update({
            where: { organizationId: org.id },
            data: { activity_generator_enabled: false },
        });

        console.log(`Cleared. ${beds.count} beds returned to Available; generation switched off.`);
        console.log('Staff, wards, beds and catalogues left in place.');
        return;
    }

    if (!org) {
        org = await prisma.organization.create({
            data: { ...ORG, plan: 'enterprise', is_active: true },
        });
        console.log(`✓ Organization created: ${ORG.name}`);
    } else {
        console.log(`• Organization already exists — reusing (${org.id})`);
    }
    const orgId = org.id;

    // Belt and braces: this script only ever writes to the org whose code it declares.
    if (org.code !== ORG.code) throw new Error(`Refusing to seed: resolved org ${org.code} is not ${ORG.code}`);

    await prisma.organizationConfig.upsert({
        where: { organizationId: orgId },
        update: {},
        create: {
            organizationId: orgId,
            uhid_prefix: ORG.code,
            timezone: 'Asia/Kolkata',
            // Generation stays OFF until someone turns it on in Superadmin → Config.
            // Creating the stage should never start the activity.
            activity_generator_enabled: false,
            activity_generator_intensity: 'moderate',
        },
    });

    await prisma.organizationBranding.upsert({
        where: { organizationId: orgId },
        update: {},
        create: { organizationId: orgId, portal_title: ORG.name, portal_subtitle: 'Hospital Information System' },
    });

    // ── Staff ────────────────────────────────────────────────────────────────
    const hash = await bcrypt.hash(STAFF_PASSWORD, 10);
    let staffCreated = 0;
    for (const s of STAFF) {
        const existing = await prisma.user.findUnique({ where: { username: s.username } });
        if (existing) continue;
        await prisma.user.create({
            data: {
                username: s.username, password: hash, role: s.role, name: s.name,
                specialty: s.specialty, organizationId: orgId, is_active: true,
                email: `${s.username}@meridiangeneral.in`,
                consultation_fee: s.role === 'doctor' ? 800 : 0,
                follow_up_fee: s.role === 'doctor' ? 400 : 0,
            } as any,
        });
        staffCreated++;
    }
    console.log(`✓ Staff: ${staffCreated} created, ${STAFF.length - staffCreated} already present`);

    // ── Departments ──────────────────────────────────────────────────────────
    let deptCreated = 0;
    for (const d of DEPARTMENTS) {
        const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existing = await prisma.department.findFirst({ where: { organizationId: orgId, slug } });
        if (existing) continue;
        await prisma.department.create({
            data: { name: d.name, slug, base_consultation_fee: d.fee, organizationId: orgId, is_active: true },
        });
        deptCreated++;
    }
    console.log(`✓ Departments: ${deptCreated} created`);

    // ── Wards + beds ─────────────────────────────────────────────────────────
    let bedCount = 0;
    for (const w of WARDS) {
        let ward: any = await prisma.wards.findFirst({ where: { organizationId: orgId, ward_name: w.ward_name } });
        if (!ward) {
            ward = await prisma.wards.create({
                data: {
                    ward_name: w.ward_name, ward_type: w.ward_type, organizationId: orgId,
                    cost_per_day: w.cost_per_day, nursing_charge: w.nursing_charge,
                } as any,
            });
        }
        const wardId = ward.ward_id ?? ward.id;
        for (let i = 1; i <= w.beds; i++) {
            // bed_id is a GLOBAL key — prefix with the org code so it can never collide
            // with another hospital's bed.
            const bedId = `${ORG.code}-${w.ward_type.slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}`;
            const existing = await prisma.beds.findUnique({ where: { bed_id: bedId } });
            if (existing) { bedCount++; continue; }
            await prisma.beds.create({
                data: {
                    bed_id: bedId, bed_name: `${w.ward_name} ${i}`, bed_category: w.ward_type,
                    ward_id: wardId, status: 'Available', organizationId: orgId,
                } as any,
            });
            bedCount++;
        }
    }
    console.log(`✓ Wards: ${WARDS.length}, beds: ${bedCount}`);

    // ── Lab test menu ────────────────────────────────────────────────────────
    let testCreated = 0;
    for (const t of LAB_TESTS) {
        const existing = await prisma.lab_test_inventory.findFirst({
            where: { organizationId: orgId, test_name: t.test_name },
        });
        if (existing) continue;
        await prisma.lab_test_inventory.create({ data: { ...t, organizationId: orgId, is_available: true } as any });
        testCreated++;
    }
    console.log(`✓ Lab tests: ${testCreated} created`);

    // ── Formulary ────────────────────────────────────────────────────────────
    let medCreated = 0;
    for (const m of MEDICINES) {
        const existing = await prisma.pharmacy_medicine_master.findFirst({
            where: { organizationId: orgId, brand_name: m.brand_name },
        });
        if (existing) continue;
        await prisma.pharmacy_medicine_master.create({
            data: {
                ...m, organizationId: orgId, is_active: true,
                selling_price: m.mrp, purchase_price: Math.round(m.mrp * 0.72),
                price_per_unit: m.mrp, gst_percent: 12, tax_rate: 12,
            } as any,
        });
        medCreated++;
    }
    console.log(`✓ Medicines: ${medCreated} created`);

    // ── Chart of accounts ────────────────────────────────────────────────────
    // Minimal double-entry chart. The engine posts against these codes; if they are
    // missing it simply does not post rather than inventing accounts at runtime.
    const ACCOUNTS = [
        { account_code: '1100', account_name: 'Cash & Bank', account_type: 'Asset', normal_balance: 'Debit' },
        { account_code: '1200', account_name: 'Patient Receivables', account_type: 'Asset', normal_balance: 'Debit' },
        { account_code: '1300', account_name: 'TPA Receivables', account_type: 'Asset', normal_balance: 'Debit' },
        { account_code: '2100', account_name: 'Patient Advances', account_type: 'Liability', normal_balance: 'Credit' },
        { account_code: '4000', account_name: 'OPD Revenue', account_type: 'Income', normal_balance: 'Credit' },
        { account_code: '4100', account_name: 'IPD Revenue', account_type: 'Income', normal_balance: 'Credit' },
        { account_code: '4200', account_name: 'Pharmacy Revenue', account_type: 'Income', normal_balance: 'Credit' },
        { account_code: '4300', account_name: 'Laboratory Revenue', account_type: 'Income', normal_balance: 'Credit' },
    ];
    let glCreated = 0;
    for (const a of ACCOUNTS) {
        const existing = await prisma.gL_Account.findFirst({
            where: { organizationId: orgId, account_code: a.account_code },
        });
        if (existing) continue;
        await prisma.gL_Account.create({ data: { ...a, organizationId: orgId, is_active: true } as any });
        glCreated++;
    }
    console.log(`✓ GL accounts: ${glCreated} created`);

    // ── TPA providers ────────────────────────────────────────────────────────
    // provider_name and provider_code are GLOBALLY unique, not per-org, so these names
    // are deliberately distinctive to avoid colliding with another tenant's providers.
    const PROVIDERS = [
        { provider_name: 'Meridian Health Assurance TPA', provider_code: 'MGH-TPA-01', payment_terms_days: 45 },
        { provider_name: 'Konkan Medicare Services', provider_code: 'MGH-TPA-02', payment_terms_days: 30 },
        { provider_name: 'Deccan Family Health Cover', provider_code: 'MGH-TPA-03', payment_terms_days: 60 },
    ];
    let provCreated = 0;
    for (const pr of PROVIDERS) {
        const existing = await prisma.insurance_providers.findFirst({ where: { provider_code: pr.provider_code } });
        if (existing) continue;
        await prisma.insurance_providers.create({
            data: { ...pr, organizationId: orgId, is_active: true, tpa_type: 'tpa' } as any,
        });
        provCreated++;
    }
    console.log(`✓ TPA providers: ${provCreated} created`);

    console.log('\n────────────────────────────────────────────────');
    console.log(`Organization: ${ORG.name}`);
    console.log(`SIM_ORG_ID=${orgId}`);
    console.log(`SIM_ENABLED=1`);
    console.log(`Staff logins: ${STAFF.map(s => s.username).join(', ')}`);
    console.log(`Password:     ${STAFF_PASSWORD}`);
    console.log('────────────────────────────────────────────────');
    console.log('Generation is OFF. Enable it in Superadmin → Organizations → Config.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
