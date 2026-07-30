/**
 * seed-dr-ramesh.ts
 *
 * Creates Dr. Ramesh in the Demo Hospital and back-fills a realistic
 * consultation HISTORY: past appointments, EHR/clinical notes, vitals, OPD
 * bills (finalized + paid) and follow-ups — all attributed to him — so his
 * "history" view is full for the demo.
 *
 * SAFETY: INSERT-only, scoped strictly to the DEMO org. Idempotent (re-runs
 * skip his history if it already exists).
 *
 * Run (local):  npx ts-node -O '{"module":"commonjs"}' scripts/seed-dr-ramesh.ts
 * Run (hosted): export DATABASE_URL/DIRECT_URL first, then the same command.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_CODE = 'DEMO';
const DR_USER = 'demo.dr.ramesh';
const DR_NAME = 'Dr. Ramesh Krishnan';
const DR_SPECIALTY = 'Cardiology';
const HISTORY_COUNT = 26;

const rint = (min: number, max: number, seed: number) =>
    min + Math.floor((Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1) * (max - min + 1));
const pick = <T>(a: T[], s: number): T => a[Math.abs(s) % a.length];
const daysAgo = (d: number) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(9 + (d % 8), (d % 2) * 30, 0, 0); return x; };

const CARDIO_DX = ['Essential Hypertension', 'Stable Angina', 'Type 2 Diabetes with HTN',
    'Palpitations - under evaluation', 'Dyslipidaemia', 'Post-MI follow-up',
    'Atrial Fibrillation', 'Heart Failure (NYHA II)', 'Chest pain - non-cardiac'];
const CARDIO_NOTES = [
    'BP 148/92. Advised salt restriction and started Telmisartan 40mg OD. Review in 2 weeks with home BP diary.',
    'Exertional chest discomfort. ECG unremarkable. Advised TMT and lipid profile. Started Ecosprin + statin.',
    'Diabetic hypertensive. HbA1c 7.8. Optimised metformin, added Telma. Counselled on diet and walking.',
    'Palpitations episodic. Holter advised. Reassured, no red-flag features today.',
    'Lipids deranged. Started Atorvastatin 20mg HS. Repeat lipids after 6 weeks.',
    'Stable post-MI at 6 months. Continue dual antiplatelet + statin. Echo shows EF 50%.',
];

async function main() {
    const org = await prisma.organization.findFirst({ where: { code: ORG_CODE } });
    if (!org) throw new Error(`No org with code ${ORG_CODE}`);
    if (org.code !== ORG_CODE) throw new Error('Refusing: resolved org is not the demo org.');
    const orgId = org.id;
    console.log(`✓ Demo org: ${org.name} (${orgId})`);

    // 1. Doctor
    let doc = await prisma.user.findFirst({ where: { organizationId: orgId, username: DR_USER } });
    if (!doc) {
        const bcrypt = require('bcryptjs');
        doc = await prisma.user.create({
            data: {
                username: DR_USER, password: bcrypt.hashSync('Demo@12345', 10),
                role: 'doctor', name: DR_NAME, specialty: DR_SPECIALTY,
                email: `${DR_USER}@demohospital.in`, phone: '+91 98110 22334',
                consultation_fee: 700, follow_up_fee: 350,
                organizationId: orgId, is_active: true,
            } as any,
        });
        console.log(`✓ Created doctor: ${DR_NAME} (${DR_USER} / Demo@12345)`);
    } else {
        console.log(`• Doctor ${DR_USER} already exists — reusing`);
    }

    // Idempotency: if he already has appointments, don't duplicate the history.
    const already = await prisma.appointments.count({ where: { organizationId: orgId, doctor_id: doc.id } });
    if (already > 0) {
        console.log(`• Dr. Ramesh already has ${already} appointments — history exists. Nothing to add.`);
        return;
    }

    // Patients to attribute history to — reuse the existing demo roster.
    const roster = await prisma.oPD_REG.findMany({
        where: { organizationId: orgId }, select: { patient_id: true, full_name: true }, take: 60,
    });
    if (roster.length < 5) throw new Error('Demo org has too few patients — run the patient seeders first.');

    let nAppt = 0, nEhr = 0, nVit = 0, nBill = 0, nFu = 0;
    let billSeq = 0;
    for (let i = 0; i < HISTORY_COUNT; i++) {
        const pat = roster[i % roster.length];
        const when = daysAgo(rint(1, 120, i + 3));         // spread across ~4 months of history
        const apptId = `${ORG_CODE}-APT-RAM-${String(i + 1).padStart(3, '0')}`;

        await prisma.appointments.create({
            data: {
                appointment_id: apptId, patient_id: pat.patient_id,
                doctor_id: doc.id, doctor_name: DR_NAME, department: DR_SPECIALTY,
                appointment_date: when, status: 'Completed', organizationId: orgId,
            } as any,
        }); nAppt++;

        await prisma.clinical_EHR.create({
            data: {
                appointment_id: apptId, patient_id: pat.patient_id, doctor_name: DR_NAME,
                organizationId: orgId, diagnosis: pick(CARDIO_DX, i),
                doctor_notes: pick(CARDIO_NOTES, i), created_at: when,
            } as any,
        }); nEhr++;

        await prisma.vital_signs.create({
            data: {
                patient_id: pat.patient_id, appointment_id: apptId, organizationId: orgId,
                blood_pressure: `${rint(120, 165, i)}/${rint(75, 100, i + 1)}`,
                heart_rate: rint(66, 108, i + 2), temperature: 98 + (i % 2),
                oxygen_sat: rint(95, 100, i + 3), weight: rint(55, 95, i + 4),
                blood_sugar: rint(90, 220, i + 5), recorded_by: DR_NAME, created_at: when,
            } as any,
        }); nVit++;

        // ~60% of consults produced a paid OPD bill
        if (i % 5 !== 0) {
            billSeq++;
            const amount = [700, 850, 1000, 1200][i % 4];
            const inv = await prisma.invoices.create({
                data: {
                    invoice_number: `${ORG_CODE}-OPD-RAM-${String(billSeq).padStart(3, '0')}`,
                    final_bill_number: `${ORG_CODE}-BILL-OPD-RAM-${String(billSeq).padStart(3, '0')}`,
                    patient_id: pat.patient_id, invoice_type: 'OPD', status: 'Final',
                    total_amount: amount, net_amount: amount, paid_amount: amount, balance_due: 0,
                    doctor_name: DR_NAME, organizationId: orgId, created_at: when, finalized_at: when,
                } as any,
            });
            await prisma.invoice_items.create({
                data: {
                    invoice_id: inv.id, department: DR_SPECIALTY, description: `Cardiology Consultation - ${DR_NAME}`,
                    quantity: 1, unit_price: amount, total_price: amount, net_price: amount,
                    service_category: 'Consultation', organizationId: orgId, created_at: when,
                } as any,
            });
            await prisma.payments.create({
                data: {
                    receipt_number: `${ORG_CODE}-RCP-RAM-${String(billSeq).padStart(3, '0')}`,
                    invoice_id: inv.id, amount, payment_method: ['Cash', 'UPI', 'Card'][i % 3],
                    payment_type: 'Full', status: 'Completed', received_by: 'demo.reception',
                    organizationId: orgId, created_at: when,
                } as any,
            });
            nBill++;
        }

        // a handful of pending follow-ups so his upcoming list isn't empty
        if (i % 6 === 0) {
            const fu = new Date(); fu.setDate(fu.getDate() + rint(3, 21, i));
            await prisma.followUp.create({
                data: {
                    patient_id: pat.patient_id, doctor_id: doc.id, scheduled_date: fu,
                    status: 'Pending', notes: 'Cardiac review with reports', organizationId: orgId,
                } as any,
            }); nFu++;
        }
    }

    console.log(`✓ History for ${DR_NAME}:`);
    console.log(`   ${nAppt} past appointments · ${nEhr} EHR notes · ${nVit} vitals · ${nBill} paid OPD bills · ${nFu} follow-ups`);
    console.log(`\nLogin: ${DR_USER} / Demo@12345`);
}

main()
    .catch(e => { console.error('✗ Failed:', e.message || e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
