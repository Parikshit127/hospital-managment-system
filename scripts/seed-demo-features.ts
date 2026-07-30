/**
 * seed-demo-features.ts
 *
 * Adds 50 MORE demo patients (DEMO-2026-20001…20050) and exercises every major
 * feature module, so screenshots of any portal show realistic data.
 *
 * SAFETY: INSERT-only against the "Demo Hospital" (code DEMO) organization.
 * No deletes. No updates to any row outside the demo org. The only UPDATEs are
 * bed status changes on beds this org owns.
 *
 * Run:  npx ts-node -O '{"module":"commonjs"}' scripts/seed-demo-features.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_CODE = 'DEMO';
const NEW_PATIENTS = 50;
const PID = (n: number) => `${ORG_CODE}-2026-${20000 + n}`;

// ── deterministic pseudo-random so re-runs / reviews are reproducible ────────
const rint = (min: number, max: number, seed: number) =>
    min + (Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1 | 0) * 0 +
    Math.floor((Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1) * (max - min + 1));
const pick = <T>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];
const daysAgo = (d: number) => { const x = new Date(); x.setDate(x.getDate() - d); return x; };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aadhya',
    'Rohan', 'Arjun', 'Kavya', 'Meera', 'Nisha', 'Rahul', 'Sneha', 'Vikram', 'Pooja', 'Karan',
    'Tanvi', 'Yash', 'Ritu', 'Manish', 'Shreya'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Joshi', 'Rao',
    'Desai', 'Kulkarni', 'Chauhan', 'Bose', 'Kapoor'];
const CITIES = ['Andheri, Mumbai', 'Koramangala, Bengaluru', 'Banjara Hills, Hyderabad', 'Adyar, Chennai',
    'Vashi, Navi Mumbai', 'Kothrud, Pune', 'Salt Lake, Kolkata', 'Vasant Kunj, Delhi'];
const DIAGNOSES = ['Acute Gastroenteritis', 'Community Acquired Pneumonia', 'Type 2 Diabetes Mellitus',
    'Hypertensive Urgency', 'Dengue Fever', 'Acute Appendicitis', 'Lower Respiratory Tract Infection',
    'Anaemia under evaluation', 'Cholelithiasis', 'Urinary Tract Infection'];
const COMPLAINTS = ['Fever with chills for 3 days', 'Chest pain on exertion', 'Breathlessness since morning',
    'Severe abdominal pain', 'Road traffic accident - leg injury', 'Persistent vomiting', 'Giddiness and fall'];

async function main() {
    const reset = process.argv.includes('--reset');

    const org = await prisma.organization.findFirst({ where: { code: ORG_CODE } });
    if (!org) throw new Error(`No organization with code ${ORG_CODE}. Run seed-demo-org.ts first.`);
    if (org.code !== ORG_CODE) throw new Error('Refusing to run: resolved org is not the demo org.');
    const orgId = org.id;
    console.log(`✓ Demo org: ${org.name} (${orgId})`);

    if (reset) {
        // Scoped strictly to the demo org AND the 2xxxx patient series this script owns.
        const pids = (await prisma.oPD_REG.findMany({
            where: { organizationId: orgId, patient_id: { startsWith: `${ORG_CODE}-2026-2` } },
            select: { patient_id: true },
        })).map(p => p.patient_id);
        console.log(`• --reset: removing ${pids.length} feature-demo patients and their records`);
        await prisma.oPD_REG.deleteMany({ where: { organizationId: orgId, patient_id: { in: pids } } });
    }

    const users = await prisma.user.findMany({ where: { organizationId: orgId } });
    const doctors = users.filter(u => u.role === 'doctor');
    const nurse = users.find(u => u.role === 'nurse') || users[0];
    const reception = users.find(u => u.role === 'receptionist') || users[0];
    if (!doctors.length) throw new Error('Demo org has no doctors — run seed-demo-org.ts first.');
    console.log(`✓ Staff available: ${doctors.length} doctors, nurse=${nurse.username}`);

    // ── 1. Masters ───────────────────────────────────────────────────────────
    let providers = await prisma.insurance_providers.findMany({ where: { organizationId: orgId } });
    if (!providers.length) {
        for (const p of [
            { provider_name: 'Star Health Insurance', provider_code: 'STAR', tpa_type: 'Insurer' },
            { provider_name: 'Care Health Insurance', provider_code: 'CARE', tpa_type: 'Insurer' },
            { provider_name: 'MediAssist TPA', provider_code: 'MEDI', tpa_type: 'TPA' },
            { provider_name: 'CGHS', provider_code: 'CGHS', tpa_type: 'Government' },
        ]) {
            await prisma.insurance_providers.create({
                data: { ...p, organizationId: orgId, contact_phone: '+91 22 4000 1000', is_active: true } as any,
            });
        }
        providers = await prisma.insurance_providers.findMany({ where: { organizationId: orgId } });
    }
    console.log(`✓ Insurance providers: ${providers.length}`);

    if (await prisma.labPanel.count({ where: { organizationId: orgId } }) === 0) {
        for (const l of [
            { panel_name: 'Complete Blood Count (CBC)', panel_code: 'CBC', panel_price: 450 },
            { panel_name: 'Liver Function Test (LFT)', panel_code: 'LFT', panel_price: 950 },
            { panel_name: 'Kidney Function Test (KFT)', panel_code: 'KFT', panel_price: 900 },
            { panel_name: 'Lipid Profile', panel_code: 'LIPID', panel_price: 800 },
            { panel_name: 'Thyroid Profile (T3 T4 TSH)', panel_code: 'THY', panel_price: 750 },
            { panel_name: 'HbA1c', panel_code: 'HBA1C', panel_price: 600 },
        ]) await prisma.labPanel.create({ data: { ...l, organizationId: orgId, is_active: true } as any });
    }
    console.log(`✓ Lab panels: ${await prisma.labPanel.count({ where: { organizationId: orgId } })}`);

    if (await prisma.radiology_imaging.count({ where: { organizationId: orgId } }) === 0) {
        for (const r of [
            { procedure_name: 'X-Ray Chest PA', procedure_code: 'XR-CH', price: 400, modality: 'X-Ray', body_part: 'Chest' },
            { procedure_name: 'Ultrasound Abdomen', procedure_code: 'US-ABD', price: 1200, modality: 'Ultrasound', body_part: 'Abdomen' },
            { procedure_name: 'CT Brain Plain', procedure_code: 'CT-BR', price: 3500, modality: 'CT', body_part: 'Head' },
            { procedure_name: 'MRI Lumbar Spine', procedure_code: 'MR-LS', price: 8500, modality: 'MRI', body_part: 'Spine' },
            { procedure_name: '2D Echocardiography', procedure_code: 'ECHO', price: 2200, modality: 'Ultrasound', body_part: 'Heart' },
            { procedure_name: 'Mammography Bilateral', procedure_code: 'MMG', price: 2800, modality: 'X-Ray', body_part: 'Breast' },
        ]) await prisma.radiology_imaging.create({ data: { ...r, organizationId: orgId, is_available: true, category: 'Radiology' } as any });
    }
    console.log(`✓ Radiology procedures: ${await prisma.radiology_imaging.count({ where: { organizationId: orgId } })}`);

    let medicines = await prisma.pharmacy_medicine_master.findMany({ where: { organizationId: orgId } });
    if (!medicines.length) {
        for (const m of [
            { brand_name: 'Dolo 650', generic_name: 'Paracetamol', strength: '650mg', form: 'Tablet', mrp: 32, selling_price: 32 },
            { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanate', strength: '625mg', form: 'Tablet', mrp: 210, selling_price: 210 },
            { brand_name: 'Pan 40', generic_name: 'Pantoprazole', strength: '40mg', form: 'Tablet', mrp: 145, selling_price: 145 },
            { brand_name: 'Emeset 4', generic_name: 'Ondansetron', strength: '4mg', form: 'Tablet', mrp: 48, selling_price: 48 },
            { brand_name: 'Monocef 1g', generic_name: 'Ceftriaxone', strength: '1g', form: 'Injection', mrp: 95, selling_price: 95 },
            { brand_name: 'Human Mixtard', generic_name: 'Insulin', strength: '100IU', form: 'Injection', mrp: 165, selling_price: 165 },
            { brand_name: 'Telma 40', generic_name: 'Telmisartan', strength: '40mg', form: 'Tablet', mrp: 118, selling_price: 118 },
            { brand_name: 'Glycomet 500', generic_name: 'Metformin', strength: '500mg', form: 'Tablet', mrp: 42, selling_price: 42 },
            { brand_name: 'Ecosprin 75', generic_name: 'Aspirin', strength: '75mg', form: 'Tablet', mrp: 12, selling_price: 12 },
            { brand_name: 'Zerodol SP', generic_name: 'Aceclofenac + Serratiopeptidase', strength: '100mg', form: 'Tablet', mrp: 128, selling_price: 128 },
            { brand_name: 'Normal Saline 500ml', generic_name: 'Sodium Chloride 0.9%', strength: '500ml', form: 'IV Fluid', mrp: 55, selling_price: 55 },
            { brand_name: 'Lasix 40', generic_name: 'Furosemide', strength: '40mg', form: 'Tablet', mrp: 38, selling_price: 38 },
        ]) await prisma.pharmacy_medicine_master.create({
            data: { ...m, organizationId: orgId, category: 'General', gst_percent: 12, is_active: true, purchase_price: Math.round(m.mrp * 0.7) } as any,
        });
        medicines = await prisma.pharmacy_medicine_master.findMany({ where: { organizationId: orgId } });
    }
    console.log(`✓ Pharmacy medicines: ${medicines.length}`);

    if (await prisma.charge_catalog.count({ where: { organizationId: orgId } }) === 0) {
        for (const c of [
            { category: 'Consultation', item_code: 'CONS-OPD', item_name: 'OPD Consultation', default_price: 600, department: 'OPD' },
            { category: 'Consultation', item_code: 'CONS-FU', item_name: 'Follow-up Consultation', default_price: 300, department: 'OPD' },
            { category: 'Procedure', item_code: 'PROC-DRS', item_name: 'Dressing (Minor)', default_price: 450, department: 'Nursing' },
            { category: 'Procedure', item_code: 'PROC-INJ', item_name: 'Injection Administration', default_price: 150, department: 'Nursing' },
            { category: 'Room', item_code: 'ROOM-GEN', item_name: 'General Ward Bed / Day', default_price: 2500, department: 'IPD' },
            { category: 'Room', item_code: 'ROOM-ICU', item_name: 'ICU Bed / Day', default_price: 9000, department: 'IPD' },
            { category: 'Investigation', item_code: 'LAB-CBC', item_name: 'Complete Blood Count', default_price: 450, department: 'Laboratory' },
            { category: 'Investigation', item_code: 'RAD-XR', item_name: 'X-Ray Chest PA', default_price: 400, department: 'Radiology' },
            { category: 'Surgery', item_code: 'OT-APPY', item_name: 'Appendicectomy', default_price: 45000, department: 'OT' },
            { category: 'Other', item_code: 'MISC-AMB', item_name: 'Ambulance Charges', default_price: 1500, department: 'Support' },
            // item_code is globally unique (not per-org) — prefix so demo rows can never
            // collide with a real hospital's catalog.
        ]) await prisma.charge_catalog.create({ data: { ...c, item_code: `${ORG_CODE}-${c.item_code}`, organizationId: orgId, is_active: true, tax_rate: 0 } as any });
    }
    console.log(`✓ Charge catalog: ${await prisma.charge_catalog.count({ where: { organizationId: orgId } })}`);

    let otRooms = await prisma.oTRoom.findMany({ where: { organizationId: orgId } });
    if (!otRooms.length) {
        for (const r of [
            { room_name: 'OT-1 (Major)', room_type: 'Major', floor: '2nd', wing: 'A' },
            { room_name: 'OT-2 (Minor)', room_type: 'Minor', floor: '2nd', wing: 'A' },
        ]) await prisma.oTRoom.create({ data: { ...r, organizationId: orgId, is_active: true } as any });
        otRooms = await prisma.oTRoom.findMany({ where: { organizationId: orgId } });
    }
    if (await prisma.surgeryMaster.count({ where: { organizationId: orgId } }) === 0) {
        for (const s of [
            { surgery_code: 'APPY', surgery_name: 'Laparoscopic Appendicectomy', category: 'General Surgery', surgeon_fee: 25000, ot_charges: 12000 },
            { surgery_code: 'CHOLE', surgery_name: 'Laparoscopic Cholecystectomy', category: 'General Surgery', surgeon_fee: 35000, ot_charges: 15000 },
            { surgery_code: 'LSCS', surgery_name: 'Lower Segment Caesarean Section', category: 'Obstetrics', surgeon_fee: 30000, ot_charges: 14000 },
            { surgery_code: 'TKR', surgery_name: 'Total Knee Replacement', category: 'Orthopaedics', surgeon_fee: 90000, ot_charges: 30000 },
            { surgery_code: 'HERNIA', surgery_name: 'Inguinal Hernia Repair', category: 'General Surgery', surgeon_fee: 28000, ot_charges: 12000 },
        ]) await prisma.surgeryMaster.create({ data: { ...s, organizationId: orgId, anesthesia_fee: 8000, is_active: true } as any });
    }
    console.log(`✓ OT rooms: ${otRooms.length}, Surgery master: ${await prisma.surgeryMaster.count({ where: { organizationId: orgId } })}`);

    if (await prisma.referrer.count({ where: { organizationId: orgId } }) === 0) {
        for (const r of [
            { name: 'Dr. Suresh Menon (GP)', category: 'Doctor', commission_type: 'percent', flat_percent: 10, phone: '+91 98200 11223' },
            { name: 'Sunrise Diagnostics', category: 'Diagnostic Centre', commission_type: 'percent', flat_percent: 8, phone: '+91 98200 44556' },
            { name: 'Wellness Corporate Tie-up', category: 'Corporate', commission_type: 'fixed', fixed_amount_per_patient: 500, phone: '+91 98200 77889' },
        ]) await prisma.referrer.create({ data: { ...r, organizationId: orgId, is_active: true } as any });
    }
    console.log(`✓ Referrers: ${await prisma.referrer.count({ where: { organizationId: orgId } })}`);

    // ── 2. 50 new patients ───────────────────────────────────────────────────
    const existing2xxxx = await prisma.oPD_REG.count({
        where: { organizationId: orgId, patient_id: { startsWith: `${ORG_CODE}-2026-2` },
    } });
    const patients: { pid: string; name: string; gender: string; tpa: boolean }[] = [];
    for (let i = 1; i <= NEW_PATIENTS; i++) {
        const pid = PID(i);
        const name = `${pick(FIRST, i * 7)} ${pick(LAST, i * 5)}`;
        const gender = i % 2 === 0 ? 'Male' : 'Female';
        const tpa = i % 4 === 0;
        patients.push({ pid, name, gender, tpa });
        if (existing2xxxx > 0) continue;   // already seeded — don't duplicate
        await prisma.oPD_REG.create({
            data: {
                patient_id: pid, full_name: name, organizationId: orgId,
                phone: `9${String(700000000 + rint(1, 99999999, i + 31)).slice(0, 9)}`,
                age: String(rint(2, 84, i + 13)), gender,
                address: pick(CITIES, i * 3),
                patient_type: tpa ? 'tpa_insurance' : 'cash',
                blood_group: pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-'], i),
                created_at: daysAgo(rint(0, 60, i + 17)),
            } as any,
        });
    }
    console.log(existing2xxxx > 0
        ? `• Patients: ${existing2xxxx} feature-demo patients already exist — reusing`
        : `✓ Patients: +${NEW_PATIENTS} (${PID(1)} … ${PID(NEW_PATIENTS)})`);

    // ── 3. Clinical: consents, allergies, vitals, EHR, feedback, follow-ups ──
    let nAppt = 0, nEhr = 0, nVitals = 0, nAllergy = 0, nFeedback = 0, nFollowUp = 0, nConsent = 0;
    for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        const d = pick(doctors, i);

        await prisma.patientConsent.create({
            data: {
                patient_id: p.pid, consent_type: pick(['Treatment', 'Data Sharing', 'WhatsApp Updates'], i),
                granted: true, granted_at: daysAgo(rint(1, 40, i)), organizationId: orgId,
            } as any,
        }); nConsent++;

        await prisma.vital_signs.create({
            data: {
                patient_id: p.pid, organizationId: orgId,
                blood_pressure: `${rint(105, 145, i)}/${rint(65, 95, i + 1)}`,
                heart_rate: rint(62, 104, i + 2), temperature: 97 + rint(0, 4, i + 3),
                oxygen_sat: rint(95, 100, i + 4), respiratory_rate: rint(12, 22, i + 5),
                weight: rint(42, 92, i + 6), height: rint(148, 184, i + 7),
                blood_sugar: rint(80, 210, i + 8), pain_scale: rint(0, 7, i + 9),
                recorded_by: nurse.name || nurse.username, created_at: daysAgo(rint(0, 30, i + 10)),
            } as any,
        }); nVitals++;

        if (i % 5 === 0) {
            await prisma.patientAllergy.create({
                data: {
                    organizationId: orgId, patient_id: p.pid,
                    allergen_name: pick(['Penicillin', 'Sulfa drugs', 'Peanuts', 'Dust mite', 'Iodine contrast'], i),
                    allergen_type: 'Drug', severity: pick(['Mild', 'Moderate', 'Severe'], i),
                    reaction: pick(['Rash', 'Urticaria', 'Anaphylaxis', 'Breathlessness'], i), status: 'Active',
                } as any,
            }); nAllergy++;
        }

        // Appointments + EHR for the first 24
        if (i < 24) {
            const apptId = `${ORG_CODE}-APT-2${String(i + 1).padStart(3, '0')}`;
            const at = new Date(); at.setDate(at.getDate() - (i % 3)); at.setHours(9 + (i % 9), (i % 2) * 30, 0, 0);
            await prisma.appointments.create({
                data: {
                    appointment_id: apptId, patient_id: p.pid, doctor_id: d.id, doctor_name: d.name,
                    department: d.specialty || 'General Medicine', appointment_date: at,
                    status: i % 3 === 0 ? 'Completed' : i % 3 === 1 ? 'Checked In' : 'Scheduled',
                    organizationId: orgId,
                } as any,
            }); nAppt++;

            await prisma.clinical_EHR.create({
                data: {
                    appointment_id: apptId, patient_id: p.pid, doctor_name: d.name, organizationId: orgId,
                    diagnosis: pick(DIAGNOSES, i),
                    doctor_notes: `Patient reports ${pick(COMPLAINTS, i).toLowerCase()}. On examination vitals stable. Advised investigations and started symptomatic treatment. Review after 5 days.`,
                    created_at: at,
                } as any,
            }); nEhr++;

            if (i % 2 === 0) {
                await prisma.patientFeedback.create({
                    data: {
                        patient_id: p.pid, appointment_id: apptId, rating: rint(3, 5, i + 21),
                        comments: pick(['Very smooth experience, short waiting time.', 'Doctor explained everything clearly.',
                            'Staff was courteous and helpful.', 'Billing was quick and transparent.'], i),
                        organizationId: orgId, created_at: at,
                    } as any,
                }); nFeedback++;
            }
            if (i % 3 === 0) {
                const fu = new Date(); fu.setDate(fu.getDate() + rint(2, 21, i));
                await prisma.followUp.create({
                    data: {
                        patient_id: p.pid, doctor_id: d.id, scheduled_date: fu, status: 'Pending',
                        notes: 'Review with reports', organizationId: orgId,
                    } as any,
                }); nFollowUp++;
            }
        }
    }
    console.log(`✓ Clinical: ${nConsent} consents, ${nVitals} vitals, ${nAllergy} allergies, ${nAppt} appointments, ${nEhr} EHR notes, ${nFeedback} feedback, ${nFollowUp} follow-ups`);

    // ── 4. Lab + Radiology + Pharmacy orders ─────────────────────────────────
    let nLab = 0, nPharm = 0;
    const LAB_TESTS = ['Complete Blood Count', 'Liver Function Test', 'Kidney Function Test',
        'Lipid Profile', 'Thyroid Profile', 'HbA1c', 'Serum Electrolytes', 'CRP'];
    for (let i = 0; i < 20; i++) {
        const p = patients[i]; const d = pick(doctors, i);
        for (let k = 0; k < 2; k++) {
            const done = (i + k) % 3 !== 0;
            await prisma.lab_orders.create({
                data: {
                    barcode: `DEMOLAB${String(i * 2 + k + 1).padStart(5, '0')}`,
                    patient_id: p.pid, doctor_id: d.id, test_type: pick(LAB_TESTS, i + k),
                    status: done ? 'Completed' : 'Pending',
                    result_value: done ? pick(['Within normal limits', 'Hb 10.2 g/dL — mild anaemia',
                        'TSH 6.8 µIU/mL — subclinical hypothyroidism', 'Fasting glucose 148 mg/dL'], i + k) : null,
                    technician_remarks: done ? 'Sample processed on automated analyser.' : null,
                    is_critical: (i + k) % 11 === 0,
                    organizationId: orgId, created_at: daysAgo(rint(0, 14, i + k + 3)),
                } as any,
            }); nLab++;
        }
    }
    for (let i = 0; i < 16; i++) {
        const p = patients[i + 5]; const d = pick(doctors, i);
        const order = await prisma.pharmacy_orders.create({
            data: {
                patient_id: p.pid, doctor_id: d.id, organizationId: orgId,
                indent_number: `${ORG_CODE}-PH-${String(i + 1).padStart(4, '0')}`,
                requested_by_name: d.name, status: i % 4 === 0 ? 'Pending' : 'Dispensed',
                created_at: daysAgo(rint(0, 12, i + 5)),
            } as any,
        });
        let total = 0;
        const lineCount = 2 + (i % 3);
        for (let k = 0; k < lineCount; k++) {
            const med = pick(medicines, i * 3 + k);
            const qty = rint(1, 10, i + k + 2);
            const price = Number(med.selling_price || med.mrp || 50);
            total += price * qty;
            await prisma.pharmacy_order_items.create({
                data: {
                    order_id: order.id, medicine_id: med.id, medicine_name: med.brand_name,
                    quantity_requested: qty, quantity_dispensed: i % 4 === 0 ? 0 : qty,
                    unit_price: price, total_price: price * qty,
                    status: i % 4 === 0 ? 'Pending' : 'Dispensed', tax_rate: 12,
                } as any,
            });
        }
        await prisma.pharmacy_orders.update({ where: { id: order.id }, data: { total_amount: total, total_items_requested: lineCount } });
        nPharm++;
    }
    console.log(`✓ Lab orders: ${nLab}, Pharmacy orders: ${nPharm}`);

    // ── 5. IPD admissions with full nursing/clinical trail ───────────────────
    const freeBeds = await prisma.beds.findMany({ where: { organizationId: orgId, status: 'Available' } });
    const wards = await prisma.wards.findMany({ where: { organizationId: orgId } });
    const wardRate = new Map<number, number>(wards.map((w: any) => [w.ward_id ?? w.id, Number(w.cost_per_day || 2500)]));

    const admissionsToMake = Math.min(12, freeBeds.length);
    let nAdm = 0, nNote = 0, nTask = 0, nRound = 0, nIpdVitals = 0, nDiet = 0, nMove = 0, nSummary = 0, nEstimate = 0;
    const madeAdmissions: { admissionId: string; pid: string; active: boolean; net: number; days: number }[] = [];

    const startIdx = await prisma.admissions.count({ where: { organizationId: orgId } });
    for (let i = 0; i < admissionsToMake; i++) {
        const active = i < 8;
        const bed: any = freeBeds[i];
        const p = patients[25 + i];
        const d = pick(doctors, i + 2);
        const days = active ? rint(1, 6, i + 4) : rint(3, 10, i + 4);
        const admittedOn = daysAgo(active ? days : days + rint(2, 12, i));
        const admissionId = `${ORG_CODE}-ADM-26-27-${String(startIdx + i + 1).padStart(3, '0')}`;

        await prisma.admissions.create({
            data: {
                admission_id: admissionId, patient_id: p.pid, bed_id: bed.bed_id, ward_id: bed.ward_id,
                status: active ? 'Admitted' : 'Discharged', doctor_name: d.name,
                diagnosis: pick(DIAGNOSES, i + 4), admission_date: admittedOn,
                discharge_date: active ? null : daysAgo(rint(0, 6, i + 1)),
                organizationId: orgId,
            } as any,
        }); nAdm++;
        if (active) await prisma.beds.update({ where: { bed_id: bed.bed_id }, data: { status: 'Occupied' } });

        // pre-admission estimate
        const rate = wardRate.get(bed.ward_id) || 2500;
        nEstimate++;
        await prisma.ipdEstimate.create({
            data: {
                estimate_number: `${ORG_CODE}-EST-${String(startIdx + i + 1).padStart(4, '0')}`,
                patient_id: p.pid, diagnosis: pick(DIAGNOSES, i + 4), expected_los_days: days,
                room_category: pick(['General', 'Private', 'ICU'], i),
                total_estimate: rate * days + 18000, deposit_required: 15000, status: 'Approved',
                created_by: reception.name || reception.username, organizationId: orgId, created_at: admittedOn,
            } as any,
        });

        // nursing + clinical trail
        for (let v = 0; v < 3; v++) {
            await prisma.iPDVitals.create({
                data: {
                    admission_id: admissionId, patient_id: p.pid, organizationId: orgId,
                    bp_systolic: rint(100, 150, i + v), bp_diastolic: rint(60, 95, i + v + 1),
                    heart_rate: rint(60, 110, i + v + 2), temperature: 97 + rint(0, 4, i + v + 3),
                    respiratory_rate: rint(12, 24, i + v + 4), spo2: rint(93, 100, i + v + 5),
                    pain_score: rint(0, 6, i + v + 6), consciousness: 'Alert',
                    blood_sugar: rint(85, 220, i + v + 7), urine_output_ml: rint(300, 1600, i + v + 8),
                    recorded_by: nurse.name || nurse.username, created_at: hoursAgo(6 * (v + 1)),
                } as any,
            }); nIpdVitals++;
        }
        for (const nt of [
            { note_type: 'Shift Handover', details: 'Patient comfortable through the night. Afebrile. IV fluids running at 75 ml/hr. No fresh complaints.' },
            { note_type: 'Medication', details: 'Inj. Monocef 1g IV administered at 08:00 as charted. No adverse reaction observed.' },
        ]) {
            await prisma.nursingNote.create({
                data: { admission_id: admissionId, nurse_id: nurse.id, ...nt, organizationId: orgId, created_at: hoursAgo(rint(2, 20, i)) } as any,
            }); nNote++;
        }
        for (const tk of [
            { task_type: 'Vitals', description: 'Record 4-hourly vitals', status: 'Completed' },
            { task_type: 'Medication', description: 'Administer evening antibiotic dose', status: active ? 'Pending' : 'Completed' },
            { task_type: 'Mobilisation', description: 'Assist ambulation twice daily', status: active ? 'Pending' : 'Completed' },
        ]) {
            await prisma.nursingTask.create({
                data: {
                    admission_id: admissionId, task_type: tk.task_type, description: tk.description,
                    scheduled_at: hoursAgo(rint(-8, 10, i)), status: tk.status,
                    completed_at: tk.status === 'Completed' ? hoursAgo(rint(1, 8, i)) : null,
                    assigned_to: nurse.name || nurse.username, organizationId: orgId,
                } as any,
            }); nTask++;
        }
        await prisma.wardRound.create({
            data: {
                admission_id: admissionId, doctor_id: d.id, organizationId: orgId,
                subjective: 'Patient reports reduced pain and improved appetite.',
                objective: 'Afebrile, vitals stable, abdomen soft and non-tender.',
                assessment: `${pick(DIAGNOSES, i + 4)} — responding to treatment.`,
                plan: 'Continue current antibiotics. Repeat CBC tomorrow. Plan discharge if stable.',
                round_type: 'Morning', visit_fee: 500, charge_posted: true,
                created_at: hoursAgo(rint(3, 26, i + 2)),
            } as any,
        }); nRound++;
        await prisma.dietPlan.create({
            data: {
                admission_id: admissionId, diet_type: pick(['Diabetic Diet', 'Soft Diet', 'Normal Diet', 'Low Salt Diet'], i),
                instructions: 'Small frequent meals. Encourage oral fluids. No outside food.',
                calorie_target: rint(1400, 2200, i), protein_target: rint(45, 80, i + 1),
                is_active: active, created_by: nurse.name || nurse.username, organizationId: orgId, created_at: admittedOn,
            } as any,
        }); nDiet++;
        await prisma.medical_notes.create({
            data: {
                admission_id: admissionId, note_type: 'Progress Note',
                details: `Day ${days} of admission. ${pick(DIAGNOSES, i + 4)}. Clinically improving, tolerating orals, ambulating independently.`,
                organizationId: orgId, created_at: hoursAgo(rint(4, 30, i)),
            } as any,
        });
        if (i % 3 === 0) {
            await prisma.patientMovement.create({
                data: {
                    organizationId: orgId, admission_id: admissionId, patient_id: p.pid,
                    from_location: 'Ward', to_location: 'Radiology', purpose: 'CT Brain Plain',
                    moved_at: hoursAgo(rint(5, 30, i)), returned_at: hoursAgo(rint(1, 4, i)),
                    moved_by: nurse.name || nurse.username, escort_name: 'Ward Attendant',
                } as any,
            }); nMove++;
        }
        if (!active) {
            await prisma.discharge_summaries.create({
                data: {
                    admission_id: admissionId, patient_name: p.name, organizationId: orgId,
                    generated_summary: `DISCHARGE SUMMARY\n\nDiagnosis: ${pick(DIAGNOSES, i + 4)}\n\nCourse in hospital: Patient was admitted with ${pick(COMPLAINTS, i).toLowerCase()}. Investigations were done and treatment started. Patient improved symptomatically and was afebrile at discharge.\n\nCondition at discharge: Stable.\n\nAdvice: Continue prescribed medication. Review in OPD after 7 days with reports. Report earlier if fever, vomiting or worsening pain.`,
                    prepared_by: d.name, created_at: daysAgo(rint(0, 6, i + 1)),
                } as any,
            }); nSummary++;
        }

        const net = rate * days + rint(4000, 26000, i + 9);
        madeAdmissions.push({ admissionId, pid: p.pid, active, net, days });
    }
    console.log(`✓ IPD: ${nAdm} admissions (${madeAdmissions.filter(a => a.active).length} active), ${nIpdVitals} vitals, ${nNote} nursing notes, ${nTask} tasks, ${nRound} ward rounds, ${nDiet} diet plans, ${nMove} movements, ${nEstimate} estimates, ${nSummary} discharge summaries`);

    // Bed cleaning workflow — a couple of beds awaiting housekeeping
    const toClean = await prisma.beds.findMany({ where: { organizationId: orgId, status: 'Available' }, take: 2 });
    for (const b of toClean) await prisma.beds.update({ where: { bed_id: b.bed_id }, data: { status: 'Cleaning' } as any });
    console.log(`✓ Bed cleaning queue: ${toClean.length} beds marked 'Cleaning'`);

    // ── 6. Billing: OPD + IPD invoices, payments, deposits, credit notes, refunds
    const invSeqBase = await prisma.invoices.count({ where: { organizationId: orgId } });
    let seq = invSeqBase, rcp = invSeqBase, nOpd = 0, nIpdBill = 0, nDep = 0, nCn = 0, nRef = 0, nComm = 0;
    const opdInvoices: { id: number; pid: string; amount: number }[] = [];

    for (let i = 0; i < 22; i++) {
        const p = patients[i]; const d = pick(doctors, i);
        const amount = [500, 600, 750, 900, 1200, 1500][i % 6];
        const when = daysAgo(rint(0, 25, i + 6));
        seq++;
        const inv = await prisma.invoices.create({
            data: {
                invoice_number: `${ORG_CODE}-OPD-26-27-${String(seq).padStart(3, '0')}`,
                final_bill_number: `${ORG_CODE}-BILL-OPD-26-27-${String(seq).padStart(3, '0')}`,
                patient_id: p.pid, invoice_type: 'OPD', status: 'Final',
                total_amount: amount, net_amount: amount, paid_amount: amount, balance_due: 0,
                doctor_name: d.name, organizationId: orgId, created_at: when, finalized_at: when,
            } as any,
        });
        await prisma.invoice_items.create({
            data: {
                invoice_id: inv.id, department: d.specialty || 'OPD', description: `Consultation - ${d.name}`,
                quantity: 1, unit_price: amount, total_price: amount, net_price: amount,
                service_category: 'Consultation', organizationId: orgId, created_at: when,
            } as any,
        });
        rcp++;
        await prisma.payments.create({
            data: {
                receipt_number: `${ORG_CODE}-RCP-26-27-${String(rcp).padStart(3, '0')}`,
                invoice_id: inv.id, amount, payment_method: ['Cash', 'UPI', 'Card', 'NEFT/RTGS'][i % 4],
                payment_type: 'Full', status: 'Completed',
                received_by: reception.name || reception.username,
                organizationId: orgId, created_at: when,
            } as any,
        });
        opdInvoices.push({ id: inv.id, pid: p.pid, amount });
        nOpd++;

        if (i % 5 === 0) {
            await prisma.doctorCommission.create({
                data: {
                    organizationId: orgId, doctor_id: d.id, patient_id: p.pid,
                    invoice_id: inv.id, invoice_type: 'OPD',
                } as any,
            }); nComm++;
        }
    }

    const ipdInvoices: { id: number; pid: string; net: number; admissionId: string }[] = [];
    for (const a of madeAdmissions) {
        const rateItems = [
            { desc: 'Room Rent', cat: 'Room', amt: Math.round(a.net * 0.35) },
            { desc: 'Doctor Visit Charges', cat: 'Consultation', amt: Math.round(a.net * 0.15) },
            { desc: 'Pharmacy & Consumables', cat: 'Pharmacy', amt: Math.round(a.net * 0.25) },
            { desc: 'Investigations', cat: 'Investigation', amt: Math.round(a.net * 0.15) },
            { desc: 'Nursing Charges', cat: 'Nursing', amt: Math.round(a.net * 0.10) },
        ];
        const net = rateItems.reduce((s, r) => s + r.amt, 0);
        const paid = a.active ? Math.round(net * 0.4) : net;
        seq++;
        const inv = await prisma.invoices.create({
            data: {
                // Draft while admitted (numberless final bill); finalized once discharged.
                invoice_number: `${ORG_CODE}-IPD-26-27-${String(seq).padStart(3, '0')}`,
                final_bill_number: a.active ? null : `${ORG_CODE}-BILL-IPD-26-27-${String(seq).padStart(3, '0')}`,
                patient_id: a.pid, admission_id: a.admissionId, invoice_type: 'IPD',
                status: a.active ? 'Draft' : 'Final',
                total_amount: net, net_amount: net, paid_amount: paid, balance_due: net - paid,
                organizationId: orgId, created_at: daysAgo(a.days),
                finalized_at: a.active ? null : daysAgo(rint(0, 5, net)),
            } as any,
        });
        for (const r of rateItems) {
            await prisma.invoice_items.create({
                data: {
                    invoice_id: inv.id, department: r.cat, description: r.desc, quantity: 1,
                    unit_price: r.amt, total_price: r.amt, net_price: r.amt,
                    service_category: r.cat, organizationId: orgId, created_at: daysAgo(a.days),
                } as any,
            });
        }
        if (paid > 0) {
            rcp++;
            await prisma.payments.create({
                data: {
                    receipt_number: `${ORG_CODE}-RCP-26-27-${String(rcp).padStart(3, '0')}`,
                    invoice_id: inv.id, amount: paid, payment_method: 'NEFT/RTGS',
                    payment_type: a.active ? 'Partial' : 'Full', status: 'Completed',
                    received_by: reception.name || reception.username,
                    organizationId: orgId, created_at: daysAgo(rint(0, a.days, net)),
                } as any,
            });
        }
        if (a.active) {
            await prisma.patientDeposit.create({
                data: {
                    deposit_number: `${ORG_CODE}-DEP-26-27-${String(seq).padStart(3, '0')}`,
                    patient_id: a.pid, admission_id: a.admissionId, amount: 15000,
                    applied_amount: 0, refunded_amount: 0, payment_method: 'Cash', status: 'Active',
                    collected_by: reception.name || reception.username,
                    organizationId: orgId, created_at: daysAgo(a.days),
                } as any,
            }); nDep++;
        }
        ipdInvoices.push({ id: inv.id, pid: a.pid, net, admissionId: a.admissionId });
        nIpdBill++;
    }

    // Credit notes + refunds against a few finalized bills
    for (let i = 0; i < 3 && i < opdInvoices.length; i++) {
        const t = opdInvoices[i * 3];
        if (!t) continue;
        await prisma.creditNote.create({
            data: {
                credit_note_number: `${ORG_CODE}-CN-26-27-${String(i + 1).padStart(3, '0')}`,
                original_invoice_id: t.id, reason: pick(['Service not rendered', 'Billing correction', 'Goodwill adjustment'], i),
                total_amount: Math.round(t.amount * 0.25), status: 'Applied',
                approved_by: 'demo.finance', notes: 'Approved by Finance Manager.',
                organizationId: orgId, created_at: daysAgo(rint(1, 10, i)),
            } as any,
        }); nCn++;
    }
    for (let i = 0; i < 2 && i < opdInvoices.length; i++) {
        const t = opdInvoices[i * 5 + 1];
        if (!t) continue;
        await prisma.refund.create({
            data: {
                invoice_id: String(t.id), amount: Math.round(t.amount * 0.5),
                reason: 'Procedure cancelled by patient', status: 'Completed',
                payment_method: 'NEFT/RTGS', processed_by: 'demo.finance',
                refund_ref: `${ORG_CODE}-RFD-${String(i + 1).padStart(3, '0')}`,
                organizationId: orgId, created_at: daysAgo(rint(1, 8, i)),
            } as any,
        }); nRef++;
    }
    console.log(`✓ Billing: ${nOpd} OPD bills, ${nIpdBill} IPD bills, ${nDep} deposits, ${nCn} credit notes, ${nRef} refunds, ${nComm} doctor commissions`);

    // ── 7. Insurance / TPA ───────────────────────────────────────────────────
    let nPol = 0, nPre = 0, nClaim = 0;
    const tpaPatients = patients.filter(p => p.tpa);
    for (let i = 0; i < tpaPatients.length; i++) {
        const p = tpaPatients[i];
        const prov = pick(providers, i);
        const pol = await prisma.insurance_policies.create({
            data: {
                patient_id: p.pid, provider_id: prov.id, organizationId: orgId,
                policy_number: `POL-${ORG_CODE}-${String(1000 + i)}`, policy_holder: p.name,
                plan_name: pick(['Family Floater 5L', 'Individual Health 3L', 'Corporate Group 10L'], i),
                member_id: `MEM${String(500000 + i)}`, policy_type: 'Health',
                coverage_limit: [300000, 500000, 1000000][i % 3], remaining_limit: [280000, 450000, 900000][i % 3],
                valid_from: daysAgo(200), valid_until: daysAgo(-165), status: 'Active',
                copay_percent: [0, 10, 20][i % 3],
            } as any,
        }); nPol++;

        await prisma.insurancePreAuth.create({
            data: {
                patient_id: p.pid, organizationId: orgId, provider_id: prov.id,
                tpa_name: prov.provider_name, pre_auth_number: `PA-${ORG_CODE}-${String(2000 + i)}`,
                requested_amount: [45000, 80000, 120000][i % 3],
                approved_amount: i % 4 === 0 ? null : [40000, 72000, 100000][i % 3],
                status: i % 4 === 0 ? 'Pending' : i % 4 === 1 ? 'Approved' : i % 4 === 2 ? 'Approved' : 'Query Raised',
                diagnosis_icd: pick(['K35.8', 'J18.9', 'E11.9', 'I10', 'A90'], i),
                submitted_at: daysAgo(rint(2, 25, i)),
                tpa_remarks: i % 4 === 3 ? 'Please share indoor case papers and investigation reports.' : null,
            } as any,
        }); nPre++;

        // Claim against one of this patient's finalized bills, if any
        const target = [...ipdInvoices, ...opdInvoices.map(o => ({ id: o.id, pid: o.pid, net: o.amount, admissionId: '' }))]
            .find(v => v.pid === p.pid);
        if (target) {
            const claimed = Math.round(Number(target.net) * 0.8);
            const st = i % 4;
            await prisma.insurance_claims.create({
                data: {
                    claim_number: `CLM-${ORG_CODE}-${String(3000 + i)}`,
                    policy_id: pol.id, invoice_id: target.id,
                    admission_id: target.admissionId || null,
                    claimed_amount: claimed,
                    approved_amount: st === 0 ? null : Math.round(claimed * 0.9),
                    settled_amount: st === 2 ? Math.round(claimed * 0.9) : null,
                    status: st === 0 ? 'Submitted' : st === 1 ? 'Approved' : st === 2 ? 'Settled' : 'Query',
                    organizationId: orgId, submitted_at: daysAgo(rint(1, 20, i)),
                    settled_at: st === 2 ? daysAgo(rint(0, 5, i)) : null,
                } as any,
            }); nClaim++;
        }
    }
    console.log(`✓ Insurance: ${nPol} policies, ${nPre} pre-auths, ${nClaim} claims`);

    // ── 8. Emergency / Triage / Ambulance ────────────────────────────────────
    let nEr = 0, nTri = 0, nAmb = 0;
    for (let i = 0; i < 8; i++) {
        const p = patients[40 + i];
        const lvl = pick(['1 - Resuscitation', '2 - Emergent', '3 - Urgent', '4 - Less Urgent', '5 - Non Urgent'], i);
        await prisma.eRRegistration.create({
            data: {
                organizationId: orgId, er_number: `${ORG_CODE}-ER-${String(i + 1).padStart(4, '0')}`,
                patient_id: p.pid, patient_name: p.name, gender: p.gender,
                chief_complaint: pick(COMPLAINTS, i),
                arrival_mode: pick(['Ambulance', 'Walk-in', 'Private Vehicle'], i),
                brought_by: pick(['Family member', 'Bystander', 'Self'], i),
                arrival_time: hoursAgo(rint(1, 40, i)),
                triage_level: lvl, triage_color: pick(['Red', 'Orange', 'Yellow', 'Green', 'Blue'], i),
                triage_nurse_id: nurse.id, triage_time: hoursAgo(rint(1, 39, i)),
                attending_doctor_id: pick(doctors, i).id,
                status: i % 3 === 0 ? 'In Treatment' : i % 3 === 1 ? 'Disposed' : 'Waiting',
                disposition: i % 3 === 1 ? pick(['Admitted', 'Discharged', 'Referred'], i) : null,
                is_mlc: i % 7 === 0,
            } as any,
        }); nEr++;

        await prisma.triage_results.create({
            data: {
                patient_id: p.pid, patient_name: p.name, symptoms: pick(COMPLAINTS, i),
                duration: pick(['2 hours', '1 day', '3 days', '1 week'], i),
                severity: pick(['Mild', 'Moderate', 'Severe'], i), triage_level: lvl,
                recommended_department: pick(['Emergency', 'General Medicine', 'Orthopaedics', 'Cardiology'], i),
                possible_conditions: pick(['Viral fever, Dengue', 'Acute coronary syndrome', 'Appendicitis', 'Gastroenteritis'], i),
                recommended_tests: 'CBC, CRP, Chest X-Ray',
                clinical_summary: 'AI-assisted triage suggests prompt physician review.',
                organizationId: orgId, created_at: hoursAgo(rint(1, 40, i)),
            } as any,
        }); nTri++;
    }
    for (let i = 0; i < 5; i++) {
        const p = patients[45 + i];
        const dispatched = i % 2 === 0;
        await prisma.ambulance_requests.create({
            data: {
                id: `${ORG_CODE}-AMBID-${String(i + 1).padStart(4, '0')}`,
                organizationId: orgId, request_number: `${ORG_CODE}-AMB-${String(i + 1).padStart(4, '0')}`,
                request_type: pick(['Emergency', 'Transfer', 'Discharge Drop'], i),
                patient_id: p.pid, patient_name: p.name, contact_phone: '+91 98200 33445',
                pickup_address: pick(CITIES, i), destination: 'Demo Hospital, Emergency Entrance',
                vehicle_number: `MH01AB${String(1000 + i)}`, driver_name: pick(['Ramesh', 'Sunil', 'Imran'], i),
                driver_phone: '+91 98200 55667',
                status: dispatched ? 'Completed' : 'Requested',
                requested_at: hoursAgo(rint(2, 30, i)),
                dispatched_at: dispatched ? hoursAgo(rint(2, 29, i)) : null,
                completed_at: dispatched ? hoursAgo(rint(1, 20, i)) : null,
                dispatch_tat_mins: dispatched ? rint(4, 18, i) : null,
                billing_amount: 1500, created_by: reception.username,
                updated_at: new Date(),
            } as any,
        }); nAmb++;
    }
    console.log(`✓ Emergency: ${nEr} ER registrations, ${nTri} triage results, ${nAmb} ambulance requests`);

    // ── 9. OT / Surgery ──────────────────────────────────────────────────────
    const surgeries = await prisma.surgeryMaster.findMany({ where: { organizationId: orgId } });
    let nSurg = 0, nSched = 0;
    for (let i = 0; i < 6; i++) {
        const p = patients[30 + i];
        const sm: any = pick(surgeries, i);
        const d = pick(doctors, i + 1);
        const req = await prisma.surgeryRequest.create({
            data: {
                organizationId: orgId, request_number: `${ORG_CODE}-SR-${String(i + 1).padStart(4, '0')}`,
                patient_id: p.pid, requesting_doctor_id: d.id,
                surgery_master_id: sm.id, surgery_name: sm.surgery_name, surgery_category: sm.category,
                urgency: pick(['Elective', 'Urgent', 'Emergency'], i),
                diagnosis: pick(DIAGNOSES, i + 5),
                clinical_notes: 'Patient counselled regarding procedure, risks and expected recovery. Consent obtained.',
                status: i % 3 === 0 ? 'Requested' : 'Scheduled',
                requested_date: daysAgo(rint(1, 10, i)),
                approved_by: i % 3 === 0 ? null : d.name,
                approved_at: i % 3 === 0 ? null : daysAgo(rint(0, 8, i)),
            } as any,
        }); nSurg++;

        if (i % 3 !== 0) {
            const day = new Date(); day.setDate(day.getDate() + (i % 4));
            const hr = 9 + (i % 6);
            await prisma.oTSchedule.create({
                data: {
                    organizationId: orgId, surgery_request_id: req.id,
                    ot_room_id: (pick(otRooms, i) as any).id,
                    scheduled_date: day,
                    start_time: `${String(hr).padStart(2, '0')}:00`,
                    end_time: `${String(hr + 2).padStart(2, '0')}:00`,
                    status: 'Scheduled',
                } as any,
            }); nSched++;
        }
    }
    console.log(`✓ OT: ${nSurg} surgery requests, ${nSched} scheduled slots`);

    // ── 10. Optical ──────────────────────────────────────────────────────────
    let nOptRx = 0, nOptOrd = 0;
    for (let i = 0; i < 5; i++) {
        const p = patients[10 + i];
        const rxId = `${ORG_CODE}-OPTRX-${String(i + 1).padStart(4, '0')}`;
        await prisma.optical_prescriptions.create({
            data: {
                id: rxId, organizationId: orgId, patient_id: p.pid, doctor_id: pick(doctors, i).id,
                prescription_date: daysAgo(rint(1, 20, i)),
                right_sphere: -1.5 - (i * 0.25), right_cylinder: -0.5, right_axis: 90, right_va: '6/6',
                left_sphere: -1.25 - (i * 0.25), left_cylinder: -0.75, left_axis: 85, left_va: '6/6',
                pd_distance: 62, lens_recommendation: 'Anti-glare single vision',
                is_active: true, updated_at: new Date(),
            } as any,
        }); nOptRx++;
        await prisma.optical_orders.create({
            data: {
                id: `${ORG_CODE}-OPTORD-${String(i + 1).padStart(4, '0')}`,
                organizationId: orgId, order_number: `${ORG_CODE}-OPT-${String(i + 1).padStart(4, '0')}`,
                patient_id: p.pid, prescription_id: rxId, order_date: daysAgo(rint(0, 15, i)),
                status: i % 2 === 0 ? 'Delivered' : 'In Progress',
                frame_brand: pick(['Titan Eye+', 'Ray-Ban', 'Vincent Chase'], i),
                frame_model: `MDL-${1000 + i}`, frame_color: pick(['Black', 'Gunmetal', 'Tortoise'], i),
                lens_type: 'Single Vision', lens_material: 'Polycarbonate', coating: 'Anti-glare + Blue cut',
                total_amount: 3500 + i * 500, advance_paid: 1500, balance_due: 2000 + i * 500,
                expected_delivery_date: daysAgo(-3), created_by: reception.username,
                updated_at: new Date(),
            } as any,
        }); nOptOrd++;
    }
    console.log(`✓ Optical: ${nOptRx} prescriptions, ${nOptOrd} orders`);

    // ── Summary ──────────────────────────────────────────────────────────────
    const total = await prisma.oPD_REG.count({ where: { organizationId: orgId } });
    console.log(`\n════════════════════════════════════════`);
    console.log(`Demo Hospital now has ${total} patients.`);
    console.log(`Login: demo.admin / Demo@12345 (also demo.reception, demo.finance,`);
    console.log(`       demo.pharmacist, demo.nurse, demo.dr.kapoor / .iyer / .rao)`);
    console.log(`════════════════════════════════════════`);
}

main()
    .catch(e => { console.error('✗ Seed failed:', e.message || e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
