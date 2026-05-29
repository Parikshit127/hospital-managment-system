/**
 * Seed pharmacy-specific permissions into the Permission table.
 * Run: npx tsx scripts/seed-pharmacy-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PHARMACY_PERMISSIONS = [
    { key: 'pharmacy.view', module: 'pharmacy', action: 'view', label: 'View Pharmacy', description: 'View pharmacy dashboard, inventory, and orders' },
    { key: 'pharmacy.dispense', module: 'pharmacy', action: 'create', label: 'Dispense Medicines', description: 'Dispense prescriptions to patients' },
    { key: 'pharmacy.otc_sale', module: 'pharmacy', action: 'create', label: 'OTC Counter Sales', description: 'Process walk-in OTC sales' },
    { key: 'pharmacy.procurement.create', module: 'pharmacy', action: 'create', label: 'Create Purchase Orders', description: 'Create and submit purchase orders' },
    { key: 'pharmacy.procurement.approve', module: 'pharmacy', action: 'approve', label: 'Approve Purchase Orders', description: 'Approve or reject submitted purchase orders' },
    { key: 'pharmacy.receive', module: 'pharmacy', action: 'create', label: 'Receive GRN', description: 'Receive goods against purchase orders' },
    { key: 'pharmacy.adjust_stock', module: 'pharmacy', action: 'edit', label: 'Adjust Stock', description: 'Manual stock adjustments with reason and audit trail' },
    { key: 'pharmacy.controlled_dispense', module: 'pharmacy', action: 'create', label: 'Dispense Controlled Drugs', description: 'Dispense narcotic and scheduled substances' },
    { key: 'pharmacy.invoice.create', module: 'pharmacy', action: 'create', label: 'Create Purchase Invoice', description: 'Create supplier purchase invoices' },
    { key: 'pharmacy.invoice.post', module: 'pharmacy', action: 'approve', label: 'Post Purchase Invoice', description: 'Post purchase invoices to GL and GST' },
    { key: 'pharmacy.payment', module: 'pharmacy', action: 'create', label: 'Record Supplier Payment', description: 'Record payments against supplier invoices' },
    { key: 'pharmacy.returns', module: 'pharmacy', action: 'create', label: 'Process Returns', description: 'Process patient, supplier, and expiry returns' },
    { key: 'pharmacy.reports', module: 'pharmacy', action: 'view', label: 'View Pharmacy Reports', description: 'View stock ledger, margins, controlled drug reports' },
    { key: 'pharmacy.master.edit', module: 'pharmacy', action: 'edit', label: 'Edit Medicine Master', description: 'Add/edit medicines in the master catalog' },
];

async function main() {
    let created = 0, skipped = 0;
    for (const perm of PHARMACY_PERMISSIONS) {
        const existing = await prisma.permission.findUnique({ where: { key: perm.key } });
        if (existing) {
            skipped++;
            console.log(`  skip: ${perm.key}`);
        } else {
            await prisma.permission.create({ data: perm });
            created++;
            console.log(`  ✓ ${perm.key}`);
        }
    }
    console.log(`\nDone: ${created} created, ${skipped} skipped`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
