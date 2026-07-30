/**
 * Seed an ISOLATED "Demo Hospital" organization for advertisement screenshots.
 *
 * SAFETY GUARANTEES:
 *  - Performs INSERTs only. No deletes, no updates to any existing row.
 *  - Every row is written with the NEW demo organizationId. Real hospital data
 *    (other organizations) is never read, modified, or exposed.
 *  - Idempotent: re-running reuses the existing demo org and skips seeding.
 *
 * Run:  npx ts-node scripts/seed-demo-org.ts
 * Wipe: npx ts-node scripts/seed-demo-org.ts --reset   (deletes ONLY the demo org's data)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ORG = { name: 'Demo Hospital', slug: 'demo-hospital', code: 'DEMO' };
const PASSWORD = 'Demo@12345';

const FIRST = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Reyansh','Krishna','Ishaan','Rohan','Kabir','Ananya','Diya','Aadhya','Saanvi','Riya','Ishita','Meera','Kavya','Neha','Pooja','Rajesh','Suresh','Amit','Vikram','Sanjay','Deepak','Manoj','Anil','Sunita','Rekha','Kavita','Priya','Anjali','Shalini','Nisha','Ritu','Geeta','Seema','Farhan','Imran','Zoya','Ayesha','Rahul','Karan','Nikhil','Varun','Tanvi','Sneha','Divya','Harsh'];
const LAST = ['Sharma','Verma','Gupta','Singh','Kumar','Patel','Reddy','Nair','Iyer','Joshi','Mehta','Chauhan','Yadav','Mishra','Pandey','Agarwal','Bansal','Malhotra','Kapoor','Rao'];
const CITIES = ['Sector 14, Gurugram','Rohini, Delhi','Andheri, Mumbai','Koramangala, Bengaluru','Salt Lake, Kolkata','Banjara Hills, Hyderabad'];
const DIAGNOSES = ['Acute Gastroenteritis','Dengue Fever','Lower Respiratory Tract Infection','Type 2 Diabetes — uncontrolled','Hypertension review','Appendicitis','Anaemia','Urinary Tract Infection'];

const pick = <T,>(a: T[], i: number) => a[i % a.length];
const rint = (min: number, max: number, seed: number) => min + ((seed * 9301 + 49297) % 233280) % (max - min + 1);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
    const reset = process.argv.includes('--reset');

    // Reuse an existing demo org (matched by code) so we never create a duplicate
    // and never touch a real hospital's org.
    let org = await prisma.organization.findFirst({ where: { code: ORG.code } });

    if (reset) {
        if (!org) { console.log('No demo org to reset.'); return; }
        console.log(`Resetting demo org data (org ${org.id}) — real orgs untouched…`);
        const o = { organizationId: org.id };
        await prisma.payments.deleteMany({ where: o });
        await prisma.invoice_items.deleteMany({ where: o });
        await prisma.patientDeposit.deleteMany({ where: o });
        await prisma.invoices.deleteMany({ where: o });
        await prisma.admissions.deleteMany({ where: o });
        await prisma.appointments.deleteMany({ where: o });
        await prisma.beds.deleteMany({ where: o });
        await prisma.wards.deleteMany({ where: o });
        await prisma.oPD_REG.deleteMany({ where: o });
        console.log('Demo data cleared. Re-run without --reset to reseed.');
        return;
    }

    // ── 1. Organization (+ config + branding) ────────────────────────────────
    if (!org) {
        org = await prisma.organization.create({
            data: {
                name: ORG.name, slug: ORG.slug, code: ORG.code,
                address: 'Plot 42, Medical Campus, Gurugram, Haryana - 122001',
                phone: '+91 98110 00000', email: 'contact@demohospital.in',
                plan: 'enterprise', is_active: true,
            },
        });
        await prisma.organizationConfig.create({
            data: { organizationId: org.id, uhid_prefix: ORG.code, enable_ai_triage: true },
        });
        await prisma.organizationBranding.create({
            data: { organizationId: org.id, portal_title: ORG.name, portal_subtitle: 'Management System' },
        });
        console.log(`✓ Created organization: ${ORG.name} (${org.id})`);
    } else {
        console.log(`• Demo org already exists (${org.id}) — reusing.`);
    }
    const orgId = org.id;

    // Hard guard: never run against anything that isn't the demo org.
    if (org.code !== ORG.code) throw new Error(`Refusing to seed: resolved org ${org.code} is not ${ORG.code}`);
    const existingPatients = await prisma.oPD_REG.count({ where: { organizationId: orgId } });
    const existingInvoices = await prisma.invoices.count({ where: { organizationId: orgId } });
    const existingWards = await prisma.wards.count({ where: { organizationId: orgId } });
    const existingAppts = await prisma.appointments.count({ where: { organizationId: orgId } });
    console.log(`• Demo org currently: ${existingPatients} patients, ${existingInvoices} invoices, ${existingWards} wards`);

    // ── 2. Staff accounts ────────────────────────────────────────────────────
    const hash = await bcrypt.hash(PASSWORD, 10);
    const staff = [
        { username: 'demo.admin', role: 'admin', name: 'Dr. Ramesh Malhotra', specialty: null },
        { username: 'demo.reception', role: 'receptionist', name: 'Pooja Sharma', specialty: null },
        { username: 'demo.finance', role: 'finance', name: 'Anil Bansal', specialty: null },
        { username: 'demo.pharmacist', role: 'pharmacist', name: 'Vikas Gupta', specialty: null },
        { username: 'demo.nurse', role: 'nurse', name: 'Sister Mary John', specialty: null },
        { username: 'demo.dr.kapoor', role: 'doctor', name: 'Dr. Sanjay Kapoor', specialty: 'General Medicine' },
        { username: 'demo.dr.iyer', role: 'doctor', name: 'Dr. Latha Iyer', specialty: 'Obstetrics & Gynaecology' },
        { username: 'demo.dr.rao', role: 'doctor', name: 'Dr. Vikram Rao', specialty: 'Orthopaedics' },
    ];
    const users: Record<string, string> = {};
    for (const s of staff) {
        const existing = await prisma.user.findUnique({ where: { username: s.username } });
        const u = existing ?? await prisma.user.create({
            data: {
                username: s.username, password: hash, role: s.role, name: s.name,
                specialty: s.specialty, organizationId: orgId, is_active: true,
                email: `${s.username}@demohospital.in`, phone: '+91 98110 00001',
                consultation_fee: s.role === 'doctor' ? 600 : 500, follow_up_fee: 300,
            },
        });
        users[s.username] = u.id;
    }
    const doctors = staff.filter(s => s.role === 'doctor');
    console.log(`✓ Staff accounts: ${staff.length}`);

    // ── 3. Wards + beds ──────────────────────────────────────────────────────
    const wardSpec = [
        { ward_name: 'General Ward', ward_type: 'General', cost_per_day: 2500, nursing_charge: 500, beds: 10 },
        { ward_name: 'Private Room', ward_type: 'Private', cost_per_day: 5000, nursing_charge: 800, beds: 6 },
        { ward_name: 'ICU', ward_type: 'ICU', cost_per_day: 9000, nursing_charge: 1500, beds: 4 },
    ];
    const bedsByWard: { bedId: string; wardId: number; ward: string; rate: number }[] = [];
    if (existingWards > 0) {
        // Reuse the wards/beds already present in the demo org.
        const wards = await prisma.wards.findMany({ where: { organizationId: orgId } });
        for (const w of wards as any[]) {
            const wid = w.ward_id ?? w.id;
            const beds = await prisma.beds.findMany({ where: { organizationId: orgId, ward_id: wid } });
            for (const b of beds as any[]) {
                bedsByWard.push({ bedId: b.bed_id, wardId: wid, ward: w.ward_name, rate: Number(w.cost_per_day || 2500) });
            }
        }
        console.log(`• Reusing existing wards: ${wards.length}, beds: ${bedsByWard.length}`);
    }
    for (const w of existingWards > 0 ? [] : wardSpec) {
        const ward = await prisma.wards.create({
            data: {
                ward_name: w.ward_name, ward_type: w.ward_type, organizationId: orgId,
                cost_per_day: w.cost_per_day, nursing_charge: w.nursing_charge,
            } as any,
        });
        for (let i = 1; i <= w.beds; i++) {
            // bed_id is a GLOBAL primary key — prefix with the org code so a demo bed
            // can never collide with (or overwrite) a real hospital's bed.
            const bedId = `${ORG.code}-${w.ward_type.slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}`;
            await prisma.beds.create({
                data: { bed_id: bedId, ward_id: (ward as any).ward_id ?? (ward as any).id, status: 'Available', organizationId: orgId } as any,
            });
            bedsByWard.push({ bedId, wardId: (ward as any).ward_id ?? (ward as any).id, ward: w.ward_name, rate: w.cost_per_day });
        }
    }
    console.log(`✓ Wards: ${wardSpec.length}, Beds: ${bedsByWard.length}`);

    // ── 4. 50 patients ───────────────────────────────────────────────────────
    // Top up to TARGET_PATIENTS — never delete or rewrite the ones already there.
    const TARGET_PATIENTS = 50;
    const toCreate = Math.max(0, TARGET_PATIENTS - existingPatients);
    const patients: { pid: string; name: string; phone: string }[] = [];
    for (let i = 0; i < toCreate; i++) {
        const name = `${pick(FIRST, i)} ${pick(LAST, i * 3)}`;
        // Distinct 1xxxx series so it can't collide with pre-existing demo patient ids.
        const pid = `${ORG.code}-2026-${String(10001 + i)}`;
        const gender = i % 2 === 0 ? 'Male' : 'Female';
        await prisma.oPD_REG.create({
            data: {
                patient_id: pid, full_name: name, organizationId: orgId,
                phone: `9${String(800000000 + rint(1, 99999999, i + 7)).slice(0, 9)}`,
                age: String(rint(3, 78, i + 2)), gender,
                address: pick(CITIES, i), patient_type: i % 9 === 0 ? 'tpa_insurance' : 'cash',
                created_at: daysAgo(rint(0, 45, i + 11)),
            } as any,
        });
        patients.push({ pid, name, phone: '' });
    }
    console.log(`✓ Patients created: ${patients.length} (existing ${existingPatients})`);

    // Downstream sections index into the full demo roster, not just the new rows.
    const allPatients = (await prisma.oPD_REG.findMany({
        where: { organizationId: orgId }, select: { patient_id: true, full_name: true },
    })).map(p => ({ pid: p.patient_id, name: p.full_name || 'Patient', phone: '' }));
    patients.length = 0;
    patients.push(...allPatients);
    console.log(`✓ Demo roster now: ${patients.length} patients`);

    // ── 5. Appointments (today) ──────────────────────────────────────────────
    for (let i = 0; i < (existingAppts > 0 ? 0 : 12); i++) {
        const d = pick(doctors, i);
        const at = new Date(); at.setHours(9 + (i % 8), (i % 2) * 30, 0, 0);
        await prisma.appointments.create({
            data: {
                appointment_id: `${ORG.code}-APT-${String(i + 1).padStart(4, '0')}`,
                patient_id: patients[i].pid, doctor_id: users[d.username], doctor_name: d.name,
                department: d.specialty!, appointment_date: at,
                status: i < 5 ? 'Completed' : i < 8 ? 'Checked In' : 'Scheduled',
                organizationId: orgId,
            } as any,
        });
    }
    console.log(existingAppts > 0 ? `• Appointments: skipped (${existingAppts} already present)` : '✓ Appointments: 12 (today)');

    // ── 6. OPD bills (finalized + paid) ──────────────────────────────────────
    let opdSeq = 0, rcpSeq = 0;
    for (let i = 0; i < (existingInvoices > 0 ? 0 : 18); i++) {
        const d = pick(doctors, i);
        const amount = [500, 600, 750, 900, 1200][i % 5];
        const when = daysAgo(rint(0, 20, i + 3));
        opdSeq++;
        const inv = await prisma.invoices.create({
            data: {
                invoice_number: `${ORG.code}-OPD-26-27-${String(opdSeq).padStart(3, '0')}`,
                patient_id: patients[i].pid, invoice_type: 'OPD', status: 'Final',
                total_amount: amount, net_amount: amount, paid_amount: amount, balance_due: 0,
                doctor_name: d.name, organizationId: orgId, created_at: when, finalized_at: when,
            } as any,
        });
        await prisma.invoice_items.create({
            data: {
                invoice_id: inv.id, department: d.specialty!, description: `Consultation - ${d.name}`,
                quantity: 1, unit_price: amount, total_price: amount, net_price: amount,
                service_category: 'Consultation', organizationId: orgId, created_at: when,
            } as any,
        });
        rcpSeq++;
        await prisma.payments.create({
            data: {
                receipt_number: `${ORG.code}-RCP-26-27-${String(rcpSeq).padStart(3, '0')}`,
                invoice_id: inv.id, amount, payment_method: ['Cash', 'UPI', 'Card'][i % 3],
                payment_type: 'Full', status: 'Completed', received_by: 'demo.reception',
                organizationId: orgId, created_at: when,
            } as any,
        });
    }
    console.log(existingInvoices > 0 ? `• OPD/IPD bills: skipped (${existingInvoices} invoices already present)` : `✓ OPD bills: 18 (finalized + paid)`);

    // ── 7. IPD admissions + bills ────────────────────────────────────────────
    let ipdSeq = 0, admSeq = 0, depSeq = 0;
    for (let i = 0; i < (existingInvoices > 0 ? 0 : 14); i++) {
        const active = i < 8;                     // 8 currently admitted, 6 discharged
        const bed = bedsByWard[i % bedsByWard.length];
        const d = pick(doctors, i + 1);
        const pat = patients[20 + i];
        const admittedOn = daysAgo(active ? rint(1, 6, i + 5) : rint(10, 30, i + 5));
        admSeq++;
        const admissionId = `${ORG.code}-ADM-26-27-${String(admSeq).padStart(3, '0')}`;
        await prisma.admissions.create({
            data: {
                admission_id: admissionId, patient_id: pat.pid, bed_id: bed.bedId, ward_id: bed.wardId,
                status: active ? 'Admitted' : 'Discharged', doctor_name: d.name,
                diagnosis: pick(DIAGNOSES, i), admission_date: admittedOn,
                discharge_date: active ? null : daysAgo(rint(1, 8, i + 2)),
                organizationId: orgId,
            } as any,
        });
        if (active) {
            await prisma.beds.update({ where: { bed_id: bed.bedId }, data: { status: 'Occupied' } });
        }

        const days = active ? rint(1, 5, i + 4) : rint(3, 9, i + 4);
        const room = bed.rate * days;
        const meds = rint(1200, 6000, i + 13);
        const proc = rint(2000, 15000, i + 17);
        const net = room + meds + proc;
        const paid = active ? Math.round(net * 0.4) : net;

        ipdSeq++;
        const inv = await prisma.invoices.create({
            data: {
                // Draft bills are numberless; finalized (discharged) bills carry the number.
                invoice_number: active ? null : `${ORG.code}-IPD-26-27-${String(ipdSeq).padStart(3, '0')}`,
                patient_id: pat.pid, admission_id: admissionId, invoice_type: 'IPD',
                status: active ? 'Draft' : 'Final',
                total_amount: net, net_amount: net, paid_amount: paid, balance_due: net - paid,
                doctor_name: d.name, organizationId: orgId, created_at: admittedOn,
                finalized_at: active ? null : daysAgo(rint(1, 8, i + 2)),
            } as any,
        });
        const items = [
            { department: 'Room', description: `${bed.ward} - Room Charge x${days} day(s)`, cat: 'Room', amt: room },
            { department: 'Pharmacy', description: 'Medicines & Consumables', cat: 'Pharmacy', amt: meds },
            { department: 'Procedure', description: pick(['Minor OT Procedure', 'Physiotherapy', 'Dressing & Injection', 'Nebulisation'], i), cat: 'Procedure', amt: proc },
        ];
        for (const it of items) {
            await prisma.invoice_items.create({
                data: {
                    invoice_id: inv.id, department: it.department, description: it.description,
                    quantity: 1, unit_price: it.amt, total_price: it.amt, net_price: it.amt,
                    service_category: it.cat, organizationId: orgId, created_at: admittedOn,
                } as any,
            });
        }
        if (paid > 0) {
            rcpSeq++;
            await prisma.payments.create({
                data: {
                    receipt_number: `${ORG.code}-RCP-26-27-${String(rcpSeq).padStart(3, '0')}`,
                    invoice_id: inv.id, amount: paid, payment_method: ['Cash', 'UPI', 'Card'][i % 3],
                    payment_type: active ? 'Advance' : 'Full', status: 'Completed',
                    received_by: 'demo.reception', organizationId: orgId, created_at: admittedOn,
                } as any,
            });
        }
        if (active && i % 3 === 0) {
            depSeq++;
            await prisma.patientDeposit.create({
                data: {
                    deposit_number: `${ORG.code}-DEP-26-27-${String(depSeq).padStart(3, '0')}`,
                    patient_id: pat.pid, admission_id: admissionId, amount: 10000,
                    applied_amount: 0, refunded_amount: 0, payment_method: 'Cash',
                    status: 'Active', collected_by: 'demo.reception',
                    organizationId: orgId, created_at: admittedOn,
                } as any,
            });
        }
    }
    console.log(`✓ IPD: ${admSeq} admissions (8 active), bills + payments + deposits`);

    console.log('\n──────────── DEMO LOGIN ────────────');
    console.log(`Organization : ${ORG.name} (code ${ORG.code})`);
    staff.forEach(s => console.log(`  ${s.role.padEnd(12)} ${s.username.padEnd(18)} / ${PASSWORD}`));
    console.log('────────────────────────────────────');
}

main()
    .catch(e => { console.error('✗ Seed failed:', e.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
