const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');
    const password = await bcrypt.hash('password123', 10);

    const users = [
        { username: 'admin', role: 'admin', name: 'Super Admin' },
        { username: 'doc1', role: 'doctor', name: 'Dr. Sarah Smith' },
        { username: 'recep1', role: 'receptionist', name: 'Ravi Receptionist' },
        { username: 'lab1', role: 'lab_technician', name: 'Amit Lab Tech' },
        { username: 'pharm1', role: 'pharmacist', name: 'Priya Pharmacist' },
    ];

    for (const u of users) {
        const user = await prisma.user.upsert({
            where: { username: u.username },
            update: {},
            create: {
                username: u.username,
                password: password,
                role: u.role,
                name: u.name,
            },
        });
        console.log(`Created user: ${user.username}`);
    }

    // Seed Lab Tests
    const tests = [
        { test_name: 'Lipid Profile', price: 500, is_available: true },
        { test_name: 'Complete Blood Count (CBC)', price: 300, is_available: true },
        { test_name: 'Dengue NS1 Antigen', price: 600, is_available: true },
        { test_name: 'Liver Function Test', price: 800, is_available: true },
    ];

    for (const t of tests) {
        await prisma.lab_test_inventory.upsert({
            where: { test_name: t.test_name },
            update: {},
            create: t,
        });
    }
    console.log('Seeded Lab Tests');

    // Seed Lab Staff
    const staff = [
        { name: 'Amit Singh', role: 'technician', is_on_shift: true },
        { name: 'Rahul Verma', role: 'technician', is_on_shift: true },
    ];

    for (const s of staff) {
        await prisma.lab_staff.create({ data: s });
    }
    console.log('Seeded Lab Staff');

    // Seed Medicines
    const medicines = [
        { brand_name: 'Dolo 650', generic_name: 'Paracetamol', price_per_unit: 2.0, min_threshold: 50 },
        { brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanate', price_per_unit: 15.0, min_threshold: 20 },
        { brand_name: 'Azithral 500', generic_name: 'Azithromycin', price_per_unit: 10.0, min_threshold: 15 },
        { brand_name: 'Pan 40', generic_name: 'Pantoprazole', price_per_unit: 5.0, min_threshold: 30 },
    ];

    for (const m of medicines) {
        const med = await prisma.pharmacy_medicine_master.upsert({
            where: { brand_name: m.brand_name },
            update: {},
            create: m,
        });

        // Create Initial Stock
        await prisma.pharmacy_batch_inventory.upsert({
            where: { batch_no: `BATCH-${m.brand_name.substring(0, 3).toUpperCase()}-001` },
            update: {},
            create: {
                medicine_id: med.id,
                batch_no: `BATCH-${m.brand_name.substring(0, 3).toUpperCase()}-001`,
                current_stock: 100,
                expiry_date: new Date('2026-12-31'),
                rack_location: 'A-01',
            },
        });
    }
    console.log('Seeded Medicines & Inventory');

    // Seed Initial Patient & Appointment
    try {
        const patientId = 'PAT-2026-0001';

        // 1. Create Patient (OPD_REG)
        // Check if exists
        const existing = await prisma.oPD_REG.findUnique({ where: { patient_id: patientId } });
        let patient;

        if (!existing) {
            patient = await prisma.oPD_REG.create({
                data: {
                    patient_id: patientId,
                    full_name: 'Rajesh Kumar',
                    phone: '9876543210',
                    department: 'Cardiology',
                    email: 'rajesh@example.com',
                    age: '45',
                    gender: 'Male',
                    aadhar_card: '1234-5678-9012'
                }
            });
            console.log('Created Patient:', patient.full_name);
        } else {
            patient = existing;
        }

        // 2. Create Appointment
        const appointmentId = 'APP-2026-0001';
        const existingAppt = await prisma.appointments.findUnique({ where: { appointment_id: appointmentId } });

        if (!existingAppt) {
            await prisma.appointments.create({
                data: {
                    appointment_id: appointmentId,
                    patient_id: patient.patient_id,
                    status: 'Scheduled',
                    reason_for_visit: 'Chest Pain',
                    department: 'Cardiology',
                    doctor_name: 'Dr. Sarah Smith'
                }
            });
            console.log('Created Appointment for Patient');
        }

        // 3. Create Lab Order
        const barcode = 'LAB-2026-0001';
        const existingOrder = await prisma.lab_orders.findUnique({ where: { barcode: barcode } });

        if (!existingOrder) {
            await prisma.lab_orders.create({
                data: {
                    barcode: barcode,
                    patient_id: patient.patient_id,
                    doctor_id: 'doc1',
                    test_type: 'Lipid Profile',
                    status: 'Pending',
                    assigned_technician_id: 'Amit Singh',
                    created_at: new Date(),
                }
            });
            console.log('Seeded Lab Order');
        }

    } catch (e) {
        console.error('Error seeding patient/clinical data:', e);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

