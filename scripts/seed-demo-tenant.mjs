/**
 * Seed a fully-branded, self-contained DEMO tenant for sales pitches.
 *
 *   node --env-file=.env scripts/seed-demo-tenant.mjs \
 *     --name "Apollo Hospital" --code APL \
 *     --primary "#0ea5e9" --logo "https://example.com/apollo.png" \
 *     --password "Demo@123"
 *
 * Creates a brand-new Organization (mirroring superadmin createOrganization) plus
 * branding, staff logins, master data and a believable spread of synthetic
 * activity, so dashboards/MIS/reports show real curves instead of zeros.
 *
 * SAFETY
 *  - Only ever CREATES a new org. Never reads, edits or deletes existing tenants.
 *  - All data is synthetic and generated here — no real patient data is copied.
 *  - Aborts if --code / --slug is already taken.
 *
 * NOTE: this schema has many GLOBALLY-unique columns (patient_id, receipt_number,
 * item_code, provider_name/code, policy_number, claim_number, username), so every
 * value below is namespaced with the org code to keep tenants from colliding.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = undefined) => {
  const i = argv.indexOf(`--${k}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const NAME = arg('name');
const CODE = (arg('code') || '').toUpperCase();
const SLUG = (arg('slug') || CODE).toLowerCase();
const PRIMARY = arg('primary', '#0ea5e9');
const SECONDARY = arg('secondary', '#0f172a');
const ACCENT = arg('accent', PRIMARY);
const LOGO = arg('logo', null);
const TAGLINE = arg('tagline', 'Excellence in Healthcare');
const PASSWORD = arg('password', 'Demo@123');
const CITY = arg('city', 'Gurugram, Haryana');

if (!NAME || !CODE) {
  console.error('Usage: --name "Apollo Hospital" --code APL [--slug apollo] [--primary #0ea5e9]');
  console.error('       [--secondary #0f172a] [--logo URL] [--tagline "..."] [--password Demo@123] [--city "..."]');
  process.exit(1);
}
if (!/^[A-Z]{2,6}$/.test(CODE)) {
  console.error(`--code must be 2-6 letters (got "${CODE}") — it prefixes UHIDs and bill numbers.`);
  process.exit(1);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const pad = (n, w = 3) => String(n).padStart(w, '0');
const money = (n) => Math.round(n * 100) / 100;
const daysAgo = (d, h = 10, m = 0) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t;
};
// Financial year label like the app's sequence-generator ("26-27", April start).
const fyLabel = (date = new Date()) => {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};
const FY = fyLabel();

let rcpSeq = 0;
const nextReceipt = () => `${CODE}-RCP-${FY}-${pad(++rcpSeq)}`;

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Meera', 'Arjun',
  'Sneha', 'Rahul', 'Pooja', 'Karthik', 'Neha', 'Sanjay', 'Priya', 'Amit'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Singh', 'Gupta', 'Joshi', 'Mehta'];
const name = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
const phone = (i) => `9${String(800000000 + i * 137).slice(0, 9)}`;

async function main() {
  // ── guard: never touch an existing tenant ────────────────────────────────
  const clash = await db.organization.findFirst({
    where: { OR: [{ code: CODE }, { slug: SLUG }] },
    select: { name: true, code: true, slug: true },
  });
  if (clash) {
    console.error(`Aborting — an organization already uses code "${clash.code}" / slug "${clash.slug}" (${clash.name}).`);
    console.error('Pick a different --code/--slug. This script never overwrites an existing tenant.');
    process.exit(1);
  }

  console.log(`Seeding demo tenant "${NAME}" (${CODE})…`);

  // ── 1. org + config + branding (mirrors superadmin createOrganization) ────
  const org = await db.organization.create({
    data: {
      name: NAME,
      slug: SLUG,
      code: CODE,
      address: CITY,
      phone: '+91 80000 00000',
      email: `contact@${SLUG}.demo`,
      plan: 'enterprise',
      is_active: true,
      logo_url: LOGO,
    },
  });
  const orgId = org.id;

  await db.organizationConfig.create({
    data: { organizationId: orgId, uhid_prefix: CODE, enable_ai_triage: true },
  });

  await db.organizationBranding.create({
    data: {
      organizationId: orgId,
      portal_title: NAME,
      portal_subtitle: 'Management System',
      primary_color: PRIMARY,
      secondary_color: SECONDARY,
      accent_color: ACCENT,
      logo_url: LOGO,
      tagline: TAGLINE,
      footer_text: `${NAME} — ${CITY}`,
      signature_name: 'Authorised Signatory',
      signature_title: 'For ' + NAME,
    },
  });

  // ── 2. staff logins (username is GLOBALLY unique → namespace by code) ─────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const staff = [
    { role: 'admin', who: 'admin', name: 'Demo Admin' },
    { role: 'doctor', who: 'doctor', name: 'Dr. Rajesh Menon', specialty: 'General Medicine' },
    { role: 'receptionist', who: 'reception', name: 'Front Desk' },
    { role: 'pharmacist', who: 'pharmacy', name: 'Pharmacy Desk' },
    { role: 'finance', who: 'finance', name: 'Accounts' },
    { role: 'ipd_manager', who: 'ipd', name: 'IPD Manager' },
    { role: 'nurse', who: 'nurse', name: 'Nursing Station' },
  ];
  const users = {};
  for (const s of staff) {
    users[s.role] = await db.user.create({
      data: {
        username: `${SLUG}.${s.who}`,
        password: hash,
        role: s.role,
        name: s.name,
        specialty: s.specialty || null,
        email: `${s.who}@${SLUG}.demo`,
        organizationId: orgId,
        is_active: true,
      },
    });
  }
  const doctorName = users.doctor.name;

  // ── 3. wards + beds ──────────────────────────────────────────────────────
  const wardSpec = [
    { ward_name: 'General Ward', ward_type: 'General', cost_per_day: 2000, nursing_charge: 500, beds: 6 },
    { ward_name: 'Semi-Private', ward_type: 'Semi-Private', cost_per_day: 4500, nursing_charge: 800, beds: 4 },
    { ward_name: 'ICU', ward_type: 'ICU', cost_per_day: 12000, nursing_charge: 2500, beds: 4 },
  ];
  const wards = [];
  let bedNo = 0;
  for (const [wi, w] of wardSpec.entries()) {
    const ward = await db.wards.create({
      data: {
        ward_name: w.ward_name, ward_type: w.ward_type,
        cost_per_day: w.cost_per_day, nursing_charge: w.nursing_charge,
        floor_number: String(wi + 1), is_active: true, organizationId: orgId,
      },
    });
    const beds = [];
    for (let b = 1; b <= w.beds; b++) {
      const bed = await db.beds.create({
        data: {
          bed_id: `${CODE}-B-${pad(++bedNo)}`,
          bed_name: `${w.ward_type.slice(0, 3).toUpperCase()}-${b}`,
          ward_id: ward.ward_id,
          status: 'Available',
          bed_category: w.ward_type,
          organizationId: orgId,
        },
      });
      beds.push(bed);
    }
    wards.push({ ward, beds, spec: w });
  }

  // ── 4. price list (item_code is GLOBALLY unique) ──────────────────────────
  const services = [
    ['Consultation', 'OPD Consultation', 800, 'OPD'],
    ['Consultation', 'Specialist Consultation', 1200, 'OPD'],
    ['Lab', 'Complete Blood Count (CBC)', 450, 'Lab'],
    ['Lab', 'Lipid Profile', 900, 'Lab'],
    ['Lab', 'Liver Function Test', 1100, 'Lab'],
    ['Radiology', 'X-Ray Chest PA', 600, 'Radiology'],
    ['Radiology', 'Ultrasound Abdomen', 1800, 'Radiology'],
    ['Procedure', 'Dressing (Minor)', 400, 'Procedure'],
    ['Procedure', 'ECG', 350, 'Procedure'],
    ['Pharmacy', 'Pharmacy Consumables', 250, 'Pharmacy'],
  ];
  for (const [category, item_name, price, dept] of services) {
    await db.charge_catalog.create({
      data: {
        category,
        item_code: `${CODE}-${item_name.replace(/[^A-Za-z]/g, '').slice(0, 10).toUpperCase()}`,
        item_name, default_price: price, department: dept, service_category: category,
        tax_rate: 0, is_active: true, organizationId: orgId,
      },
    });
  }

  // ── 5. patients ──────────────────────────────────────────────────────────
  const patients = [];
  for (let i = 0; i < 16; i++) {
    const p = await db.oPD_REG.create({
      data: {
        patient_id: `${CODE}-${new Date().getFullYear()}-${pad(i + 1, 5)}`,
        full_name: name(i),
        age: String(18 + ((i * 7) % 60)),
        gender: i % 2 === 0 ? 'Male' : 'Female',
        phone: phone(i),
        address: CITY,
        department: 'General',
        organizationId: orgId,
        registration_consent: true,
        created_at: daysAgo(30 - i),
      },
    });
    patients.push(p);
  }

  // ── 6. OPD activity: finalized + paid bills spread over the last 3 weeks ──
  let opdSeq = 0;
  let opdCount = 0;
  for (let d = 20; d >= 0; d -= 2) {
    for (let k = 0; k < 2; k++) {
      const p = patients[(d + k) % patients.length];
      const svc = services[(d + k) % services.length];
      const amount = svc[2];
      const when = daysAgo(d, 10 + k * 3);
      const inv = await db.invoices.create({
        data: {
          invoice_number: `${CODE}-OPD-${FY}-${pad(++opdSeq)}`,
          patient_id: p.patient_id,
          invoice_type: 'OPD',
          status: 'Final',
          finalized_at: when,
          total_amount: amount, net_amount: amount,
          paid_amount: amount, balance_due: 0,
          doctor_name: doctorName,
          organizationId: orgId,
          created_at: when,
          items: {
            create: [{
              department: svc[3], description: svc[1], quantity: 1,
              unit_price: amount, total_price: amount, net_price: amount,
              service_category: svc[0], organizationId: orgId, created_at: when,
            }],
          },
        },
      });
      await db.payments.create({
        data: {
          receipt_number: nextReceipt(), invoice_id: inv.id, amount,
          payment_method: k % 2 === 0 ? 'Cash' : 'UPI', payment_type: 'Consultation',
          status: 'Completed', received_by: users.receptionist.username,
          organizationId: orgId, created_at: when,
        },
      });
      opdCount++;
    }
  }

  // ── 7. IPD: live admissions (numberless draft bills, charges accruing) ────
  let admSeq = 0;
  const newAdmissionId = () => `${CODE}-ADM-${FY}-${pad(++admSeq)}`;
  const liveAdmissions = [];
  for (let i = 0; i < 3; i++) {
    const w = wards[i % wards.length];
    const bed = w.beds[i];
    const p = patients[i];
    const admittedOn = daysAgo(3 - i, 9);
    const adm = await db.admissions.create({
      data: {
        admission_id: newAdmissionId(),
        patient_id: p.patient_id,
        bed_id: bed.bed_id,
        ward_id: w.ward.ward_id,
        status: 'Admitted',
        diagnosis: ['Acute Gastroenteritis', 'Community-Acquired Pneumonia', 'Dengue Fever'][i],
        doctor_name: doctorName,
        admission_type: 'Planned',
        organizationId: orgId,
        admission_date: admittedOn,
      },
    });
    await db.beds.update({ where: { bed_id: bed.bed_id }, data: { status: 'Occupied' } });

    // Draft bill — numberless until discharge (matches the new billing rule).
    const days = Math.max(1, 3 - i);
    const room = Number(w.spec.cost_per_day) * days;
    const nursing = Number(w.spec.nursing_charge) * days;
    const total = room + nursing + 450;
    await db.invoices.create({
      data: {
        invoice_number: null,
        patient_id: p.patient_id,
        admission_id: adm.admission_id,
        invoice_type: 'IPD',
        status: 'Draft',
        total_amount: total, net_amount: total, paid_amount: 0, balance_due: total,
        doctor_name: doctorName,
        organizationId: orgId,
        created_at: admittedOn,
        items: {
          create: [
            { department: 'Room', description: `${w.spec.ward_name} — Room Charge x${days}`, quantity: days, unit_price: w.spec.cost_per_day, total_price: room, net_price: room, service_category: 'Room', organizationId: orgId, created_at: admittedOn },
            { department: 'Nursing', description: `Nursing Charge x${days}`, quantity: days, unit_price: w.spec.nursing_charge, total_price: nursing, net_price: nursing, service_category: 'Nursing', organizationId: orgId, created_at: admittedOn },
            { department: 'Lab', description: 'Complete Blood Count (CBC)', quantity: 1, unit_price: 450, total_price: 450, net_price: 450, service_category: 'Lab', organizationId: orgId, created_at: admittedOn },
          ],
        },
      },
    });
    liveAdmissions.push(adm);
  }

  // ── 8. IPD: discharged + fully-paid (finalized, numbered) ────────────────
  let ipdSeq = 0;
  for (let i = 0; i < 2; i++) {
    const w = wards[0];
    const bed = w.beds[4 + i];
    const p = patients[6 + i];
    const admittedOn = daysAgo(12 - i * 3, 9);
    const dischargedOn = daysAgo(9 - i * 3, 16);
    const adm = await db.admissions.create({
      data: {
        admission_id: newAdmissionId(),
        patient_id: p.patient_id,
        bed_id: bed.bed_id,
        ward_id: w.ward.ward_id,
        status: 'Discharged',
        diagnosis: ['Appendicitis — post-op', 'Viral Fever'][i],
        doctor_name: doctorName,
        organizationId: orgId,
        admission_date: admittedOn,
        discharge_date: dischargedOn,
      },
    });
    const days = 3;
    const room = Number(w.spec.cost_per_day) * days;
    const nursing = Number(w.spec.nursing_charge) * days;
    const total = room + nursing + 1800;
    const inv = await db.invoices.create({
      data: {
        invoice_number: `${CODE}-IPD-${FY}-${pad(++ipdSeq)}`,
        patient_id: p.patient_id,
        admission_id: adm.admission_id,
        invoice_type: 'IPD',
        status: 'Final',
        finalized_at: dischargedOn,
        total_amount: total, net_amount: total, paid_amount: total, balance_due: 0,
        doctor_name: doctorName,
        organizationId: orgId,
        created_at: admittedOn,
        items: {
          create: [
            { department: 'Room', description: `${w.spec.ward_name} — Room Charge x${days}`, quantity: days, unit_price: w.spec.cost_per_day, total_price: room, net_price: room, service_category: 'Room', organizationId: orgId, created_at: admittedOn },
            { department: 'Nursing', description: `Nursing Charge x${days}`, quantity: days, unit_price: w.spec.nursing_charge, total_price: nursing, net_price: nursing, service_category: 'Nursing', organizationId: orgId, created_at: admittedOn },
            { department: 'Radiology', description: 'Ultrasound Abdomen', quantity: 1, unit_price: 1800, total_price: 1800, net_price: 1800, service_category: 'Radiology', organizationId: orgId, created_at: admittedOn },
          ],
        },
      },
    });
    await db.payments.create({
      data: {
        receipt_number: nextReceipt(), invoice_id: inv.id, amount: total,
        payment_method: 'UPI', payment_type: 'IPD Settlement', status: 'Completed',
        received_by: users.finance.username, organizationId: orgId, created_at: dischargedOn,
      },
    });
  }

  // ── 9. TPA story: provider + policy + a semi-discharged patient mid-claim ─
  const provider = await db.insurance_providers.create({
    data: {
      provider_name: `${NAME} — Star Health TPA`,
      provider_code: `${CODE}-STAR`,
      contact_email: 'claims@starhealth.demo',
      contact_phone: '18001234567',
      tpa_type: 'tpa',
      is_active: true,
      organizationId: orgId,
    },
  });

  const tpaPatient = patients[10];
  const policy = await db.insurance_policies.create({
    data: {
      patient_id: tpaPatient.patient_id,
      provider_id: provider.id,
      policy_number: `${CODE}-POL-0001`,
      policy_holder: tpaPatient.full_name,
      plan_name: 'Family Health Optima',
      policy_type: 'Individual',
      coverage_limit: 500000,
      remaining_limit: 500000,
      valid_from: daysAgo(300),
      valid_until: daysAgo(-65),
      status: 'Active',
      organizationId: orgId,
    },
  });

  // Semi discharged = Admitted + discharge_date set (see app/lib/admission-status.ts):
  // summary written, still in a bed, awaiting TPA approval. Bill stays Draft.
  const icu = wards[2];
  const tpaBed = icu.beds[3];
  const tpaAdmitted = daysAgo(5, 8);
  const tpaAdm = await db.admissions.create({
    data: {
      admission_id: newAdmissionId(),
      patient_id: tpaPatient.patient_id,
      bed_id: tpaBed.bed_id,
      ward_id: icu.ward.ward_id,
      status: 'Admitted',
      discharge_date: daysAgo(0, 11),
      diagnosis: 'Acute Coronary Syndrome',
      doctor_name: doctorName,
      organizationId: orgId,
      admission_date: tpaAdmitted,
    },
  });
  await db.beds.update({ where: { bed_id: tpaBed.bed_id }, data: { status: 'Occupied' } });

  const tpaDays = 5;
  const tpaRoom = Number(icu.spec.cost_per_day) * tpaDays;
  const tpaNursing = Number(icu.spec.nursing_charge) * tpaDays;
  const tpaTotal = tpaRoom + tpaNursing + 25000;
  const tpaInvoice = await db.invoices.create({
    data: {
      invoice_number: null, // Draft → numberless until full discharge
      patient_id: tpaPatient.patient_id,
      admission_id: tpaAdm.admission_id,
      invoice_type: 'IPD',
      status: 'Draft',
      billing_patient_type: 'tpa_insurance',
      tpa_provider_id: provider.id,
      tpa_claim_status: 'submitted',
      tpa_payable: tpaTotal,
      total_amount: tpaTotal, net_amount: tpaTotal, paid_amount: 0, balance_due: tpaTotal,
      doctor_name: doctorName,
      organizationId: orgId,
      created_at: tpaAdmitted,
      items: {
        create: [
          { department: 'Room', description: `ICU — Room Charge x${tpaDays}`, quantity: tpaDays, unit_price: icu.spec.cost_per_day, total_price: tpaRoom, net_price: tpaRoom, service_category: 'Room', organizationId: orgId, created_at: tpaAdmitted },
          { department: 'Nursing', description: `ICU Nursing x${tpaDays}`, quantity: tpaDays, unit_price: icu.spec.nursing_charge, total_price: tpaNursing, net_price: tpaNursing, service_category: 'Nursing', organizationId: orgId, created_at: tpaAdmitted },
          { department: 'Procedure', description: 'Coronary Angiography', quantity: 1, unit_price: 25000, total_price: 25000, net_price: 25000, service_category: 'Procedure', organizationId: orgId, created_at: tpaAdmitted },
        ],
      },
    },
  });

  await db.insurance_claims.create({
    data: {
      claim_number: `${CODE}-CLM-0001`,
      policy_id: policy.id,
      invoice_id: tpaInvoice.id,
      admission_id: tpaAdm.admission_id,
      claimed_amount: tpaTotal,
      status: 'Submitted',
      organizationId: orgId,
    },
  });

  // ── done ─────────────────────────────────────────────────────────────────
  console.log(`
✅ Demo tenant ready — "${NAME}" (${CODE})

  Login at /login
    admin      ${SLUG}.admin      / ${PASSWORD}
    doctor     ${SLUG}.doctor     / ${PASSWORD}
    reception  ${SLUG}.reception  / ${PASSWORD}
    finance    ${SLUG}.finance    / ${PASSWORD}
    pharmacy   ${SLUG}.pharmacy   / ${PASSWORD}
    ipd        ${SLUG}.ipd        / ${PASSWORD}
    nurse      ${SLUG}.nurse      / ${PASSWORD}

  Seeded: ${patients.length} patients · ${opdCount} paid OPD bills · 3 live IPD admissions
          2 discharged+settled IPD bills · 1 TPA patient (semi-discharged, claim submitted)
          ${wardSpec.length} wards / ${bedNo} beds · ${services.length} priced services

  Branding: ${PRIMARY} / ${SECONDARY}${LOGO ? ` · logo ${LOGO}` : ' · no logo (pass --logo URL)'}
  Every bill, portal header and discharge summary now carries "${NAME}".
`);
}

main()
  .catch((e) => { console.error('\nSeed failed:', e.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
