const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding SQLite database...');

    const defaultPassword = await bcrypt.hash('admin123', 10);

    // 1. Create Hospital
    const hospital = await prisma.hospital.upsert({
        where: { code: 'AVANI-001' },
        update: {},
        create: {
            name: 'Avani Main Hospital',
            code: 'AVANI-001',
            address: 'Tech Park, New Delhi',
            phone: '+91 9876543210'
        }
    });

    // 2. Create Users for all roles
    const roles = ['admin', 'doctor', 'receptionist', 'lab_technician', 'pharmacist', 'finance', 'ipd_manager'];

    for (const role of roles) {
        await prisma.user.upsert({
            where: { username: role },
            update: {},
            create: {
                username: role,
                password: defaultPassword,
                role: role,
                name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
                specialty: role === 'doctor' ? 'Cardiology' : null,
                hospital_id: hospital.id,
                is_active: true
            }
        });
    }

    console.log('✅ Created default users for roles: ' + roles.join(', '));
    console.log('✅ Setup complete. You can login with username: (role) and password: admin123');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
