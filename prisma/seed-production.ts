const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ORG_ID = 'org-axten-production';

async function main() {
    if (!process.env.ALLOW_SEED) {
        console.error('Set ALLOW_SEED=1 to run this script.');
        process.exit(1);
    }

    console.log('=== Axten Hospitals — Production Seed ===\n');

    // ── Organization ────────────────────────────────────────────
    const org = await prisma.organization.upsert({
        where: { id: ORG_ID },
        update: { name: 'Axten Hospitals' },
        create: {
            id: ORG_ID,
            name: 'Axten Hospitals',
            slug: 'axten',
            code: 'AXT',
            address: 'Axten Hospitals',
            phone: '+91 80000 00000',
            email: 'admin@axtenhospitals.com',
            license_no: '',
            plan: 'enterprise',
            is_active: true,
        },
    });
    console.log(`✓ Organization: ${org.name} (${org.id})`);

    await prisma.organizationConfig.upsert({
        where: { organizationId: ORG_ID },
        update: {},
        create: {
            organizationId: ORG_ID,
            uhid_prefix: 'AXT',
            enable_ai_triage: true,
        },
    });

    await prisma.organizationBranding.upsert({
        where: { organizationId: ORG_ID },
        update: {},
        create: {
            organizationId: ORG_ID,
            portal_title: 'Axten Hospitals',
            portal_subtitle: 'A Unit of TAH Global Healthcare Pvt. Ltd.',
            primary_color: '#1e3a6e',
            secondary_color: '#1e3a6e',
            logo_url: '',
            footer_text: '© 2026 Axten Hospitals. A Unit of TAH Global Healthcare Pvt. Ltd. All rights reserved.',
        },
    });
    console.log('✓ Organization config & branding created\n');

    // ── Super Admin (Kapil) ─────────────────────────────────────
    const saPassword = await bcrypt.hash('Kapil@31', 10);
    await prisma.superAdmin.upsert({
        where: { email: 'kapil@axtenhospitals.com' },
        update: {},
        create: {
            email: 'kapil@axtenhospitals.com',
            password: saPassword,
            name: 'Kapil',
            is_active: true,
        },
    });
    console.log('✓ Super Admin: Kapil (email: kapil@axtenhospitals.com / pass: Kapil@31)\n');

    // ── Staff Users ─────────────────────────────────────────────
    const users = [
        // Management
        {
            username: 'gauttam',
            password: 'Gauttam@31',
            role: 'admin',
            name: 'Gauttam',
            email: 'Gauttam@axtenhospitals.com',
            department: 'Management',
            description: 'SuperAdmin - Full access of the software',
        },
        // Admin
        {
            username: 'yatin',
            password: 'Yatin@31',
            role: 'admin',
            name: 'Yatin',
            email: 'Yatin@axtenhospitals.com',
            department: 'Admin',
            description: 'Admin access, no deletion',
        },
        {
            username: 'satish',
            password: 'Satish@31',
            role: 'admin',
            name: 'Satish',
            email: 'Satish@axtenhospitals.com',
            department: 'Admin',
            description: 'Admin access, no deletion',
        },
        // Finance
        {
            username: 'mukesh',
            password: 'Mukesh@31',
            role: 'finance',
            name: 'Mukesh',
            email: 'finance@axtenhospitals.com',
            department: 'Finance',
            description: 'Full Finance module + reporting',
        },
        {
            username: 'naresh',
            password: 'Naresh@31',
            role: 'finance',
            name: 'Naresh',
            email: 'naresh@axtenhospitals.com',
            department: 'Finance',
            description: 'Full Finance module + reporting',
        },
        {
            username: 'nitish',
            password: 'Nitish@31',
            role: 'finance',
            name: 'Nitish',
            email: 'nitish@axtenhospitals.com',
            department: 'Finance',
            description: 'Full Finance module + reporting',
        },
        // Billing
        {
            username: 'pooja',
            password: 'Pooja@31',
            role: 'receptionist',
            name: 'Pooja',
            email: 'pooja@axtenhospitals.com',
            department: 'Billing',
            description: 'Billing and TPA access',
        },
        {
            username: 'akansha',
            password: 'Akansha@31',
            role: 'receptionist',
            name: 'Akansha',
            email: 'akansha@axtenhospitals.com',
            department: 'Billing',
            description: 'Billing and TPA access',
        },
        {
            username: 'divya',
            password: 'Divya@31',
            role: 'receptionist',
            name: 'Divya',
            email: 'divya@axtenhospitals.com',
            department: 'Billing',
            description: 'Billing and TPA access',
        },
        // IT
        {
            username: 'mohit',
            password: 'Mohit@31',
            role: 'admin',
            name: 'Mohit',
            email: 'mohit@axtenhospitals.com',
            department: 'IT',
            description: 'Full software access, no deletion',
        },
        {
            username: 'alok',
            password: 'Alok@31',
            role: 'admin',
            name: 'Alok',
            email: 'alok@axtenhospitals.com',
            department: 'IT',
            description: 'Full software access, no deletion',
        },
        // TPA
        {
            username: 'sandeep',
            password: 'Sandeep@31',
            role: 'receptionist',
            name: 'Sandeep',
            email: 'sandeep@axtenhospitals.com',
            department: 'TPA',
            description: 'Billing and TPA access',
        },
    ];

    console.log('--- Staff Users ---');
    for (const u of users) {
        const hashed = await bcrypt.hash(u.password, 10);
        await prisma.user.upsert({
            where: { username: u.username },
            update: { name: u.name, email: u.email, role: u.role },
            create: {
                username: u.username,
                password: hashed,
                role: u.role,
                name: u.name,
                email: u.email,
                organizationId: ORG_ID,
                is_active: true,
            },
        });
        console.log(`✓ ${u.name.padEnd(10)} | ${u.username.padEnd(10)} | ${u.password.padEnd(14)} | ${u.role.padEnd(14)} | ${u.department}`);
    }

    console.log('\n=== Seed Complete ===\n');
    console.log('Login Credentials Summary:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('SUPER ADMIN PANEL (/superadmin/login):');
    console.log('  Email: kapil@axtenhospitals.com');
    console.log('  Pass:  Kapil@31');
    console.log('');
    console.log('STAFF LOGIN (/login):');
    console.log('─────────────────────────────────────────────────────────');
    for (const u of users) {
        console.log(`  ${u.name.padEnd(10)} → username: ${u.username.padEnd(10)} | pass: ${u.password}`);
    }
    console.log('─────────────────────────────────────────────────────────');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

export {};
