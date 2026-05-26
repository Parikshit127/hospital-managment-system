/**
 * Creates a demo patient "Prince" + one OT surgery request + one ER case.
 * Useful for quickly demoing OT and Emergency modules.
 *
 * Usage:  npx tsx scripts/create-prince.ts
 *
 * Idempotent in spirit — re-running creates new ER cases / requests
 * with fresh timestamps. Patient is re-used if a "Prince" already exists.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG = process.env.ORGANIZATION_ID || 'org-avani-default';

async function main() {
    const ts = Date.now();

    // 1. Patient — re-use if "Prince" already exists; else create
    let patient = await prisma.oPD_REG.findFirst({
        where: { full_name: 'Prince', organizationId: ORG },
    });
    if (!patient) {
        const uhid = `UHID-PRINCE-${ts}`;
        patient = await prisma.oPD_REG.create({
            data: {
                patient_id: uhid,
                full_name: 'Prince',
                age: '32',
                gender: 'Male',
                phone: '9123456789',
                address: 'Demo Address for OT/ER',
                blood_group: 'A+',
                registration_consent: true,
                patient_type: 'cash',
                organizationId: ORG,
            },
        });
        console.log(`✓ Patient created: ${patient.patient_id} — ${patient.full_name}`);
    } else {
        console.log(`✓ Patient already exists: ${patient.patient_id} — ${patient.full_name}`);
    }

    // 2. Pick (or create a fallback) doctor to be the requesting_doctor + attending_doctor
    let doctor = await prisma.user.findFirst({
        where: { role: 'doctor', is_active: true, organizationId: ORG },
        select: { id: true, name: true },
    });
    if (!doctor) {
        console.warn('⚠️  No active doctor found in this org — surgery request will use a stub id.');
    }
    const doctorId = doctor?.id ?? 'demo-doctor';
    const doctorName = doctor?.name ?? 'Demo Doctor';
    console.log(`✓ Doctor: ${doctorName} (${doctorId})`);

    // 3. Pick a SurgeryMaster (any active) — falls back to custom name
    const surgeryMaster = await prisma.surgeryMaster.findFirst({
        where: { is_active: true, organizationId: ORG },
        select: { id: true, surgery_name: true, category: true },
    });

    // 4. Create the SurgeryRequest
    const surgeryReq = await prisma.surgeryRequest.create({
        data: {
            request_number: `SR-${ts}`,
            patient_id: patient.patient_id,
            requesting_doctor_id: doctorId,
            surgery_master_id: surgeryMaster?.id || null,
            surgery_name: surgeryMaster?.surgery_name || 'Demo Knee Arthroscopy',
            surgery_category: surgeryMaster?.category || 'Orthopaedics',
            urgency: 'Elective',
            diagnosis: 'Right knee meniscus tear',
            clinical_notes: 'Demo case for OT walkthrough. Patient consented. Pre-op fasting confirmed.',
            status: 'Requested',
            requested_date: new Date(),
            organizationId: ORG,
        },
    });
    console.log(`✓ Surgery request created: ${surgeryReq.request_number} (status=${surgeryReq.status})`);

    // 5. Create an ER registration for Prince
    const erReg = await prisma.eRRegistration.create({
        data: {
            er_number: `ER-${ts}`,
            patient_id: patient.patient_id,
            patient_name: patient.full_name,
            is_unknown: false,
            gender: patient.gender || 'Male',
            arrival_mode: 'Ambulance',
            brought_by: 'Family',
            chief_complaint: 'Sudden onset chest pain, breathlessness',
            triage_level: '2',
            triage_color: 'Orange',
            triage_nurse_id: doctorId,
            triage_time: new Date(),
            attending_doctor_id: doctorId,
            status: 'UnderTreatment',
            organizationId: ORG,
        },
    });
    console.log(`✓ ER registration created: ${erReg.er_number} (triage=${erReg.triage_color})`);

    // 6. Add an ER vitals row to make it visually richer (no organizationId on this model)
    await prisma.eRVitals.create({
        data: {
            er_registration_id: erReg.id,
            bp_systolic: 150,
            bp_diastolic: 95,
            heart_rate: 105,
            spo2: 94,
            respiratory_rate: 22,
            temperature: 37.6,
            gcs_total: 15,
            recorded_by: doctorId,
        },
    });
    console.log(`✓ ER vitals recorded`);

    // ── Summary ──────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('🟢 PRINCE — DEMO PATIENT READY');
    console.log('========================================');
    console.log(`\n📋 Patient:          ${patient.full_name}  (${patient.patient_id})`);
    console.log(`🩺 Surgery Request:  ${surgeryReq.request_number}  →  ${surgeryReq.surgery_name}`);
    console.log(`🚨 ER Case:          ${erReg.er_number}  →  Triage ${erReg.triage_color} · ${erReg.chief_complaint}`);
    console.log('\n🔗 Open these in the browser:');
    console.log(`   /ot/requests                  ← see Prince's surgery request`);
    console.log(`   /er/dashboard                 ← see Prince's ER case`);
    console.log(`   /billing/patient/${patient.patient_id}   ← patient profile`);
}

main()
    .catch((e) => {
        console.error('❌', e.message);
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
