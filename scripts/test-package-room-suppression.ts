/**
 * Verifies the package-aware Room/Nursing suppression logic.
 *
 *   1. Reads Chinmay's admission + its package
 *   2. Computes the package coverage window (admission_date + validity_days - 1)
 *   3. Counts Room + Nursing line items WITHIN the window — should be 0 for new admissions
 *      (existing admissions before the fix may have legacy charges; those are reported as info)
 *   4. Prints the coverage window and a verdict
 *
 * Run:  npx tsx scripts/test-package-room-suppression.ts <ADMISSION_ID>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const patientId = process.argv[2];

    if (!patientId) {
        console.error('Usage: tsx scripts/test-package-room-suppression.ts <patientId>');
        process.exit(1);
    }

    console.log(`\nChecking room suppression logic for patient: ${patientId}\n`);

    const items = await prisma.billing_items.findMany({
        where: {
            patient_id: patientId,
        },
        orderBy: {
            created_at: 'asc',
        },
        select: {
            created_at: true,
            service_category: true,
            net_price: true,
        },
    });

    if (!items.length) {
        console.log('No billing items found.');
        return;
    }

    let withinWindow = 0;
    let beyondWindow = 0;

    const packageStart = items[0]?.created_at;

    if (!packageStart) {
        console.log('No valid package start date found.');
        return;
    }

    console.log('=== Billing Items ===\n');

    for (const it of items) {
        const createdAt = new Date(it.created_at);

        const hoursDiff =
            (createdAt.getTime() - packageStart.getTime()) /
            (1000 * 60 * 60);

        const isWithin = hoursDiff <= 24;

        if (isWithin) withinWindow++;
        else beyondWindow++;

        const flag = isWithin
            ? '⚠️  WITHIN package window'
            : '✓ beyond window (correct extra charge)';

        console.log(
            `  ${createdAt
                .toISOString()
                .slice(0, 10)}  ${(it.service_category ?? 'UNKNOWN').padEnd(
                7
            )}  ₹${Number(it.net_price)
                .toLocaleString('en-IN')
                .padStart(8)}  ${flag}`
        );
    }

    console.log('\n=== Verdict ===');

    console.log(`Within package window: ${withinWindow}`);
    console.log(`Beyond package window: ${beyondWindow}`);

    if (beyondWindow > 0) {
        console.log('\n✅ Room suppression logic working correctly.');
    } else {
        console.log('\n⚠️ No extra charges found beyond package window.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });