import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  orgsProcessed: number;
  invoicesProcessed: number;
  invoicesSkipped: number;
  invoicesCreated: number;
  expensesProcessed: number;
  expensesSkipped: number;
  expensesCreated: number;
  errors: string[];
}

async function migrateGstRegister(dryRun: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    orgsProcessed: 0,
    invoicesProcessed: 0,
    invoicesSkipped: 0,
    invoicesCreated: 0,
    expensesProcessed: 0,
    expensesSkipped: 0,
    expensesCreated: 0,
    errors: [],
  };

  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      organization_gstin: true,
    },
  });

  console.log(`Found ${organizations.length} organization(s) to process.`);

  for (const org of organizations) {
    console.log(`\nProcessing org: ${org.name} (${org.id})`);
    stats.orgsProcessed++;

    // ── Outward supplies: invoices with any GST ──────────────────────────────
    const invoices = await prisma.invoices.findMany({
      where: {
        organizationId: org.id,
        OR: [
          { cgst_amount: { gt: 0 } },
          { sgst_amount: { gt: 0 } },
          { igst_amount: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        invoice_number: true,
        invoice_type: true,
        total_amount: true,
        net_amount: true,
        total_tax: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        is_inter_state: true,
        created_at: true,
        organizationId: true,
      },
    });

    console.log(`  Invoices with GST: ${invoices.length}`);

    for (const inv of invoices) {
      stats.invoicesProcessed++;
      const invoiceIdStr = String(inv.id);

      // Skip if already registered
      const existing = await prisma.gST_Invoice_Register.findFirst({
        where: {
          organizationId: org.id,
          invoice_id: invoiceIdStr,
          transaction_type: 'Outward',
        },
        select: { id: true },
      });

      if (existing) {
        stats.invoicesSkipped++;
        continue;
      }

      const taxableAmount = inv.net_amount.sub(inv.total_tax);
      const totalTax = inv.cgst_amount.add(inv.sgst_amount).add(inv.igst_amount);

      if (!dryRun) {
        try {
          await prisma.gST_Invoice_Register.create({
            data: {
              organizationId: org.id,
              invoice_id: invoiceIdStr,
              transaction_type: 'Outward',
              invoice_number: inv.invoice_number,
              invoice_date: inv.created_at,
              gstin_supplier: org.organization_gstin ?? null,
              gstin_recipient: null,
              recipient_name: null,
              recipient_state: null,
              place_of_supply: null,
              is_inter_state: inv.is_inter_state,
              reverse_charge: false,
              invoice_type: 'Regular',
              taxable_amount: taxableAmount,
              cgst_amount: inv.cgst_amount,
              sgst_amount: inv.sgst_amount,
              igst_amount: inv.igst_amount,
              cess_amount: 0,
              total_tax: totalTax,
              total_invoice_value: inv.net_amount,
              hsn_sac_code: null,
              gst_rate: null,
              itc_eligibility: null,
              itc_claimed_cgst: 0,
              itc_claimed_sgst: 0,
              itc_claimed_igst: 0,
              filed_in_gstr1: false,
              filed_in_gstr2: false,
              filing_period: null,
            },
          });
          stats.invoicesCreated++;
        } catch (err) {
          const msg = `Invoice #${inv.invoice_number}: ${err instanceof Error ? err.message : String(err)}`;
          stats.errors.push(msg);
          console.error(`  ERROR: ${msg}`);
        }
      } else {
        console.log(`  [DRY RUN] Would create Outward GST entry for invoice ${inv.invoice_number}`);
        stats.invoicesCreated++;
      }
    }

    // ── Inward supplies: expenses with any GST ───────────────────────────────
    const expenses = await prisma.expense.findMany({
      where: {
        organizationId: org.id,
        OR: [
          { cgst_amount: { gt: 0 } },
          { sgst_amount: { gt: 0 } },
          { igst_amount: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        expense_number: true,
        amount: true,
        total_amount: true,
        tax_amount: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        gst_rate: true,
        hsn_sac_code: true,
        vendor_gstin: true,
        is_inter_state: true,
        created_at: true,
        organizationId: true,
      },
    });

    console.log(`  Expenses with GST: ${expenses.length}`);

    for (const exp of expenses) {
      stats.expensesProcessed++;
      const expenseIdStr = String(exp.id);

      // Skip if already registered
      const existing = await prisma.gST_Invoice_Register.findFirst({
        where: {
          organizationId: org.id,
          expense_id: expenseIdStr,
          transaction_type: 'Inward',
        },
        select: { id: true },
      });

      if (existing) {
        stats.expensesSkipped++;
        continue;
      }

      const cgst = exp.cgst_amount ?? 0;
      const sgst = exp.sgst_amount ?? 0;
      const igst = exp.igst_amount ?? 0;
      // Use Prisma Decimal arithmetic to avoid JS float issues
      const totalTax = exp.tax_amount;

      if (!dryRun) {
        try {
          await prisma.gST_Invoice_Register.create({
            data: {
              organizationId: org.id,
              expense_id: expenseIdStr,
              transaction_type: 'Inward',
              invoice_number: exp.expense_number,
              invoice_date: exp.created_at,
              gstin_supplier: exp.vendor_gstin ?? null,
              gstin_recipient: org.organization_gstin ?? null,
              recipient_name: null,
              recipient_state: null,
              place_of_supply: null,
              is_inter_state: exp.is_inter_state,
              reverse_charge: false,
              invoice_type: 'Regular',
              taxable_amount: exp.amount,
              cgst_amount: cgst,
              sgst_amount: sgst,
              igst_amount: igst,
              cess_amount: 0,
              total_tax: totalTax,
              total_invoice_value: exp.total_amount,
              hsn_sac_code: exp.hsn_sac_code ?? null,
              gst_rate: exp.gst_rate ?? null,
              itc_eligibility: 'Eligible',
              itc_claimed_cgst: 0,
              itc_claimed_sgst: 0,
              itc_claimed_igst: 0,
              filed_in_gstr1: false,
              filed_in_gstr2: false,
              filing_period: null,
            },
          });
          stats.expensesCreated++;
        } catch (err) {
          const msg = `Expense #${exp.expense_number}: ${err instanceof Error ? err.message : String(err)}`;
          stats.errors.push(msg);
          console.error(`  ERROR: ${msg}`);
        }
      } else {
        console.log(`  [DRY RUN] Would create Inward GST entry for expense ${exp.expense_number}`);
        stats.expensesCreated++;
      }
    }
  }

  return stats;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE — no records will be written ===\n');
  } else {
    console.log('=== LIVE MODE — writing to database ===\n');
  }

  const stats = await migrateGstRegister(dryRun);

  console.log('\n========== Migration Summary ==========');
  console.log(`Organizations processed : ${stats.orgsProcessed}`);
  console.log(`Invoices processed      : ${stats.invoicesProcessed}`);
  console.log(`  - Skipped (exists)    : ${stats.invoicesSkipped}`);
  console.log(`  - Created             : ${stats.invoicesCreated}`);
  console.log(`Expenses processed      : ${stats.expensesProcessed}`);
  console.log(`  - Skipped (exists)    : ${stats.expensesSkipped}`);
  console.log(`  - Created             : ${stats.expensesCreated}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
  } else {
    console.log('\nMigration completed successfully.');
  }
}

if (require.main === module) {
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
