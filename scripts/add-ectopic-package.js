/**
 * Add ECTOPIC PREGNANCY (SALPINGECTOMY) package to Axten database.
 * Run: node scripts/add-ectopic-package.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ORG_ID = 'org-axten-production';
    const PKG_CODE = 'PKG-ECTOPIC-SALP';

    // Check if already exists
    const existing = await prisma.ipdPackage.findFirst({
        where: { package_code: PKG_CODE, organizationId: ORG_ID },
    });
    if (existing) {
        console.log('Package already exists:', existing.id, existing.package_name);
        return;
    }

    const pkg = await prisma.ipdPackage.create({
        data: {
            package_code: PKG_CODE,
            package_name: 'ECTOPIC PREGNANCY (SALPINGECTOMY)',
            total_amount: 72000,
            validity_days: 7,
            is_active: true,
            organizationId: ORG_ID,
            inclusions: [
                { name: 'Haematology', qty: 1, amount: 550 },
                { name: 'Lab', qty: 1, amount: 1550 },
                { name: 'Biochemistry', qty: 1, amount: 950 },
                { name: 'Miscellaneous', qty: 1, amount: 3000 },
                { name: 'Medical Management', qty: 1, amount: 2000 },
                { name: 'Pharmacy', qty: 1, amount: 10035 },
            ],
            exclusions: [],
        },
    });

    console.log('Package created successfully!');
    console.log('  ID:', pkg.id);
    console.log('  Code:', pkg.package_code);
    console.log('  Name:', pkg.package_name);
    console.log('  Amount: ₹' + Number(pkg.total_amount).toLocaleString('en-IN'));
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
